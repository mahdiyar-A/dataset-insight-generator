/**
 * Social sign-in helpers. The buttons must only appear for providers that are
 * actually switched on, and every provider's naming of first/last name has to
 * reach the user record.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchEnabledProviders, namesFromUser } from "@/lib/socialAuth";
import { setAuthMarker, AUTH_MARKER_COOKIE } from "@/lib/authCookie";

const settings = (external: Record<string, boolean>) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({ external }) }) as unknown as typeof fetch;

describe("fetchEnabledProviders", () => {
  it("shows only providers switched on in Supabase, in page order", async () => {
    const out = await fetchEnabledProviders("https://x.supabase.co", "key",
      settings({ email: true, github: true, google: true, azure: false }));
    expect(out.map(p => p.label)).toEqual(["Google", "GitHub"]);
  });

  it("hides every button rather than failing when settings can't be read", async () => {
    const broken = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    expect(await fetchEnabledProviders("https://x.supabase.co", "key", broken)).toEqual([]);
    expect(await fetchEnabledProviders(undefined, "key")).toEqual([]);
  });

  it("asks Microsoft for the email scope", async () => {
    const [ms] = await fetchEnabledProviders("https://x.supabase.co", "key", settings({ azure: true }));
    expect(ms.scopes).toBe("email");
  });
});

describe("namesFromUser", () => {
  it("uses DIG's own sign-up fields", () => {
    expect(namesFromUser({ email: "a@b.c", user_metadata: { first_name: "Mahdiyar", last_name: "A" } }))
      .toEqual({ firstName: "Mahdiyar", lastName: "A" });
  });

  it("reads Google and LinkedIn's given/family names", () => {
    expect(namesFromUser({ email: "a@b.c", user_metadata: { given_name: "Ada", family_name: "Lovelace", name: "Ada Lovelace" } }))
      .toEqual({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("splits GitHub and Microsoft's single name field", () => {
    expect(namesFromUser({ email: "a@b.c", user_metadata: { name: "Grace Brewster Hopper" } }))
      .toEqual({ firstName: "Grace", lastName: "Brewster Hopper" });
  });

  it("falls back to the email when no name was sent", () => {
    expect(namesFromUser({ email: "octocat@example.com", user_metadata: {} }))
      .toEqual({ firstName: "octocat", lastName: "" });
  });
});

describe("setAuthMarker", () => {
  afterEach(() => setAuthMarker(false));

  it("sets and clears the cookie the middleware gates on", () => {
    setAuthMarker(true);
    expect(document.cookie).toContain(`${AUTH_MARKER_COOKIE}=1`);
    // The middleware matches any cookie name containing "auth-token".
    expect(AUTH_MARKER_COOKIE).toContain("auth-token");
    setAuthMarker(false);
    expect(document.cookie).not.toContain(`${AUTH_MARKER_COOKIE}=1`);
  });
});
