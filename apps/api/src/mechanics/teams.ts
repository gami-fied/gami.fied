import crypto from 'crypto';
import { db, endUsers, isUniqueViolation, sharedGoalContributions, sharedGoalProgress, sharedGoals, teamMembers, teams, userXpBalances, type SharedGoal, type Team } from '@gami/database';
import type { Prize } from '@gami/rewards';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { bad, firstIssue, keySchema, lockFor, MechanicError, notFound, optionalDate, optionalText, optionalUrl, prizeProblems, prizesSchema, requirePlayer, resolvePlayer, sendMechanicError } from './shared.js';

const teamSchema = z.object({
  key: keySchema,
  name: z.string().min(1).max(128),
  imageUrl: optionalUrl,
  maxMembers: z.number().int().min(1).max(100_000).nullable().optional(),
});

const filterSchema = z.object({
  field: z.string().min(1).max(128),
  operator: z.string().min(1).max(32),
  value: z.union([z.string().max(512), z.number(), z.boolean()]),
});

const goalSchema = z
  .object({
    key: keySchema,
    name: z.string().min(1).max(128),
    description: optionalText(2000),
    scope: z.enum(['community', 'team']).default('community'),
    trigger: z.string().min(1).max(128),
    filters: z.array(filterSchema).max(10).nullable().optional(),
    /** A number in the event to add up, such as `payload.distance`. Leave it out to count each event as 1. */
    amountField: z
      .string()
      .max(128)
      .regex(/^payload\.[A-Za-z0-9_.]+$/, 'Use a field of the event payload, such as payload.distance')
      .nullable()
      .optional(),
    target: z.number().int().min(1).max(2_000_000_000),
    startAt: optionalDate,
    endAt: optionalDate,
    rewards: prizesSchema.default([]),
    enabled: z.boolean().default(true),
  })
  .refine((value) => !value.startAt || !value.endAt || new Date(value.endAt) > new Date(value.startAt), { message: 'The goal must end after it starts' });

async function findTeam(projectId: string, ref: string): Promise<Team | null> {
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.projectId, projectId), or(eq(teams.id, ref), eq(teams.key, ref))));
  return team ?? null;
}

/** Teams with their size and the XP their members hold, highest first. This is also the team board. */
export async function teamBoard(projectId: string) {
  const rows = (await db.execute(sql`
    SELECT t.id, t.key, t.name, t.image_url AS "imageUrl", t.max_members AS "maxMembers", t.created_at AS "createdAt",
           COUNT(m.id)::int AS "members", COALESCE(SUM(b.total_xp), 0)::bigint AS "xp"
    FROM ${teams} t
    LEFT JOIN ${teamMembers} m ON m.team_id = t.id
    LEFT JOIN ${endUsers} u ON u.id = m.user_id AND u.active = true
    LEFT JOIN ${userXpBalances} b ON b.user_id = u.id AND b.project_id = t.project_id
    WHERE t.project_id = ${projectId}
    GROUP BY t.id
    ORDER BY "xp" DESC, t.created_at ASC, t.id ASC
  `)) as unknown as { id: string; key: string; name: string; imageUrl: string | null; maxMembers: number | null; createdAt: Date; members: number; xp: string | number }[];
  return rows.map((row, index) => ({ ...row, xp: Number(row.xp), rank: index + 1 }));
}

export async function teamOf(projectId: string, userId: string): Promise<Team | null> {
  const [row] = await db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.projectId, projectId), eq(teamMembers.userId, userId)));
  return row?.team ?? null;
}

/** Puts a player in a team. A player in another team moves, because a player is in one team at a time. */
export async function joinTeam(projectId: string, userRef: string, teamRef: string) {
  const team = await findTeam(projectId, teamRef);
  if (!team) throw new MechanicError('TEAM_NOT_FOUND', 'Team not found', 404);
  return db.transaction(async (tx) => {
    const player = await requirePlayer(tx, projectId, userRef);
    // Joining takes turns per team, so the size limit holds when many join at once.
    await lockFor(tx, `team:${team.id}`);
    const [current] = await tx
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.projectId, projectId), eq(teamMembers.userId, player.id)));
    if (current?.teamId === team.id) return { team, joined: false };
    if (team.maxMembers !== null) {
      const [size] = await tx.select({ total: sql<number>`COUNT(*)::int` }).from(teamMembers).where(eq(teamMembers.teamId, team.id));
      if ((size?.total ?? 0) >= team.maxMembers) throw new MechanicError('TEAM_FULL', 'That team is full');
    }
    if (current) await tx.delete(teamMembers).where(eq(teamMembers.id, current.id));
    await tx.insert(teamMembers).values({ id: `tm_${crypto.randomUUID()}`, projectId, teamId: team.id, userId: player.id });
    return { team, joined: true };
  });
}

