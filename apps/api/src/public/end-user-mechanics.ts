import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { boxesForPlayer, openBox } from '../mechanics/boxes.js';
import { buyCosmetic, cosmeticsForPlayer, setEquipped } from '../mechanics/cosmetics.js';
import { journeysForPlayer } from '../mechanics/journeys.js';
import { prizesForPlayer } from '../mechanics/leaderboard-prizes.js';
import { buyPremium, claimBody, claimPassRewards, passesForPlayer } from '../mechanics/passes.js';
import { MechanicError } from '../mechanics/shared.js';
import { goalsForPlayer, joinTeam, leaveTeam, teamBoard, teamForPlayer } from '../mechanics/teams.js';
import { authenticateEndUser } from './end-user.js';

/**
 * Player-facing routes for boxes, season passes, teams, shared goals, cosmetics, leaderboard
 * prizes and journeys. A player only ever acts on their own account, and nothing here returns the
 * project's IDs for other players or anyone's email address.
 */
export async function endUserMechanicRoutes(fastify: FastifyInstance) {
  const fail = (reply: Parameters<typeof authenticateEndUser>[1], err: unknown) => {
    if (err instanceof MechanicError) return reply.status(err.status).send({ code: err.code, message: err.message });
    throw err;
  };

  // ---------- Boxes ----------
  fastify.get('/v1/me/boxes', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    return reply.send({ data: await boxesForPlayer(context.projectId, context.userId) });
  });

  fastify.post<{ Params: { boxKey: string }; Body: { idempotencyKey?: string } }>('/v1/me/boxes/:boxKey/open', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    try {
      const result = await openBox({
        projectId: context.projectId,
        user: context.userId,
        boxKey: request.params.boxKey,
        idempotencyKey: typeof request.body?.idempotencyKey === 'string' ? request.body.idempotencyKey.slice(0, 128) : undefined,
      });
      return reply.status(result.duplicate ? 200 : 201).send(result);
    } catch (err) {
      return fail(reply, err);
    }
  });

  // ---------- Season passes ----------
  fastify.get('/v1/me/passes', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    return reply.send({ data: await passesForPlayer(context.projectId, context.userId) });
  });

  fastify.post<{ Params: { passKey: string } }>('/v1/me/passes/:passKey/claim', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const body = claimBody.safeParse(request.body ?? {});
    if (!body.success) return reply.status(400).send({ code: 'BAD_REQUEST', message: 'Send a tier and a lane, or nothing to claim everything that is ready' });
    try {
      return reply.send(await claimPassRewards({ projectId: context.projectId, user: context.userId, passKey: request.params.passKey, ...body.data }));
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post<{ Params: { passKey: string } }>('/v1/me/passes/:passKey/premium', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    try {
      const result = await buyPremium({ projectId: context.projectId, user: context.userId, passKey: request.params.passKey });
      return reply.status(result.duplicate ? 200 : 201).send(result);
    } catch (err) {
      return fail(reply, err);
    }
  });

  // ---------- Teams and shared goals ----------
  fastify.get('/v1/me/team', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    return reply.send({ team: await teamForPlayer(context.projectId, context.userId) });
  });

  // Every team with its size and XP, highest first: the list to join from, and the team board.
  fastify.get('/v1/me/teams', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const [board, mine] = await Promise.all([teamBoard(context.projectId), teamForPlayer(context.projectId, context.userId)]);
    return reply.send({
      data: board.map((team) => ({
        key: team.key,
        name: team.name,
        imageUrl: team.imageUrl,
        members: team.members,
        maxMembers: team.maxMembers,
        full: team.maxMembers !== null && team.members >= team.maxMembers,
        xp: team.xp,
        rank: team.rank,
        isMine: team.key === mine?.key,
      })),
    });
  });

  fastify.post('/v1/me/team', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const parsed = z.object({ team: z.string().min(1).max(64) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ code: 'BAD_REQUEST', message: 'Send the team to join, as { "team": "<key>" }' });
    try {
      const { team, joined } = await joinTeam(context.projectId, context.userId, parsed.data.team);
      return reply.send({ team: { key: team.key, name: team.name }, joined });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.delete('/v1/me/team', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    await leaveTeam(context.projectId, context.userId);
    return reply.status(204).send();
  });

  fastify.get('/v1/me/goals', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    return reply.send({ data: await goalsForPlayer(context.projectId, context.userId) });
  });

  // ---------- Cosmetics ----------
  fastify.get('/v1/me/cosmetics', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    return reply.send({ data: await cosmeticsForPlayer(context.projectId, context.userId) });
  });

  fastify.post<{ Params: { cosmeticKey: string } }>('/v1/me/cosmetics/:cosmeticKey/buy', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    try {
      return reply.status(201).send(await buyCosmetic(context.projectId, context.userId, request.params.cosmeticKey));
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post<{ Params: { cosmeticKey: string } }>('/v1/me/cosmetics/:cosmeticKey/equip', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    try {
      return reply.send(await setEquipped(context.projectId, context.userId, request.params.cosmeticKey, true));
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.delete<{ Params: { cosmeticKey: string } }>('/v1/me/cosmetics/:cosmeticKey/equip', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    try {
      return reply.send(await setEquipped(context.projectId, context.userId, request.params.cosmeticKey, false));
    } catch (err) {
      return fail(reply, err);
    }
  });

  // ---------- Leaderboard prizes ----------
  fastify.get('/v1/me/leaderboard/prizes', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    return reply.send(await prizesForPlayer(context.projectId, context.userId));
  });

  // ---------- Journeys ----------
  fastify.get('/v1/me/journeys', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    return reply.send({ data: await journeysForPlayer(context.projectId, context.userId) });
  });
}
