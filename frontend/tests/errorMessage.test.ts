import { describe, expect, it } from "vitest";
import { errorMessage } from "@/lib/types";

/**
 * errorMessage replaced 22 `catch (e: any)` sites.
 *
 * The risk it addresses: `any` let `e.mesage` — or any other typo — compile,
 * and the user saw the literal string "undefined" in an error banner with no
 * indication of what actually failed.
 */
describe("errorMessage", () => {
  it("reads the message from an Error", () => {
    expect(errorMessage(new Error("upload failed"))).toBe("upload failed");
  });

  it("reads the message from an Error subclass", () => {
    class ApiError extends Error {}
    expect(errorMessage(new ApiError("403 forbidden"))).toBe("403 forbidden");
  });

  it("passes a thrown string through", () => {
    // `throw "boom"` is legal JavaScript and happens in third-party code.
    expect(errorMessage("boom")).toBe("boom");
  });

  it("reads message from a plain object", () => {
    // fetch wrappers commonly reject with { message, status } rather than Error.
    expect(errorMessage({ message: "rate limited", status: 429 })).toBe("rate limited");
  });

  it("falls back when the value carries no message", () => {
    expect(errorMessage(null)).toBe("Something went wrong.");
    expect(errorMessage(undefined)).toBe("Something went wrong.");
    expect(errorMessage(42)).toBe("Something went wrong.");
    expect(errorMessage({})).toBe("Something went wrong.");
  });

  it("falls back when the message is present but empty", () => {
    // Risk: an empty banner is worse than a generic one — it looks like a
    // rendering bug rather than a failure the user can act on.
    expect(errorMessage(new Error(""))).toBe("Something went wrong.");
    expect(errorMessage({ message: "" })).toBe("Something went wrong.");
    expect(errorMessage("")).toBe("Something went wrong.");
  });

  it("falls back when message is present but not a string", () => {
    expect(errorMessage({ message: { nested: true } })).toBe("Something went wrong.");
  });

  it("honours a caller-supplied fallback", () => {
    expect(errorMessage(null, "Could not save your profile."))
      .toBe("Could not save your profile.");
  });

  it("never returns undefined", () => {
    const inputs: unknown[] = [
      null, undefined, 0, "", false, [], {}, new Error(""), Symbol("x"),
      { message: null }, { message: 0 },
    ];
    for (const i of inputs) {
      expect(typeof errorMessage(i)).toBe("string");
      expect(errorMessage(i).length).toBeGreaterThan(0);
    }
  });
});