export async function leaveTeam(projectId: string, userRef: string): Promise<boolean> {
  // A deactivated player can still be taken out of a team.
  const player = await resolvePlayer(db, projectId, userRef);
  if (!player) throw new MechanicError('USER_NOT_FOUND', 'User not found', 404);
  const removed = await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.projectId, projectId), eq(teamMembers.userId, player.id)))
    .returning({ id: teamMembers.id });
  return removed.length > 0;
}

/** A player's team as they see it: the team, its place, and who is in it. No IDs or email addresses. */
export async function teamForPlayer(projectId: string, userId: string) {
  const team = await teamOf(projectId, userId);
  if (!team) return null;
  const [board, members] = await Promise.all([
    teamBoard(projectId),
    db
      .select({ userId: endUsers.id, name: endUsers.name, avatarUrl: endUsers.avatarUrl, xp: userXpBalances.totalXp })
      .from(teamMembers)
      .innerJoin(endUsers, eq(endUsers.id, teamMembers.userId))
      .leftJoin(userXpBalances, and(eq(userXpBalances.userId, endUsers.id), eq(userXpBalances.projectId, projectId)))
      .where(and(eq(teamMembers.teamId, team.id), eq(endUsers.active, true)))
      .orderBy(desc(sql`COALESCE(${userXpBalances.totalXp}, 0)`), endUsers.id)
      .limit(50),
  ]);
  const place = board.find((row) => row.id === team.id);
  return {
    key: team.key,
    name: team.name,
    imageUrl: team.imageUrl,
    members: place?.members ?? members.length,
    maxMembers: team.maxMembers,
    xp: place?.xp ?? 0,
    rank: place?.rank ?? null,
    teams: board.length,
    roster: members.map((member) => ({ name: member.name, avatarUrl: member.avatarUrl, xp: member.xp ?? 0, isMe: member.userId === userId })),
  };
}

const goalWindow = (goal: SharedGoal, now: Date) => !(goal.startAt && goal.startAt > now) && !(goal.endAt && goal.endAt <= now);

/** The goals a player can see, with the progress of everyone, or of their own team for a team goal. */
export async function goalsForPlayer(projectId: string, userId: string, now: Date = new Date()) {
  const list = (
    await db
      .select()
      .from(sharedGoals)
      .where(and(eq(sharedGoals.projectId, projectId), eq(sharedGoals.enabled, true)))
      .orderBy(sharedGoals.createdAt, sharedGoals.id)
  ).filter((goal) => !(goal.startAt && goal.startAt > now));
  if (list.length === 0) return [];
  const team = list.some((goal) => goal.scope === 'team') ? await teamOf(projectId, userId) : null;
  const ids = list.map((goal) => goal.id);
  const [progress, mine] = await Promise.all([
    db.select().from(sharedGoalProgress).where(inArray(sharedGoalProgress.goalId, ids)),
    db
      .select()
      .from(sharedGoalContributions)
      .where(and(inArray(sharedGoalContributions.goalId, ids), eq(sharedGoalContributions.userId, userId))),
  ]);

  return list
    .map((goal) => {
      const scopeKey = goal.scope === 'team' ? (team?.id ?? null) : 'all';
      const row = scopeKey ? progress.find((entry) => entry.goalId === goal.id && entry.scopeKey === scopeKey) : undefined;
      const contribution = mine.find((entry) => entry.goalId === goal.id);
      const total = Math.min(goal.target, row?.progress ?? 0);
      return {
        key: goal.key,
        name: goal.name,
        description: goal.description,
        scope: goal.scope,
        /** For a team goal, the player's team. Null when they are in no team, and then they cannot contribute. */
        team: goal.scope === 'team' ? (team ? { key: team.key, name: team.name } : null) : undefined,
        target: goal.target,
        progress: total,
        percent: Math.floor((total / goal.target) * 100),
        completed: Boolean(row?.completedAt),
        completedAt: row?.completedAt ?? null,
        myContribution: contribution?.amount ?? 0,
        endsAt: goal.endAt,
        open: goalWindow(goal, now) && !row?.completedAt,
        rewards: goal.rewards as Prize[],
      };
    })
    // A finished or expired goal stays visible for a week, then drops off the list.
    .filter((goal) => goal.open || (goal.completedAt ?? goal.endsAt ?? now).getTime() > now.getTime() - 7 * 86_400_000);
}

