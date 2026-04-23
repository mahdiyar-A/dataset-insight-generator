import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware — runs on every request before it reaches a page.
 *
 * Protected routes (/dashboard/*) require a Supabase session cookie.
 * Supabase stores the session as a cookie whose name contains "auth-token".
 * If the cookie is missing the user is redirected to /login.
 *
 * NOTE: This is a fast, server-side gate — it doesn't verify the JWT
 * signature (that's expensive and done by the backend on API calls).
 * It just prevents the dashboard HTML from being served at all to
 * unauthenticated users, which stops bots and avoids client-side flash.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect the dashboard — public pages (login, register, landing) are open
  if (pathname.startsWith('/dashboard')) {
    // Supabase stores session cookies with a name like "sb-<project-ref>-auth-token"
    const hasSession = request.cookies
      .getAll()
      .some(c => c.name.includes('auth-token') && c.value);

    if (!hasSession) {
      // Redirect unauthenticated users to login, preserving where they were going
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all routes except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
