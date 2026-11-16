import { db, endUsers, kudos, referralCodes, userAchievements } from '@gami/database';
import { claimReferral, referralCodeFor } from '@gami/rewards';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { leaguesForUser } from '../engagement/leagues.js';
import { referralSummary, sendReferralError } from '../engagement/referrals.js';
import { acceptFriendRequest, activityFeed, dropFriendRequest, giveKudos, incomingFriendRequests, listFriends, removeFriend, requestFriend, sendSocialError, shareUrl } from '../engagement/social.js';
import { friendCircle } from '../leaderboards/index.js';
import { authenticateEndUser } from './end-user.js';

/**
 * Player-facing social routes. Players find each other by invite code, never by your IDs, so a
 * token holder cannot look people up or learn anything they were not shown.
 */
export async function endUserSocialRoutes(fastify: FastifyInstance) {
  const byCode = async (projectId: string, code: string) => {
    const [row] = await db
      .select({ userId: referralCodes.userId })
      .from(referralCodes)
      .innerJoin(endUsers, eq(endUsers.id, referralCodes.userId))
      .where(and(eq(referralCodes.projectId, projectId), eq(referralCodes.code, code.trim().toUpperCase()), eq(endUsers.active, true)));
    return row?.userId ?? null;
  };

  fastify.get('/v1/me/leagues', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const data = (await leaguesForUser(context.projectId, context.userId)).map((item) => ({
      ...item,
      standings: item.standings.map(({ rank, name, avatarUrl, xp, zone, userId }) => ({ rank, name, avatarUrl, xp, zone, isMe: userId === context.userId })),
    }));
    return reply.send({ data });
  });

  fastify.get('/v1/me/friends', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const friends = await listFriends(context.projectId, context.userId);
    const friendIds = friends.map((friend) => friend.id);
    const codes =
      friendIds.length === 0
        ? []
        : await db
            .select({ userId: referralCodes.userId, code: referralCodes.code })
            .from(referralCodes)
            .where(and(eq(referralCodes.projectId, context.projectId), inArray(referralCodes.userId, friendIds)));
    const codeOf = new Map(codes.map((row) => [row.userId, row.code]));
    return reply.send({ data: friends.map((friend) => ({ name: friend.name, avatarUrl: friend.avatarUrl, totalXp: friend.totalXp, code: codeOf.get(friend.id) ?? null })) });
  });

  fastify.post('/v1/me/friends', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const parsed = z.object({ code: z.string().min(4).max(32) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'BAD_REQUEST', message: "Send your friend's code" });
    const friendId = await byCode(context.projectId, parsed.data.code);
    if (!friendId) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Nobody has that code' });
    try {
      // The other player has to accept, unless they asked first.
      const status = await requestFriend(context.projectId, context.userId, friendId);
      return reply.status(201).send({ friends: status === 'friends', status });
    } catch (err) {
      return sendSocialError(reply, err);
    }
  });

  // Requests waiting for this player's answer. Each is answered with the sender's code.
  fastify.get('/v1/me/friends/requests', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const requests = await incomingFriendRequests(context.projectId, context.userId);
    const data = [];
    for (const item of requests) {
      data.push({ name: item.name, avatarUrl: item.avatarUrl, code: await referralCodeFor(context.projectId, item.id), requestedAt: item.requestedAt });
    }
    return reply.send({ data });
  });

  fastify.post<{ Params: { code: string } }>('/v1/me/friends/requests/:code/accept', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const fromId = await byCode(context.projectId, request.params.code);
    if (!fromId) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Nobody has that code' });
    try {
      await acceptFriendRequest(context.projectId, context.userId, fromId);
      return reply.status(201).send({ friends: true });
    } catch (err) {
      return sendSocialError(reply, err);
    }
  });

  // Declines a request from that player, or takes back one sent to them.
  fastify.delete<{ Params: { code: string } }>('/v1/me/friends/requests/:code', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const otherId = await byCode(context.projectId, request.params.code);
    if (otherId) await dropFriendRequest(context.projectId, context.userId, otherId);
    return reply.status(204).send();
  });

  fastify.delete<{ Params: { code: string } }>('/v1/me/friends/:code', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const friendId = await byCode(context.projectId, request.params.code);
    if (friendId) await removeFriend(context.projectId, context.userId, friendId);
    return reply.status(204).send();
  });

  fastify.get('/v1/me/feed', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const items = await activityFeed(context.projectId, await friendCircle(context.projectId, context.userId));
    return reply.send({ data: items.map(({ userId, ...item }) => ({ ...item, isMe: userId === context.userId })) });
  });

  fastify.post('/v1/me/kudos', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const parsed = z.object({ code: z.string().min(4).max(32), message: z.string().max(280).optional() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'BAD_REQUEST', message: "Send the receiver's code and an optional message" });
    const to = await byCode(context.projectId, parsed.data.code);
    if (!to) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Nobody has that code' });
    try {
      const given = await giveKudos(context.projectId, context.userId, to, parsed.data.message);
      return reply.status(201).send({ id: given.id, createdAt: given.createdAt });
    } catch (err) {
      return sendSocialError(reply, err);
    }
  });

  fastify.get('/v1/me/kudos', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const data = await db
      .select({ from: endUsers.name, message: kudos.message, createdAt: kudos.createdAt })
      .from(kudos)
      .innerJoin(endUsers, eq(endUsers.id, kudos.fromUserId))
      .where(and(eq(kudos.projectId, context.projectId), eq(kudos.toUserId, context.userId)))
      .orderBy(desc(kudos.createdAt))
      .limit(50);
    return reply.send({ data });
  });

  fastify.get('/v1/me/referral', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    return reply.send(await referralSummary(context.projectId, context.userId));
  });

  fastify.post('/v1/me/referral', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const parsed = z.object({ code: z.string().min(4).max(32) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'BAD_REQUEST', message: 'Send the invite code' });
    try {
      const referral = await claimReferral(context.projectId, context.userId, parsed.data.code);
      return reply.status(201).send({ status: referral.status });
    } catch (err) {
      return sendReferralError(reply, err);
    }
  });

  // A link to an image of one of the player's achievements, for sharing on social media.
  fastify.get<{ Params: { achievementKey: string } }>('/v1/me/achievements/:achievementKey/share', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const rows = await db.execute<{ id: string }>(
      sql`
        SELECT ua.id FROM ${userAchievements} ua JOIN achievements a ON a.id = ua.achievement_id
        WHERE ua.project_id = ${context.projectId} AND ua.user_id = ${context.userId} AND a.key = ${request.params.achievementKey}
        LIMIT 1`
    );
    const list = (Array.isArray(rows) ? rows : ((rows as unknown as { rows: { id: string }[] }).rows ?? [])) as { id: string }[];
    if (!list[0]) return reply.status(404).send({ code: 'NOT_FOUND', message: 'You have not earned that achievement' });
    return reply.send({ url: shareUrl(context.projectId, list[0].id) });
  });
}

