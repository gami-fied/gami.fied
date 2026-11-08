import crypto from 'crypto';
import { db, isUniqueViolation, leagueMembers, leagues, type League } from '@gami/database';
import { ensureSeason, groupStandings, playerLeague, seasonWindow } from '@gami/leaderboards';
import { and, count, eq, or, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { resolveEndUserId } from '../leaderboards/index.js';

const key = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, numbers, dashes and underscores');

const leagueSchema = z
  .object({
    key,
    name: z.string().min(1).max(128),
    tiers: z.array(z.string().min(1).max(40)).min(2, 'A league needs at least two tiers').max(12),
    groupSize: z.number().int().min(4).max(200).default(30),
    promote: z.number().int().min(0).max(100).default(5),
    relegate: z.number().int().min(0).max(100).default(5),
    cadence: z.enum(['daily', 'weekly']).default('weekly'),
    enabled: z.boolean().default(true),
  })
  .refine((value) => value.promote + value.relegate < value.groupSize, { message: 'Moving up and down together must leave room in a group' });

const bad = (reply: FastifyReply, message: string) => reply.status(400).send({ error: 'Bad Request', message });

async function findLeague(projectId: string, ref: string): Promise<League | null> {
  const [league] = await db.select().from(leagues).where(and(eq(leagues.projectId, projectId), or(eq(leagues.id, ref), eq(leagues.key, ref))));
  return league ?? null;
}

/** Each league a person is in this season, with their group's table. */
export async function leaguesForUser(projectId: string, userId: string) {
  const list = await db.select().from(leagues).where(and(eq(leagues.projectId, projectId), eq(leagues.enabled, true)));
  const results = await Promise.all(list.map((league) => playerLeague(league, userId)));
  return results.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function leagueRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/leagues', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const list = await db.select().from(leagues).where(eq(leagues.projectId, projectId)).orderBy(leagues.createdAt);
    const data = await Promise.all(
      list.map(async (league) => {
        const { startsAt, endsAt } = seasonWindow(league.cadence);
        const [stats] = (await db.execute(sql`
          SELECT COUNT(*)::int AS "members", COUNT(DISTINCT (m.tier, m.group_no))::int AS "groups"
          FROM ${leagueMembers} m JOIN league_seasons s ON s.id = m.season_id
          WHERE m.league_id = ${league.id} AND s.starts_at = ${startsAt.toISOString()}::timestamptz
        `)) as unknown as { members: number; groups: number }[];
        return { ...league, season: { startsAt, endsAt, members: stats?.members ?? 0, groups: stats?.groups ?? 0 } };
      })
    );
    return reply.send({ data });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/leagues', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = leagueSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid league');
    try {
      const [created] = await db.insert(leagues).values({ id: `lg_${crypto.randomUUID()}`, projectId, ...parsed.data }).returning();
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A league with the key "${parsed.data.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; leagueId: string } }>('/api/projects/:projectId/leagues/:leagueId', async (request, reply) => {
    const { projectId, leagueId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const league = await findLeague(projectId, leagueId);
    if (!league) return reply.status(404).send({ error: 'Not Found', message: 'League not found' });
    // Cadence stays fixed once seasons exist, so a season never changes length halfway through.
    const parsed = z
      .object({
        name: z.string().min(1).max(128),
        tiers: z.array(z.string().min(1).max(40)).min(2).max(12),
        groupSize: z.number().int().min(4).max(200),
        promote: z.number().int().min(0).max(100),
        relegate: z.number().int().min(0).max(100),
        enabled: z.boolean(),
      })
      .partial()
      .safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid league');
    const next = { ...league, ...parsed.data };
    if (next.promote + next.relegate >= next.groupSize) return bad(reply, 'Moving up and down together must leave room in a group');
    if (parsed.data.tiers && parsed.data.tiers.length < league.tiers.length) {
      const [highest] = await db.select({ total: count() }).from(leagueMembers).where(and(eq(leagueMembers.leagueId, league.id), sql`${leagueMembers.tier} >= ${parsed.data.tiers.length}`));
      if ((highest?.total ?? 0) > 0) return bad(reply, 'Some players are in a tier you are removing. Rename tiers instead.');
    }
    const [updated] = await db.update(leagues).set({ ...parsed.data, updatedAt: new Date() }).where(eq(leagues.id, league.id)).returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; leagueId: string } }>('/api/projects/:projectId/leagues/:leagueId', async (request, reply) => {
    const { projectId, leagueId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [gone] = await db.delete(leagues).where(and(eq(leagues.id, leagueId), eq(leagues.projectId, projectId))).returning({ id: leagues.id });
    if (!gone) return reply.status(404).send({ error: 'Not Found', message: 'League not found' });
    return reply.status(204).send();
  });

  // The groups this season, by tier, for the dashboard's overview.
  fastify.get<{ Params: { projectId: string; leagueId: string } }>('/api/projects/:projectId/leagues/:leagueId/groups', async (request, reply) => {
    const { projectId, leagueId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const league = await findLeague(projectId, leagueId);
    if (!league) return reply.status(404).send({ error: 'Not Found', message: 'League not found' });
    const season = await ensureSeason(league);
    const groups = await db
      .select({ tier: leagueMembers.tier, groupNo: leagueMembers.groupNo, members: count() })
      .from(leagueMembers)
      .where(eq(leagueMembers.seasonId, season.id))
      .groupBy(leagueMembers.tier, leagueMembers.groupNo)
      .orderBy(sql`${leagueMembers.tier} DESC`, leagueMembers.groupNo);
    return reply.send({
      season: { startsAt: season.startsAt, endsAt: season.endsAt },
      data: groups.map((group) => ({ ...group, tierName: league.tiers[group.tier] ?? `Tier ${group.tier + 1}` })),
    });
  });

  fastify.get<{ Params: { projectId: string; leagueId: string; tier: string; groupNo: string } }>(
    '/api/projects/:projectId/leagues/:leagueId/groups/:tier/:groupNo',
    async (request, reply) => {
      const { projectId, leagueId } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;
      const league = await findLeague(projectId, leagueId);
      if (!league) return reply.status(404).send({ error: 'Not Found', message: 'League not found' });
      const season = await ensureSeason(league);
      const data = await groupStandings(league, season, Number(request.params.tier) || 0, Number(request.params.groupNo) || 1);
      return reply.send({ tierName: league.tiers[Number(request.params.tier)] ?? null, seasonEndsAt: season.endsAt, data });
    }
  );

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/leagues', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const id = await resolveEndUserId(projectId, userId);
    if (!id) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    return reply.send({ data: await leaguesForUser(projectId, id) });
  });
}
