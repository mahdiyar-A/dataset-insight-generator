/**
 * Reading the outcome of a Supabase email link.
 *
 * When someone clicks a verification, password-reset or email-change link,
 * Supabase verifies it and redirects here with the result in the URL — in the
 * hash for the implicit flow this client uses, sometimes in the query string.
 * Failures arrive as `error_code` / `error_description` (an expired link is
 * `otp_expired`), and the first half of a two-step email change arrives as a
 * `message`.
 *
 * The pages used to ignore all of this and wait for an auth event instead. An
 * expired link produces no event, so the reset page sat on "Validating reset
 * link..." for ever, with nothing to click.
 */

export interface AuthLinkOutcome {
  /** A user-facing explanation when the link failed, else null. */
  error: string | null;
  /** An informational message from Supabase (e.g. "confirm the other address"), else null. */
  message: string | null;
}

function readParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const merged = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  new URLSearchParams(hash).forEach((value, key) => merged.set(key, value));
  return merged;
}

export function readAuthLinkOutcome(): AuthLinkOutcome {
  const p = readParams();
  const code = p.get("error_code");
  const description = p.get("error_description");

  let error: string | null = null;
  if (code === "otp_expired") {
    error = "This link has expired or has already been used. Please request a new one.";
  } else if (code || p.get("error")) {
    error = description
      ? description.replace(/\+/g, " ")
      : "This link is invalid. Please request a new one.";
  }

  const message = p.get("message")?.replace(/\+/g, " ") ?? null;
  return { error, message };
}
