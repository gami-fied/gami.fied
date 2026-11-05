import { NextResponse } from 'next/server';

export async function GET() {
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

  return NextResponse.json({ message: 'The API is not available' }, { status: 502 });
}
