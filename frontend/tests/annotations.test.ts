import { describe, expect, it } from "vitest";
import {
  mergeAnnotation, replaceAnnotation, markResolved, removeAnnotation,
  openThreadCount, colorFor, AVATAR_COLORS,
} from "@/lib/annotations";
import type { Annotation } from "@/lib/types";

/**
 * The annotation tree is where the collaboration workspace got things wrong.
 *
 * Two bugs these cover:
 *   1. Every incoming annotation was appended to the top-level array, so a
 *      reply arriving over SignalR rendered as a new root comment until the
 *      page was reloaded.
 *   2. Every avatar used the current user's colour, so all authors in a thread
 *      looked like the same person.
 */

function ann(over: Partial<Annotation> = {}): Annotation {
  return {
    id: "a1",
    userId: "u1",
    fileType: "pdf",
    content: "looks off",
    createdAt: "2026-01-01T00:00:00Z",
    replies: [],
    ...over,
  };
}

describe("mergeAnnotation", () => {
  it("appends a root comment", () => {
    const out = mergeAnnotation([], ann({ id: "a1" }));

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a1");
  });

  it("nests a reply under its parent instead of promoting it to a root", () => {
    // Risk: this is the bug. A reply appended to the top level renders as a new
    // comment thread, so a conversation visually fragments as it happens.
    const parent = ann({ id: "root" });
    const reply  = ann({ id: "r1", parentId: "root", content: "agreed" });

    const out = mergeAnnotation([parent], reply);

    expect(out).toHaveLength(1);
    expect(out[0].replies.map(r => r.id)).toEqual(["r1"]);
  });

  it("preserves replies already attached to the parent", () => {
    const parent = ann({ id: "root", replies: [ann({ id: "r1", parentId: "root" })] });
    const out = mergeAnnotation([parent], ann({ id: "r2", parentId: "root" }));

    expect(out[0].replies.map(r => r.id)).toEqual(["r1", "r2"]);
  });

  it("is idempotent for a root comment", () => {
    // The client inserts its own annotation optimistically and may receive the
    // same one back. Inserting twice would show a duplicate.
    const list = [ann({ id: "a1" })];
    expect(mergeAnnotation(list, ann({ id: "a1" }))).toBe(list);
  });

  it("is idempotent for a reply", () => {
    const list = [ann({ id: "root", replies: [ann({ id: "r1", parentId: "root" })] })];
    expect(mergeAnnotation(list, ann({ id: "r1", parentId: "root" }))).toBe(list);
  });

  it("drops an orphan reply rather than promoting it", () => {
    // Parent is not in the loaded list — filtered to another file, say. Showing
    // the reply as a root comment would strip it of the context that makes it
    // make sense.
    const out = mergeAnnotation([], ann({ id: "r1", parentId: "missing" }));
    expect(out).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const list = [ann({ id: "a1" })];
    const snapshot = JSON.parse(JSON.stringify(list));

    mergeAnnotation(list, ann({ id: "a2" }));

    expect(list).toEqual(snapshot);
  });
});

describe("replaceAnnotation", () => {
  it("replaces a root comment and keeps its replies", () => {
    // Risk: the edit payload from the server carries no replies. Overwriting
    // wholesale would make an edit silently delete the thread under it.
    const list = [ann({ id: "root", replies: [ann({ id: "r1", parentId: "root" })] })];

    const out = replaceAnnotation(list, ann({ id: "root", content: "edited", replies: [] }));

    expect(out[0].content).toBe("edited");
    expect(out[0].replies.map(r => r.id)).toEqual(["r1"]);
  });

  it("replaces a reply in place", () => {
    const list = [ann({ id: "root", replies: [ann({ id: "r1", parentId: "root", content: "old" })] })];

    const out = replaceAnnotation(list, ann({ id: "r1", parentId: "root", content: "new" }));

    expect(out[0].replies[0].content).toBe("new");
  });

  it("leaves the list unchanged when the id is unknown", () => {
    const list = [ann({ id: "root" })];
    expect(replaceAnnotation(list, ann({ id: "nope" }))).toEqual(list);
  });
});

describe("markResolved", () => {
  it("stamps resolvedAt on a root comment", () => {
    const out = markResolved([ann({ id: "root" })], "root", "2026-02-02T00:00:00Z");
    expect(out[0].resolvedAt).toBe("2026-02-02T00:00:00Z");
  });

  it("stamps resolvedAt on a reply", () => {
    const list = [ann({ id: "root", replies: [ann({ id: "r1", parentId: "root" })] })];
    const out = markResolved(list, "r1", "2026-02-02T00:00:00Z");

    expect(out[0].replies[0].resolvedAt).toBe("2026-02-02T00:00:00Z");
    expect(out[0].resolvedAt).toBeUndefined();
  });

  it("does not resolve siblings", () => {
    const list = [ann({ id: "a" }), ann({ id: "b" })];
    const out = markResolved(list, "a");

    expect(out[0].resolvedAt).toBeTruthy();
    expect(out[1].resolvedAt).toBeUndefined();
  });
});

describe("removeAnnotation", () => {
  it("removes a root comment together with its replies", () => {
    const list = [ann({ id: "root", replies: [ann({ id: "r1", parentId: "root" })] })];
    expect(removeAnnotation(list, "root")).toEqual([]);
  });

  it("removes a reply without touching the parent", () => {
    const list = [ann({ id: "root", replies: [
      ann({ id: "r1", parentId: "root" }), ann({ id: "r2", parentId: "root" }),
    ] })];

    const out = removeAnnotation(list, "r1");

    expect(out).toHaveLength(1);
    expect(out[0].replies.map(r => r.id)).toEqual(["r2"]);
  });

  it("is a no-op for an unknown id", () => {
    const list = [ann({ id: "root" })];
    expect(removeAnnotation(list, "nope")).toEqual(list);
  });
});

describe("openThreadCount", () => {
  it("counts only unresolved root comments", () => {
    const list = [
      ann({ id: "a" }),
      ann({ id: "b", resolvedAt: "2026-01-02T00:00:00Z" }),
      ann({ id: "c" }),
    ];
    expect(openThreadCount(list)).toBe(2);
  });

  it("ignores replies", () => {
    // Replies are part of a thread, not threads themselves — counting them
    // would overstate how much is outstanding.
    const list = [ann({ id: "a", replies: [ann({ id: "r1", parentId: "a" })] })];
    expect(openThreadCount(list)).toBe(1);
  });
});

describe("colorFor", () => {
  it("is deterministic", () => {
    // Risk: the server previously derived colours from string.GetHashCode(),
    // which is randomised per process. Users changed colour on every restart.
    expect(colorFor("user-123")).toBe(colorFor("user-123"));
  });

  it("gives different users different colours in the common case", () => {
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => colorFor(`user-${i}`)));
    expect(seen.size).toBeGreaterThan(3);
  });

  it("always returns a palette colour", () => {
    for (let i = 0; i < 60; i++) {
      expect(AVATAR_COLORS).toContain(colorFor(`u${i}`));
    }
  });

  it("falls back to a neutral colour for a missing id", () => {
    expect(colorFor(undefined)).toBe("#64748b");
    expect(colorFor(null)).toBe("#64748b");
    expect(colorFor("")).toBe("#64748b");
  });
});
