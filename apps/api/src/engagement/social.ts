import crypto from 'crypto';
import { achievements, db, endUsers, getAuthSecret, friendships, kudos, leagueMembers, leagues, leagueSeasons, projects, userAchievements, userXpBalances } from '@gami/database';
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { friendCircle, resolveEndUserId } from '../leaderboards/index.js';

export const KUDOS_PER_DAY = 30;

export class SocialError extends Error {
  constructor(
    public readonly code: 'SELF' | 'NOT_FOUND' | 'LIMIT' | 'ALREADY_SENT' | 'TOO_MANY_FRIENDS',
    message: string,
    public readonly status = 409
  ) {
    super(message);
  }
}

export const MAX_FRIENDS = 500;

export function sendSocialError(reply: FastifyReply, err: unknown) {
  if (err instanceof SocialError) return reply.status(err.status).send({ error: err.code, code: err.code, message: err.message });
  throw err;
}

/** Friendship goes both ways, so it is stored both ways. Adding twice is harmless. */
export async function addFriend(projectId: string, userId: string, friendId: string): Promise<void> {
  if (userId === friendId) throw new SocialError('SELF', 'You cannot add yourself as a friend', 400);
  const [mine] = await db.select({ total: count() }).from(friendships).where(and(eq(friendships.projectId, projectId), eq(friendships.userId, userId)));
  if ((mine?.total ?? 0) >= MAX_FRIENDS) throw new SocialError('TOO_MANY_FRIENDS', `A player can have at most ${MAX_FRIENDS} friends`);
  await db
    .insert(friendships)
    .values([
      { id: `frd_${crypto.randomUUID()}`, projectId, userId, friendId },
      { id: `frd_${crypto.randomUUID()}`, projectId, userId: friendId, friendId: userId },
    ])
    .onConflictDoNothing();
}

export async function removeFriend(projectId: string, userId: string, friendId: string): Promise<void> {
  await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.projectId, projectId),
        sql`((${friendships.userId} = ${userId} AND ${friendships.friendId} = ${friendId}) OR (${friendships.userId} = ${friendId} AND ${friendships.friendId} = ${userId}))`
      )
    );
}

export async function listFriends(projectId: string, userId: string) {
  return db
    .select({ id: endUsers.id, externalId: endUsers.externalId, name: endUsers.name, avatarUrl: endUsers.avatarUrl, totalXp: sql<number>`COALESCE(${userXpBalances.totalXp}, 0)::int` })
    .from(friendships)
    .innerJoin(endUsers, eq(endUsers.id, friendships.friendId))
    .leftJoin(userXpBalances, and(eq(userXpBalances.projectId, endUsers.projectId), eq(userXpBalances.userId, endUsers.id)))
    .where(and(eq(friendships.projectId, projectId), eq(friendships.userId, userId), eq(endUsers.active, true)))
    .orderBy(desc(sql`COALESCE(${userXpBalances.totalXp}, 0)`));
}

/** A thank-you between players. One per person per day, and at most a few dozen a day in all, so it stays meaningful. */
export async function giveKudos(projectId: string, fromUserId: string, toUserId: string, message?: string | null) {
  if (fromUserId === toUserId) throw new SocialError('SELF', 'You cannot give yourself kudos', 400);
  const since = new Date(Date.now() - 86_400_000);
  return db.transaction(async (tx) => {
    // Serialise one sender's kudos so the daily limit holds under concurrent requests.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`kudos:${fromUserId}`}))`);
    const [sent] = await tx.select({ total: count() }).from(kudos).where(and(eq(kudos.projectId, projectId), eq(kudos.fromUserId, fromUserId), gte(kudos.createdAt, since)));
    if ((sent?.total ?? 0) >= KUDOS_PER_DAY) throw new SocialError('LIMIT', `You can give at most ${KUDOS_PER_DAY} kudos a day`, 429);
    const [same] = await tx
      .select({ total: count() })
      .from(kudos)
      .where(and(eq(kudos.projectId, projectId), eq(kudos.fromUserId, fromUserId), eq(kudos.toUserId, toUserId), gte(kudos.createdAt, since)));
    if ((same?.total ?? 0) > 0) throw new SocialError('ALREADY_SENT', 'You already gave this person kudos today');
    const [created] = await tx
      .insert(kudos)
      .values({ id: `kdo_${crypto.randomUUID()}`, projectId, fromUserId, toUserId, message: message?.trim().slice(0, 280) || null })
      .returning();
    return created!;
  });
}

