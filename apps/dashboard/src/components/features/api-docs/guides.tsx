import React from 'react';
import Link from 'next/link';
import { CodeBlock } from './code-block';

export const GUIDES = [
  { id: 'getting-started', name: 'Getting started' },
  { id: 'authentication', name: 'Authentication' },
  { id: 'users', name: 'Identifying users' },
  { id: 'duplicates', name: 'Avoiding duplicates' },
  { id: 'errors', name: 'Errors' },
  { id: 'limits', name: 'Rate limits' },
  { id: 'pagination', name: 'Pagination' },
];

const ERROR_CODES = [
  ['400', 'BAD_REQUEST', 'Fix the request. `details` says which fields failed.'],
  ['401', 'UNAUTHORIZED', 'The key or token is missing, wrong, revoked or expired.'],
  ['403', 'FORBIDDEN', 'The key lacks the scope, the user is deactivated, or the organization is suspended.'],
  ['404', 'NOT_FOUND', 'It doesn\'t exist in this project.'],
  ['409', 'CONFLICT', 'It already exists. `IDEMPOTENCY_KEY_MISMATCH` means a key was reused for a different request.'],
  ['413', 'PAYLOAD_TOO_LARGE', 'The event payload is over 64 KB.'],
  ['422', 'INSUFFICIENT_XP', 'The adjustment would take the balance below zero.'],
  ['429', 'TOO_MANY_REQUESTS', 'Wait for the seconds in `Retry-After`, then try again.'],
  ['5xx', 'INTERNAL_SERVER_ERROR', 'Try again later. Use an idempotency key so retries are safe.'],
];

function Guide({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-zinc-800 py-6 space-y-3">
      <h2 className="text-base font-bold text-zinc-100">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

const code = (value: string) => (
  <code className="bg-zinc-800/70 px-1 text-[0.92em] text-zinc-100">{value}</code>
);

export function Guides({ baseUrl }: { baseUrl: string }) {
  const firstRequest = `curl -X POST '${baseUrl}/v1/events' \\
  -H 'x-api-key: YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{ "event": "order_completed", "user_id": "user_123" }'`;

  return (
    <div className="grid grid-cols-1 items-start gap-x-8 xl:grid-cols-2">
      <Guide id="getting-started" title="Getting started">
        <p>Every path below starts from your base URL:</p>
        <CodeBlock code={baseUrl} label="Base URL" />
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Create a key on the{' '}
            <Link href="/dashboard/api-keys" className="text-brand-400 hover:underline">
              API Keys
            </Link>{' '}
            page.
          </li>
          <li>Send an event when something happens in your app.</li>
          <li>Rules turn events into XP and achievements, in the background.</li>
        </ol>
        <CodeBlock code={firstRequest} label="Your first request" />
        <p>
          A {code('202')} response means the event was received. Prefer a typed client? Use{' '}
          <Link href="/dashboard/developer" className="text-brand-400 hover:underline">
            the TypeScript SDK
          </Link>
          .
        </p>
      </Guide>

      <Guide id="authentication" title="Authentication">
        <p>
          <strong className="text-zinc-100">From your server,</strong> send your API key in the{' '}
          {code('x-api-key')} header. Keys start {code('gami_live_')} and belong to one project.
          Never put a key in a browser or mobile app.
        </p>
        <p>
          Each key has scopes, such as {code('users:read')}, and each endpoint below lists the one it
          needs. A {code('write')} scope also allows {code('read')}. New keys only get{' '}
          {code('events:write')} unless you choose more.
        </p>
        <p>
          <strong className="text-zinc-100">From a browser or app,</strong> your server creates a
          short-lived token with {code('POST /v1/end-user-tokens')}. Your frontend sends it as{' '}
          {code('Authorization: Bearer <token>')} to the {code('/v1/me')} endpoints, which only read
          that one user&apos;s data.
        </p>
      </Guide>

      <Guide id="users" title="Identifying users">
        <p>
          Use your own ID for a user everywhere. Send it as {code('user_id')} on events, and a new
          one creates the user automatically. Every endpoint with {code('{userId}')} in its path
          also accepts it, so you never need to store a second ID.
        </p>
        <p>
          Gami.Fied also gives each user an {code('id')} starting {code('usr_')}, which works in the
          same places. Your own ID appears in responses as {code('externalId')}.
        </p>
      </Guide>

      <Guide id="duplicates" title="Avoiding duplicates">
        <p>
          Networks fail, so retries must be safe. Send a unique {code('Idempotency-Key')} header of
          up to 128 characters on {code('POST /v1/events')} and {code('POST .../xp/adjust')}, or{' '}
          {code('idempotency_key')} on each event in a batch.
        </p>
        <p>
          Sending the same key again changes nothing and returns {code('"duplicate": true')}. For
          events, using a key with a different body returns {code('409')}{' '}
          {code('IDEMPOTENCY_KEY_MISMATCH')}.
        </p>
      </Guide>

      <Guide id="errors" title="Errors">
        <p>Errors use standard HTTP status codes, with the same body every time:</p>
        <CodeBlock
          label="Error body"
          code={JSON.stringify(
            {
              error: {
                code: 'BAD_REQUEST',
                message: 'Invalid event request schema',
                requestId: 'req_7d1c9',
                details: { _errors: [], event: { _errors: ['Required'] } },
              },
            },
            null,
            2
          )}
        />
        <p>
          Check {code('error.code')} in your code rather than the message, which can change. Quote{' '}
          {code('requestId')} if you need help.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-zinc-800/70">
              {ERROR_CODES.map(([status, name, meaning]) => (
                <tr key={name}>
                  <td className="py-1.5 pr-3 font-bold text-zinc-200 font-mono">{status}</td>
                  <td className="py-1.5 pr-3 text-zinc-200 font-mono">{name}</td>
                  <td className="py-1.5 text-zinc-400">{meaning?.replace(/`/g, '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Guide>

      <Guide id="limits" title="Rate limits">
        <p>
          Sending events is limited per project, and all requests are limited per IP address. The
          numbers are set by your server admin. Event responses include{' '}
          {code('X-RateLimit-Limit')}, {code('X-RateLimit-Remaining')} and{' '}
          {code('X-RateLimit-Reset')}.
        </p>
        <p>
          Going over returns {code('429')} with a {code('Retry-After')} header in seconds. Sending many
          events? Use {code('POST /v1/events/batch')}.
        </p>
      </Guide>

      <Guide id="pagination" title="Pagination">
        <p>
          Paged lists take {code('page')}, starting at 1, and {code('limit')}, up to 100. Responses
          include {code('total')}, the count across all pages. Stop when {code('page * limit')}{' '}
          reaches {code('total')}.
        </p>
      </Guide>
    </div>
  );
}
