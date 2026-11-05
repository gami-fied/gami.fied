import { db, endUsers } from '@gami/database';
import { and, eq, or } from 'drizzle-orm';
import type { FastifyRequest, RouteOptions } from 'fastify';

const USER_ROUTE = /^\/api\/projects\/:projectId\/users\/:userId(\/|$)/;

/** Lets every user route accept the customer's own ID as well as the internal one. */
async function resolveUserId(request: FastifyRequest) {
  const params = request.params as { projectId: string; userId: string };

  const [user] = await db
    .select({ id: endUsers.id })
    .from(endUsers)
    .where(
      and(
        eq(endUsers.projectId, params.projectId),
        or(eq(endUsers.id, params.userId), eq(endUsers.externalId, params.userId))
      )
    );

  if (user) params.userId = user.id;
}

export function addUserResolution(route: RouteOptions): void {
  if (typeof route.url !== 'string' || !USER_ROUTE.test(route.url)) return;

  const existing = route.preHandler;
  route.preHandler = [resolveUserId, ...(Array.isArray(existing) ? existing : existing ? [existing] : [])];
}