export interface FeedItem {
  type: 'achievement' | 'kudos' | 'promotion';
  at: string;
  userId: string;
  name: string | null;
  title: string;
  detail: string | null;
}

/** What a group of people did lately: badges earned, kudos received, and league promotions. Newest first. */
export async function activityFeed(projectId: string, userIds: string[], limit = 30): Promise<FeedItem[]> {
  if (userIds.length === 0) return [];
  const [earned, thanked, promoted] = await Promise.all([
    db
      .select({ at: userAchievements.awardedAt, userId: endUsers.id, name: endUsers.name, title: achievements.name, detail: achievements.description })
      .from(userAchievements)
      .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
      .innerJoin(endUsers, eq(endUsers.id, userAchievements.userId))
      .where(and(eq(userAchievements.projectId, projectId), inArray(userAchievements.userId, userIds), eq(endUsers.active, true)))
      .orderBy(desc(userAchievements.awardedAt))
      .limit(limit),
    db
      .select({ at: kudos.createdAt, userId: kudos.toUserId, name: endUsers.name, from: sql<string | null>`(SELECT f.name FROM ${endUsers} f WHERE f.id = ${kudos.fromUserId})`, message: kudos.message })
      .from(kudos)
      .innerJoin(endUsers, eq(endUsers.id, kudos.toUserId))
      .where(and(eq(kudos.projectId, projectId), inArray(kudos.toUserId, userIds)))
      .orderBy(desc(kudos.createdAt))
      .limit(limit),
    db
      .select({ at: leagueSeasons.closedAt, userId: endUsers.id, name: endUsers.name, tier: leagueMembers.tier, tiers: leagues.tiers, league: leagues.name })
      .from(leagueMembers)
      .innerJoin(leagueSeasons, eq(leagueSeasons.id, leagueMembers.seasonId))
      .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
      .innerJoin(endUsers, eq(endUsers.id, leagueMembers.userId))
      .where(and(eq(leagueMembers.projectId, projectId), inArray(leagueMembers.userId, userIds), eq(leagueMembers.outcome, 'promoted')))
      .orderBy(desc(leagueSeasons.closedAt))
      .limit(limit),
  ]);

  const items: FeedItem[] = [
    ...earned.map((row) => ({ type: 'achievement' as const, at: row.at.toISOString(), userId: row.userId, name: row.name, title: `Earned ${row.title}`, detail: row.detail })),
    ...thanked.map((row) => ({ type: 'kudos' as const, at: row.at.toISOString(), userId: row.userId, name: row.name, title: `Got kudos${row.from ? ` from ${row.from}` : ''}`, detail: row.message })),
    ...promoted
      .filter((row) => row.at)
      .map((row) => ({ type: 'promotion' as const, at: row.at!.toISOString(), userId: row.userId, name: row.name, title: `Moved up to ${row.tiers[row.tier + 1] ?? 'the next tier'}`, detail: row.league })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ---------- Share cards ----------

function shareKey(): Buffer {
  return crypto.createHash('sha256').update(`share-cards:${getAuthSecret()}`).digest();
}

/**
 * A link anyone can open that shows a player's achievement as an image. It names only the award,
 * not the player, and the signature covers the project too, so it cannot be edited or guessed.
 * It is kept short because route parameters are limited to 100 characters.
 */
export function shareToken(projectId: string, userAchievementId: string): string {
  return `${userAchievementId}.${shareSignature(projectId, userAchievementId)}`;
}

function shareSignature(projectId: string, userAchievementId: string): string {
  return crypto.createHmac('sha256', shareKey()).update(`${projectId}:${userAchievementId}`).digest('base64url').slice(0, 22);
}

function readShareToken(token: string): { id: string; sig: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  return { id: token.slice(0, dot), sig: token.slice(dot + 1) };
}

function validShare(projectId: string, id: string, sig: string): boolean {
  const expected = shareSignature(projectId, id);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

const escapeXml = (text: string) => text.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]!);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function renderShareCard(card: { player: string; title: string; description: string | null; project: string; date: Date }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(`${card.player} earned ${card.title}`)}">
  <rect width="1200" height="630" fill="#0b0b0f"/>
  <rect x="40" y="40" width="1120" height="550" fill="none" stroke="#f97316" stroke-width="4"/>
  <text x="90" y="150" fill="#a1a1aa" font-family="Helvetica, Arial, sans-serif" font-size="34">${escapeXml(clip(card.player, 40))} earned</text>
  <text x="90" y="270" fill="#fafafa" font-family="Helvetica, Arial, sans-serif" font-size="88" font-weight="700">${escapeXml(clip(card.title, 24))}</text>
  ${card.description ? `<text x="90" y="350" fill="#d4d4d8" font-family="Helvetica, Arial, sans-serif" font-size="36">${escapeXml(clip(card.description, 60))}</text>` : ''}
  <text x="90" y="530" fill="#f97316" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="700">${escapeXml(clip(card.project, 40))}</text>
  <text x="1110" y="530" text-anchor="end" fill="#71717a" font-family="Helvetica, Arial, sans-serif" font-size="28">${card.date.toISOString().slice(0, 10)}</text>
</svg>`;
}

export async function socialRoutes(fastify: FastifyInstance) {
  const user = async (projectId: string, ref: string, reply: FastifyReply) => {
    const id = await resolveEndUserId(projectId, ref);
    if (!id) reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    return id;
  };

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/friends', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const id = await user(projectId, request.params.userId, reply);
    if (!id) return;
    return reply.send({ data: await listFriends(projectId, id) });
  });

  fastify.post<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/friends', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = z.object({ friendId: z.string().min(1).max(256) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: 'Send friendId, the other person\'s ID' });
    const id = await user(projectId, request.params.userId, reply);
    if (!id) return;
    const friend = await user(projectId, parsed.data.friendId, reply);
    if (!friend) return;
    try {
      await addFriend(projectId, id, friend);
    } catch (err) {
      return sendSocialError(reply, err);
    }
    return reply.status(201).send({ friends: true });
  });

  fastify.delete<{ Params: { projectId: string; userId: string; friendId: string } }>('/api/projects/:projectId/users/:userId/friends/:friendId', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const id = await user(projectId, request.params.userId, reply);
    if (!id) return;
    const friend = await user(projectId, request.params.friendId, reply);
    if (!friend) return;
    await removeFriend(projectId, id, friend);
    return reply.status(204).send();
  });

  fastify.post<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/kudos', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = z.object({ to: z.string().min(1).max(256), message: z.string().max(280).optional() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: 'Send `to`, the receiver\'s ID, and an optional message' });
    const from = await user(projectId, request.params.userId, reply);
    if (!from) return;
    const to = await user(projectId, parsed.data.to, reply);
    if (!to) return;
    try {
      return reply.status(201).send(await giveKudos(projectId, from, to, parsed.data.message));
    } catch (err) {
      return sendSocialError(reply, err);
    }
  });

  fastify.get<{ Params: { projectId: string; userId: string }; Querystring: { limit?: string } }>('/api/projects/:projectId/users/:userId/feed', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const id = await user(projectId, request.params.userId, reply);
    if (!id) return;
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 30));
    return reply.send({ data: await activityFeed(projectId, await friendCircle(projectId, id), limit) });
  });

  // Public: the image behind a share link. The token is signed, so it cannot be guessed or altered.
  fastify.get<{ Params: { token: string } }>('/share/:token', async (request, reply) => {
    const parsed = readShareToken(request.params.token.replace(/\.svg$/, ''));
    if (!parsed) return reply.status(404).send({ error: 'Not Found', message: 'This share link is not valid' });
    const [row] = await db
      .select({ projectId: userAchievements.projectId, player: endUsers.name, title: achievements.name, description: achievements.description, project: projects.name, date: userAchievements.awardedAt, active: endUsers.active })
      .from(userAchievements)
      .innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
      .innerJoin(endUsers, eq(endUsers.id, userAchievements.userId))
      .innerJoin(projects, eq(projects.id, userAchievements.projectId))
      .where(eq(userAchievements.id, parsed.id));
    if (!row || !row.active || !validShare(row.projectId, parsed.id, parsed.sig)) return reply.status(404).send({ error: 'Not Found', message: 'This share link is not valid' });
    return reply
      .header('content-type', 'image/svg+xml; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
      .send(renderShareCard({ player: row.player || 'A player', title: row.title, description: row.description, project: row.project, date: row.date }));
  });
}
