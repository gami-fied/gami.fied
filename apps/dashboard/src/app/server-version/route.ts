import { NextResponse } from 'next/server';

/**
 * The version of the API this dashboard talks to, for Developer Hub. The docs on the website are
 * for the latest release, so the hub says which version this install runs.
 */
export async function GET() {
  const targetApiBase = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:3001';
  const apiBase = /^https?:\/\//.test(targetApiBase) ? targetApiBase : `http://${targetApiBase}`;

  try {
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (response.ok) {
      const body = (await response.json()) as { version?: unknown };
      if (typeof body.version === 'string') return NextResponse.json({ version: body.version });
    }
  } catch {
    // Reported below.
  }
  return NextResponse.json({ message: 'The API is not available' }, { status: 502 });
}
