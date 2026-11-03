import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware — runs on every request before a page is rendered.
 *
 * Protected routes require the sign-in marker cookie, "dig-auth-token", which
 * the app sets whenever a Supabase session exists (lib/authCookie.ts).
 * Missing cookie → redirect to /login (preserving the intended destination).
 *
 * This used to assume Supabase kept its session in a cookie. It doesn't —
 * supabase-js uses localStorage — and nothing set one, so every signed-in
 * user was redirected from /dashboard back to /login.
 *
 * This is a fast server-side gate — it does NOT verify the JWT signature
 * (that's done by the backend on API calls). It just prevents unauthenticated
 * users from seeing dashboard HTML and stops search bots from indexing it.
 */

const PROTECTED_PREFIXES = ['/dashboard', '/workspace', '/admin', '/invite'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // "dig-auth-token" from lib/authCookie.ts; any "auth-token" name still counts,
  // so a future switch to cookie-based Supabase sessions keeps working.
  const hasSession = request.cookies
    .getAll()
    .some(c => c.name.includes('auth-token') && c.value);

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
