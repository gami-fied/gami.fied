import { NextResponse, type NextRequest } from 'next/server';
import { buildContentSecurityPolicy, createNonce } from '@/lib/content-security-policy';

const SESSION_COOKIES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

/**
 * Runs before every page.
 *
 * - Sends signed-out visitors to sign in before an app page renders. This only checks that a
 *   cookie exists, so it prevents a flash of the app. The API still decides what a session can do.
 * - Gives the page a fresh nonce and the Content-Security-Policy that requires it. Next.js reads
 *   the nonce from the request's policy and puts it on its own scripts, and the root layout puts
 *   it on the theme script.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsSession = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
  if (needsSession && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const nonce = createNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === 'development',
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  // Pages only. The API proxy routes return JSON, and built files need no policy.
  matcher: [
    '/((?!api/|v1/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|txt|xml|json|webmanifest)$).*)',
  ],
};
