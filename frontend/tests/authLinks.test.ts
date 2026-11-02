/**
 * readAuthLinkOutcome turns the URL Supabase redirects to into a message.
 * The reset page used to ignore it and wait for an auth event; an expired link
 * never produces one, so users were stuck on "Validating reset link..." with
 * nothing to click.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readAuthLinkOutcome } from "@/lib/authLinks";

function visit(url: string) {
  window.history.replaceState(null, "", url);
}

afterEach(() => visit("/"));

describe("readAuthLinkOutcome", () => {
  it("explains an expired link in plain words", () => {
    visit("/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    const out = readAuthLinkOutcome();
    expect(out.error).toMatch(/expired/i);
    expect(out.error).toMatch(/request a new one/i);
  });

  it("passes through Supabase's own description for other failures", () => {
    visit("/verify-email#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user");
    expect(readAuthLinkOutcome().error).toBe("Database error saving new user");
  });

  it("reads errors from the query string too", () => {
    visit("/verify-email?error=access_denied&error_code=otp_expired");
    expect(readAuthLinkOutcome().error).toMatch(/expired/i);
  });

  it("reports the first half of a two-step email change as a message, not an error", () => {
    visit("/verify-email-change#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email");
    const out = readAuthLinkOutcome();
    expect(out.error).toBeNull();
    expect(out.message).toMatch(/other email/);
  });

  it("finds nothing wrong with a successful link", () => {
    visit("/verify-email#access_token=abc&refresh_token=def&type=signup");
    expect(readAuthLinkOutcome()).toEqual({ error: null, message: null });
  });
});
