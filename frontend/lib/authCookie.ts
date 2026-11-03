/**
 * A marker cookie that tells middleware.ts "someone is signed in".
 *
 * The middleware gates /dashboard and friends by looking for a cookie whose
 * name contains "auth-token", on the assumption that Supabase keeps its
 * session in one. It doesn't: supabase-js stores the session in
 * localStorage, and nothing in the app ever wrote a cookie. So after a
 * successful login, router.push('/dashboard') hit the middleware with no
 * cookie and was redirected straight back to /login.
 *
 * This marker carries no credentials and grants nothing. The middleware is a
 * convenience gate (keep logged-out visitors and crawlers off app pages); every
 * API call is still authorised by the backend verifying the Supabase JWT.
 */

export const AUTH_MARKER_COOKIE = "dig-auth-token";

// Comfortably longer than a refresh-token lifetime; cleared on sign-out.
const MAX_AGE_SECS = 60 * 60 * 24 * 30;

export function setAuthMarker(signedIn: boolean): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = signedIn
    ? `${AUTH_MARKER_COOKIE}=1; Path=/; Max-Age=${MAX_AGE_SECS}; SameSite=Lax${secure}`
    : `${AUTH_MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
