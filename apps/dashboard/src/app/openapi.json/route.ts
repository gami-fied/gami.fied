import { type NextRequest, NextResponse } from 'next/server';

export async function GET(_request: NextRequest) {
  const targetApiBase =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://api:3001';

  const destinationUrl = `${targetApiBase.replace(/\/$/, '')}/openapi.json`;

  try {
    const response = await fetch(destinationUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }
  } catch (err) {
    console.error('[OpenAPI Proxy Error] Failed to fetch /openapi.json:', err);
  }

  // Fallback OpenAPI specification if API container is starting
  return NextResponse.json({
    openapi: '3.1.0',
    info: {
      title: 'Gami.Fied Community Edition API',
      version: '0.1.0',
      description: 'Canonical developer and project-scoped API reference for Gami.Fied Community Engine.',
    },
    servers: [{ url: 'http://localhost:3001', description: 'Local API Server' }],
    paths: {
      '/v1/events': {
        post: {
          summary: 'Public Event Ingestion Endpoint',
          description: 'Ingests a gamification event. Returns 202 Accepted upon enqueueing to the outbox.',
        },
      },
      '/api/projects/{projectId}/metrics': {
        get: {
          summary: 'Project API Usage Metrics',
          description: 'Returns total requests, event ingestion volume, and health stats.',
        },
      },
      '/health': {
        get: {
          summary: 'Liveness Health Check',
          description: 'Lightweight process liveness health check.',
        },
      },
      '/ready': {
        get: {
          summary: 'Readiness Dependency Probe',
          description: 'Probes PostgreSQL & Redis database connectivity.',
        },
      },
    },
  });
}