export async function teamRoutes(fastify: FastifyInstance) {
  // ---------- Teams ----------
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/teams', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    return reply.send({ data: await teamBoard(projectId) });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/teams', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = teamSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, firstIssue(parsed.error, 'Invalid team'));
    try {
      const [created] = await db
        .insert(teams)
        .values({ id: `team_${crypto.randomUUID()}`, projectId, key: parsed.data.key, name: parsed.data.name, imageUrl: parsed.data.imageUrl || null, maxMembers: parsed.data.maxMembers ?? null })
        .returning();
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A team with the key "${parsed.data.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; teamId: string } }>('/api/projects/:projectId/teams/:teamId', async (request, reply) => {
    const { projectId, teamId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = teamSchema.omit({ key: true }).partial().safeParse(request.body);
    if (!parsed.success) return bad(reply, firstIssue(parsed.error, 'Invalid team'));
    const team = await findTeam(projectId, teamId);
    if (!team) return notFound(reply, 'Team');
    const [updated] = await db
      .update(teams)
      .set({ ...parsed.data, imageUrl: parsed.data.imageUrl === undefined ? team.imageUrl : parsed.data.imageUrl || null, updatedAt: new Date() })
      .where(eq(teams.id, team.id))
      .returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; teamId: string } }>('/api/projects/:projectId/teams/:teamId', async (request, reply) => {
    const { projectId, teamId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const team = await findTeam(projectId, teamId);
    if (!team) return notFound(reply, 'Team');
    await db.transaction(async (tx) => {
      // Goal progress is kept by team ID without a foreign key, so it is removed here.
      await tx.delete(sharedGoalProgress).where(and(eq(sharedGoalProgress.projectId, projectId), eq(sharedGoalProgress.scopeKey, team.id)));
      await tx.delete(sharedGoalContributions).where(and(eq(sharedGoalContributions.projectId, projectId), eq(sharedGoalContributions.scopeKey, team.id)));
      await tx.delete(teams).where(eq(teams.id, team.id));
    });
    return reply.status(204).send();
  });

  fastify.get<{ Params: { projectId: string; teamId: string } }>('/api/projects/:projectId/teams/:teamId/members', async (request, reply) => {
    const { projectId, teamId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const team = await findTeam(projectId, teamId);
    if (!team) return notFound(reply, 'Team');
    const data = await db
      .select({ userId: endUsers.id, externalId: endUsers.externalId, name: endUsers.name, avatarUrl: endUsers.avatarUrl, xp: sql<number>`COALESCE(${userXpBalances.totalXp}, 0)::int`, joinedAt: teamMembers.createdAt })
      .from(teamMembers)
      .innerJoin(endUsers, eq(endUsers.id, teamMembers.userId))
      .leftJoin(userXpBalances, and(eq(userXpBalances.userId, endUsers.id), eq(userXpBalances.projectId, projectId)))
      .where(eq(teamMembers.teamId, team.id))
      .orderBy(desc(sql`COALESCE(${userXpBalances.totalXp}, 0)`), endUsers.id)
      .limit(500);
    return reply.send({ team, data });
  });

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/team', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      const player = await requirePlayer(db, projectId, userId);
      return reply.send({ team: await teamForPlayer(projectId, player.id) });
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });

  fastify.post<{ Params: { projectId: string; userId: string }; Body: { team?: string } }>('/api/projects/:projectId/users/:userId/team', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    if (typeof request.body?.team !== 'string') return bad(reply, 'Send the team to join, as { "team": "<key>" }');
    try {
      const { team, joined } = await joinTeam(projectId, userId, request.body.team);
      return reply.send({ team: { key: team.key, name: team.name }, joined });
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });

  fastify.delete<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/team', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      await leaveTeam(projectId, userId);
      return reply.status(204).send();
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });

  // ---------- Shared goals ----------
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/goals', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const list = await db.select().from(sharedGoals).where(eq(sharedGoals.projectId, projectId)).orderBy(sharedGoals.createdAt, sharedGoals.id);
    if (list.length === 0) return reply.send({ data: [] });
    const ids = list.map((goal) => goal.id);
    const [progress, contributors, allTeams] = await Promise.all([
      db.select().from(sharedGoalProgress).where(inArray(sharedGoalProgress.goalId, ids)),
      db
        .select({ goalId: sharedGoalContributions.goalId, players: sql<number>`COUNT(*)::int`, paid: sql<number>`COUNT(${sharedGoalContributions.paidAt})::int` })
        .from(sharedGoalContributions)
        .where(inArray(sharedGoalContributions.goalId, ids))
        .groupBy(sharedGoalContributions.goalId),
      db.select({ id: teams.id, key: teams.key, name: teams.name }).from(teams).where(eq(teams.projectId, projectId)),
    ]);
    const teamName = new Map(allTeams.map((team) => [team.id, team]));
    return reply.send({
      data: list.map((goal) => {
        const rows = progress.filter((row) => row.goalId === goal.id);
        const stats = contributors.find((row) => row.goalId === goal.id);
        return {
          ...goal,
          contributors: stats?.players ?? 0,
          paid: stats?.paid ?? 0,
          // One line for a community goal, and one per team for a team goal, furthest first.
          progress: rows
            .map((row) => ({ team: row.scopeKey === 'all' ? null : (teamName.get(row.scopeKey) ?? null), progress: Math.min(goal.target, row.progress), completedAt: row.completedAt }))
            .sort((a, b) => b.progress - a.progress),
        };
      }),
    });
  });

  const saveGoal = async (projectId: string, body: unknown, existing?: SharedGoal) => {
    const parsed = goalSchema.safeParse(
      existing
        ? { ...existing, startAt: existing.startAt?.toISOString() ?? null, endAt: existing.endAt?.toISOString() ?? null, ...(body as Record<string, unknown>), key: existing.key }
        : body
    );
    if (!parsed.success) return { problem: firstIssue(parsed.error, 'Invalid goal') };
    if (existing && parsed.data.scope !== existing.scope) return { problem: 'A goal cannot change between community and team once it is made' };
    const problems = await prizeProblems(projectId, parsed.data.rewards);
    if (problems.length > 0) return { problem: problems[0]! };
    const { startAt, endAt, ...rest } = parsed.data;
    return { values: { ...rest, description: rest.description ?? null, filters: rest.filters ?? null, amountField: rest.amountField ?? null, startAt: startAt ? new Date(startAt) : null, endAt: endAt ? new Date(endAt) : null } };
  };

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/goals', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const row = await saveGoal(projectId, request.body);
    if ('problem' in row) return bad(reply, row.problem!);
    try {
      const [created] = await db
        .insert(sharedGoals)
        .values({ id: `goal_${crypto.randomUUID()}`, projectId, ...row.values })
        .returning();
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A goal with the key "${row.values.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; goalId: string } }>('/api/projects/:projectId/goals/:goalId', async (request, reply) => {
    const { projectId, goalId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [existing] = await db
      .select()
      .from(sharedGoals)
      .where(and(eq(sharedGoals.projectId, projectId), or(eq(sharedGoals.id, goalId), eq(sharedGoals.key, goalId))));
    if (!existing) return notFound(reply, 'Goal');
    if (typeof request.body !== 'object' || request.body === null) return bad(reply, 'Invalid goal');
    const row = await saveGoal(projectId, request.body, existing);
    if ('problem' in row) return bad(reply, row.problem!);
    const [updated] = await db
      .update(sharedGoals)
      .set({ ...row.values, updatedAt: new Date() })
      .where(eq(sharedGoals.id, existing.id))
      .returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; goalId: string } }>('/api/projects/:projectId/goals/:goalId', async (request, reply) => {
    const { projectId, goalId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [deleted] = await db
      .delete(sharedGoals)
      .where(and(eq(sharedGoals.projectId, projectId), eq(sharedGoals.id, goalId)))
      .returning({ id: sharedGoals.id });
    if (!deleted) return notFound(reply, 'Goal');
    return reply.status(204).send();
  });

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/goals', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      const player = await requirePlayer(db, projectId, userId);
      return reply.send({ data: await goalsForPlayer(projectId, player.id) });
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });
}
