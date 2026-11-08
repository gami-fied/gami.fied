import { featureDefinition, featuresFor, policyFor } from '@gami/database';
import type { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';

/** What is turned on for this project's organization, so the dashboard shows only what works. */
export async function projectFeatureRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/features', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;
    const [features, policy] = await Promise.all([featuresFor(access.project.organizationId), policyFor(access.project.organizationId)]);
    return reply.send({
      features,
      disabled: Object.entries(features)
        .filter(([, on]) => !on)
        .map(([key]) => ({ key, name: featureDefinition(key)?.name ?? key })),
      policy: { apiKeyMaxLifetimeDays: policy.apiKeyMaxLifetimeDays, requireAllowedOrigins: policy.requireAllowedOrigins, allowedEmailDomains: policy.allowedEmailDomains },
    });
  });
}
