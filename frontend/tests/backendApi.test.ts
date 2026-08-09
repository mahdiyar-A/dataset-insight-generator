import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BackendAPI from "@/lib/BackendAPI";

/**
 * BackendAPI is the single boundary between the UI and the server. Almost every
 * bug it can carry is silent: a wrong URL 404s into a generic error banner, a
 * missing Authorization header 401s, and a query parameter dropped on the floor
 * just returns unfiltered data that looks plausible.
 *
 * fetch is stubbed rather than mocked at the module level so the assertions are
 * about the actual request that would go over the wire.
 */

const TOKEN = "test-token";
const BASE  = "http://test.local";

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  return {
    ok,
    status,
    json:  async () => body,
    text:  async () => JSON.stringify(body),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The URL the most recent fetch call was made against. */
function lastUrl(): string {
  return String(fetchMock.mock.calls.at(-1)?.[0]);
}

/** The RequestInit the most recent fetch call was made with. */
function lastInit(): RequestInit {
  return (fetchMock.mock.calls.at(-1)?.[1] ?? {}) as RequestInit;
}

describe("auth headers", () => {
  it("sends the bearer token on protected calls", async () => {
    // Risk: a missing header 401s, and the UI shows a generic failure rather
    // than prompting the user to sign in again.
    await BackendAPI.getUserProfile(TOKEN);

    const headers = lastInit().headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("targets the configured API base, not a hardcoded host", async () => {
    await BackendAPI.getUserProfile(TOKEN);
    expect(lastUrl()).toBe(`${BASE}/api/user/me`);
  });
});

describe("error handling", () => {
  it("throws the server-supplied message when a request fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: "Dataset too large" }),
      json: async () => ({ message: "Dataset too large" }),
    } as unknown as Response);

    await expect(BackendAPI.getUserProfile(TOKEN))
      .rejects.toThrow("Dataset too large");
  });

  it("falls back to the error field when there is no message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: "NOT_FOUND" }),
      json: async () => ({ error: "NOT_FOUND" }),
    } as unknown as Response);

    await expect(BackendAPI.getUserProfile(TOKEN)).rejects.toThrow("NOT_FOUND");
  });

  it("falls back to a caller message when the body is empty", async () => {
    // Risk: an empty error body must not surface as an empty banner.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "",
      json: async () => ({}),
    } as unknown as Response);

    await expect(BackendAPI.getUserProfile(TOKEN)).rejects.toThrow(/Failed to fetch profile/);
  });

  it("does not throw on a successful response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "u1", email: "a@b.c" }));
    await expect(BackendAPI.getUserProfile(TOKEN)).resolves.toEqual({ id: "u1", email: "a@b.c" });
  });
});

describe("adminGetUsers query building", () => {
  it("omits filters that were not supplied", async () => {
    // Risk: sending plan=null as a literal string would filter on the text
    // "null" and silently return nothing.
    await BackendAPI.adminGetUsers(TOKEN, { page: 2, size: 20 });

    const url = new URL(lastUrl());
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("size")).toBe("20");
    expect(url.searchParams.has("plan")).toBe(false);
    expect(url.searchParams.has("search")).toBe(false);
  });

  it("includes filters that were supplied", async () => {
    await BackendAPI.adminGetUsers(TOKEN, { plan: "pro", search: "alice@example.com" });

    const url = new URL(lastUrl());
    expect(url.searchParams.get("plan")).toBe("pro");
    expect(url.searchParams.get("search")).toBe("alice@example.com");
  });

  it("url-encodes a search term containing special characters", async () => {
    // Risk: an unencoded '&' or '+' truncates or corrupts the query.
    await BackendAPI.adminGetUsers(TOKEN, { search: "a+b & c@d.com" });

    const url = new URL(lastUrl());
    expect(url.searchParams.get("search")).toBe("a+b & c@d.com");
  });

  it("applies sensible defaults with no options at all", async () => {
    await BackendAPI.adminGetUsers(TOKEN);

    const url = new URL(lastUrl());
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("size")).toBe("25");
  });
});

describe("annotations", () => {
  it("sends parentId as null for a top-level comment", async () => {
    await BackendAPI.addAnnotation(TOKEN, "ws-1", {
      fileType: "pdf", content: "first",
    });

    const body = JSON.parse(String(lastInit().body));
    expect(body.parentId).toBeNull();
    expect(body.fileType).toBe("pdf");
    expect(body.content).toBe("first");
  });

  it("sends parentId for a reply", async () => {
    // Risk: dropping parentId turns every reply into a new root thread — the
    // server has no other way to know it is a reply.
    await BackendAPI.addAnnotation(TOKEN, "ws-1", {
      fileType: "pdf", content: "agreed", parentId: "root-1",
    });

    expect(JSON.parse(String(lastInit().body)).parentId).toBe("root-1");
  });

  it("posts to the workspace-scoped annotations route", async () => {
    await BackendAPI.addAnnotation(TOKEN, "ws-42", { fileType: "pdf", content: "x" });

    expect(lastUrl()).toBe(`${BASE}/api/workspaces/ws-42/annotations`);
    expect(lastInit().method).toBe("POST");
  });

  it("omits the fileType filter when fetching all annotations", async () => {
    await BackendAPI.getAnnotations(TOKEN, "ws-1");
    expect(lastUrl()).toBe(`${BASE}/api/workspaces/ws-1/annotations`);
  });

  it("includes the fileType filter when one is given", async () => {
    await BackendAPI.getAnnotations(TOKEN, "ws-1", "pdf");
    expect(lastUrl()).toContain("fileType=pdf");
  });
});
