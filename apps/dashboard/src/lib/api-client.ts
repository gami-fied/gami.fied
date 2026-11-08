import { QueryClient } from '@tanstack/react-query';

/** Short enough that a refresh button feels live, long enough to merge duplicate page loads. */
const STALE_MS = 3000;

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: STALE_MS, gcTime: 5 * 60 * 1000, retry: false } },
});

export const API_UNAVAILABLE_EVENT = 'gami:api-unavailable';

interface Snapshot {
  status: number;
  contentType: string;
  body: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function reportUnavailable(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(API_UNAVAILABLE_EVENT));
}

function handleFailure(url: string, status: number, wasRead: boolean): void {
  const signedOut = status === 401 && !url.startsWith('/api/auth');
  if (signedOut && typeof window !== 'undefined') {
    // Public pages such as invitation links work signed out, so they stay where they are.
    if (/^\/(dashboard|admin)/.test(window.location.pathname)) window.location.assign('/login');
  }
  if (status >= 500 && wasRead) reportUnavailable();
}

const isRead = (init?: RequestInit) => (init?.method?.toUpperCase() ?? 'GET') === 'GET';

function cacheable(url: string, init?: RequestInit): boolean {
  return isRead(init) && !url.startsWith('/api/auth');
}

/** Drops finished reads. Removing one in progress would cancel it for whoever is waiting. */
function clearFinishedReads(): void {
  queryClient.removeQueries({
    predicate: (query) => query.state.fetchStatus === 'idle' && query.queryKey[0] !== 'state',
  });
}

async function readThroughCache(url: string, init?: RequestInit): Promise<Response> {
  let snapshot: Snapshot;
  try {
    snapshot = await queryClient.fetchQuery({
      queryKey: [url],
      queryFn: async (): Promise<Snapshot> => {
        const response = await fetch(url, init);
        return {
          status: response.status,
          contentType: response.headers.get('content-type') ?? '',
          body: await response.text(),
        };
      },
    });
  } catch (err) {
    reportUnavailable();
    throw err;
  }

  // Failures are never cached, so a retry always reaches the API.
  if (snapshot.status >= 400) {
    queryClient.removeQueries({ queryKey: [url] });
    handleFailure(url, snapshot.status, true);
  }

  const noBody = snapshot.status === 204 || snapshot.status === 304;
  return new Response(noBody ? null : snapshot.body, {
    status: snapshot.status,
    headers: { 'content-type': snapshot.contentType },
  });
}

/**
 * The dashboard's single way to reach the API, with the same result as `fetch`. Reads are cached
 * briefly and shared between components, and any write clears the cache so screens never show old
 * data. It also sends expired sessions to sign in, and reports when the API can't be reached.
 */
/** A string body is JSON in this app, so it is labelled as such unless the caller says otherwise. */
function withJsonType(init?: RequestInit): RequestInit | undefined {
  if (typeof init?.body !== 'string') return init;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return { ...init, headers };
}

export async function apiFetch(url: string, rawInit?: RequestInit): Promise<Response> {
  const init = withJsonType(rawInit);
  if (cacheable(url, init)) return readThroughCache(url, init);

  const response = await fetch(url, init);
  if (!response.ok) {
    handleFailure(url, response.status, false);
  } else if (!isRead(init)) {
    clearFinishedReads();
  }
  return response;
}

/** Reads JSON with a known type, and throws an `ApiError` carrying the API's message. */
export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message ?? body?.message ?? 'Request failed',
      response.status,
      body?.error?.code,
      body?.error?.requestId
    );
  }
  return body as T;
}
