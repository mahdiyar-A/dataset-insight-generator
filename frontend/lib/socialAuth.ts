/**
 * Sign-in with Google, Microsoft, GitHub and LinkedIn, through Supabase.
 *
 * Which buttons appear is read from Supabase at runtime, so a provider shows
 * up on the site the moment it is switched on in Supabase, and never before:
 * a button for an unconfigured provider would send people to an error page.
 */

import type { Provider, User } from "@supabase/supabase-js";

export interface SocialProvider {
  id: Provider;
  label: string;
  /** Extra OAuth scopes. Microsoft needs "email" or it may not return one. */
  scopes?: string;
}

// Order on the page: most people first.
export const SOCIAL_PROVIDERS: SocialProvider[] = [
  { id: "google",        label: "Google" },
  { id: "azure",         label: "Microsoft", scopes: "email" },
  { id: "github",        label: "GitHub" },
  { id: "linkedin_oidc", label: "LinkedIn" },
];

/**
 * Providers switched on in Supabase, from its public settings endpoint
 * (`external` maps each provider id to true/false). Returns [] on any error,
 * which simply hides the buttons and leaves email sign-in working.
 */
export async function fetchEnabledProviders(
  supabaseUrl: string | undefined,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SocialProvider[]> {
  if (!supabaseUrl || !apiKey) return [];
  try {
    const res = await fetchImpl(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: apiKey } });
    if (!res.ok) return [];
    const external: Record<string, boolean> = (await res.json())?.external ?? {};
    return SOCIAL_PROVIDERS.filter(p => external[p.id] === true);
  } catch {
    return [];
  }
}

/**
 * First and last name from whatever the provider sent. Each names these
 * differently — Google and LinkedIn send given_name/family_name, GitHub and
 * Microsoft a single `name` — and DIG's own sign-up sends first_name/last_name.
 * Falls back to the part of the email before the @, as before.
 */
export function namesFromUser(user: Pick<User, "email" | "user_metadata">): { firstName: string; lastName: string } {
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

  const first = str(m.first_name) || str(m.given_name);
  const last  = str(m.last_name)  || str(m.family_name);
  if (first) return { firstName: first, lastName: last };

  const full = str(m.full_name) || str(m.name);
  if (full) {
    const parts = full.split(/\s+/);
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  return { firstName: user.email?.split("@")[0] || "User", lastName: "" };
}
