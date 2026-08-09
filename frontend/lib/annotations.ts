import type { Annotation } from "@/lib/types";

/**
 * Pure helpers for maintaining the annotation tree in the collaboration
 * workspace.
 *
 * Annotations are two levels deep: top-level comments, each with a flat list of
 * replies. Live SignalR events deliver one annotation at a time and it may be
 * either kind — the only way to tell is `parentId`.
 *
 * These live in their own module rather than inside the workspace page because
 * they carry the logic most likely to be wrong, and testing them through a
 * rendered page would mean standing up a SignalR connection to exercise a pure
 * array transform.
 *
 * Bug they were extracted from: every incoming annotation was appended to the
 * top-level list, so a reply arriving over the wire rendered as a new root
 * comment until the page was reloaded.
 */

/** True if `id` matches this annotation or any of its replies. */
function contains(list: Annotation[], id: string): boolean {
  return list.some(a => a.id === id || (a.replies ?? []).some(r => r.id === id));
}

/**
 * Insert an annotation, nesting it under its parent when it is a reply.
 *
 * Idempotent: re-inserting an annotation already in the tree returns the same
 * array reference. That matters because the client inserts its own annotation
 * optimistically and may then receive it back over the wire.
 */
export function mergeAnnotation(list: Annotation[], ann: Annotation): Annotation[] {
  if (contains(list, ann.id)) return list;

  if (ann.parentId) {
    // Orphan reply — parent is not loaded (filtered out, or on another file).
    // Dropping it is better than promoting it to a root comment, which is what
    // the original code did.
    if (!list.some(a => a.id === ann.parentId)) return list;

    return list.map(a => a.id === ann.parentId
      ? { ...a, replies: [...(a.replies ?? []), ann] }
      : a);
  }

  return [...list, { ...ann, replies: ann.replies ?? [] }];
}

/**
 * Replace an annotation in place, at either level, preserving its replies.
 *
 * Note `?? ` is not enough to protect the replies: an edit payload from the
 * server carries `replies: []`, which is a value, so `ann.replies ?? a.replies`
 * picks the empty array and silently deletes the whole thread under the comment
 * being edited. Only fall back when the incoming list is actually empty.
 */
export function replaceAnnotation(list: Annotation[], ann: Annotation): Annotation[] {
  return list.map(a => {
    if (a.id === ann.id) {
      const replies = ann.replies?.length ? ann.replies : (a.replies ?? []);
      return { ...ann, replies };
    }
    if ((a.replies ?? []).some(r => r.id === ann.id))
      return { ...a, replies: a.replies.map(r => r.id === ann.id ? ann : r) };
    return a;
  });
}

/** Stamp resolvedAt on one annotation at either level. */
export function markResolved(
  list: Annotation[],
  id: string,
  at: string = new Date().toISOString(),
): Annotation[] {
  return list.map(a => {
    if (a.id === id) return { ...a, resolvedAt: at };
    if ((a.replies ?? []).some(r => r.id === id))
      return { ...a, replies: a.replies.map(r => r.id === id ? { ...r, resolvedAt: at } : r) };
    return a;
  });
}

/**
 * Remove an annotation at either level.
 *
 * Deleting a root comment takes its replies with it — that matches the server,
 * where replies cascade on parent delete.
 */
export function removeAnnotation(list: Annotation[], id: string): Annotation[] {
  return list
    .filter(a => a.id !== id)
    .map(a => (a.replies ?? []).some(r => r.id === id)
      ? { ...a, replies: a.replies.filter(r => r.id !== id) }
      : a);
}

/** Count unresolved top-level threads for the badge in the panel header. */
export function openThreadCount(list: Annotation[]): number {
  return list.filter(a => !a.resolvedAt).length;
}

/**
 * Palette shared with CollaborationHub.ColorFor on the server so an avatar
 * drawn locally matches the colour collaborators see for the same person.
 */
export const AVATAR_COLORS = [
  "#3b82f6", "#a855f7", "#10b981", "#f97316",
  "#ec4899", "#06b6d4", "#84cc16", "#f59e0b",
];

/** Deterministic per-user colour. Same input always yields the same colour. */
export function colorFor(userId?: string | null): string {
  if (!userId) return "#64748b";
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
