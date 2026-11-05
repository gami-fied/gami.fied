import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

/**
 * Sends signed-out visitors to sign in before the page renders. This only checks that a cookie
 * exists, so it prevents a flash of the app. The API still decides what a session can do.
 */
export function proxy(request: NextRequest) {
  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (signedIn) return NextResponse.next();

  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = { matcher: ['/dashboard/:path*', '/admin/:path*'] };
