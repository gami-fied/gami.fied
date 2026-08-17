import { type NextRequest, NextResponse } from 'next/server';

async function handleProxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetApiBase =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://api:3001';

  const targetPath = `/api/${path.join('/')}`;
  const searchParams = request.nextUrl.search;
  const destinationUrl = `${targetApiBase.replace(/\/$/, '')}${targetPath}${searchParams}`;

  const headers = new Headers(request.headers);
  headers.delete('host');

  try {
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const body = hasBody ? await request.arrayBuffer() : undefined;

    const response = await fetch(destinationUrl, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(`[API Proxy Error] Failed to proxy ${request.method} ${destinationUrl}:`, err);
    return NextResponse.json(
      { error: 'Backend API Service Unavailable', destinationUrl },
      { status: 503 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;
export const PATCH = handleProxy;
export const OPTIONS = handleProxy;
export const HEAD = handleProxy;
