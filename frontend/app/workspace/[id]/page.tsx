"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import * as signalR from "@microsoft/signalr";
import { errorMessage } from "@/lib/types";
import type { Workspace } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────
type Annotation = {
  id: string; userId: string; fileType: string; content: string;
  position?: string | null; createdAt: string; resolvedAt?: string;
  parentId?: string; authorName?: string; authorEmail?: string;
  replies: Annotation[];
};

type Presence = { userId: string; userName: string; color: string; fileType?: string };

type Cursor = {
  userId: string; userName: string; color: string;
  fileType: string; x: number; y: number; at: number;
};

type FileItem = {
  key: string; label: string; icon: string; available: boolean; editable: boolean;
};

/**
 * Catalogue of file kinds. Deliberately has no `available` flag baked in —
 * availability depends on the workspace being viewed and is computed per render.
 *
 * The previous version stored `available` on these module-level objects and
 * mutated them after loading a workspace. Three problems: mutating a module
 * constant does not trigger a re-render, the values leaked into the next
 * workspace the user opened, and two tabs shared the same objects.
 */
const FILE_CATALOG = [
  { key: "pdf",          label: "PDF Report",   icon: "📄", editable: false, flag: "hasPdf" },
  { key: "word",         label: "Word Report",  icon: "📝", editable: true,  flag: "hasWord" },
  { key: "pptx",         label: "Presentation", icon: "📊", editable: true,  flag: "hasPptx" },
  { key: "cleaned_csv",  label: "Cleaned CSV",  icon: "🗂",  editable: true,  flag: "hasCleanedCsv" },
  { key: "original_csv", label: "Original CSV", icon: "📋", editable: false, flag: "hasOriginalCsv" },
  { key: "charts",       label: "Charts",       icon: "📈", editable: false, flag: "hasCharts" },
] as const;

// A remote cursor disappears if we have not heard from it for this long. Without
// this a collaborator who closes their laptop leaves a cursor frozen on screen.
const CURSOR_TTL_MS = 5000;

// Cursor positions are sent at pointer-move rate; throttle to ~20/sec.
const CURSOR_THROTTLE_MS = 50;

// ── Annotation tree helpers ───────────────────────────────────────────────────
//
// Annotations are a two-level tree: top-level comments each with a flat list of
// replies. Live events deliver a single annotation, which may be either. The
// previous version appended everything to the top-level array, so a reply
// arriving over the wire rendered as a new root comment until the page reloaded.

function mergeAnnotation(list: Annotation[], ann: Annotation): Annotation[] {
  if (list.some(a => a.id === ann.id || a.replies?.some(r => r.id === ann.id)))
    return list;   // already present — e.g. our own optimistic insert echoed back

  if (ann.parentId) {
    return list.map(a => a.id === ann.parentId
      ? { ...a, replies: [...(a.replies ?? []), ann] }
      : a);
  }
  return [...list, { ...ann, replies: ann.replies ?? [] }];
}

function replaceAnnotation(list: Annotation[], ann: Annotation): Annotation[] {
  return list.map(a => {
    if (a.id === ann.id) return { ...ann, replies: ann.replies ?? a.replies ?? [] };
    if (a.replies?.some(r => r.id === ann.id))
      return { ...a, replies: a.replies.map(r => r.id === ann.id ? ann : r) };
    return a;
  });
}

function markResolved(list: Annotation[], id: string): Annotation[] {
  const at = new Date().toISOString();
  return list.map(a => {
    if (a.id === id) return { ...a, resolvedAt: at };
    if (a.replies?.some(r => r.id === id))
      return { ...a, replies: a.replies.map(r => r.id === id ? { ...r, resolvedAt: at } : r) };
    return a;
  });
}

function removeAnnotation(list: Annotation[], id: string): Annotation[] {
  return list
    .filter(a => a.id !== id)
    .map(a => a.replies?.some(r => r.id === id)
      ? { ...a, replies: a.replies.filter(r => r.id !== id) }
      : a);
}

/**
 * Stable per-user colour. Mirrors CollaborationHub.ColorFor so an avatar drawn
 * locally matches the colour collaborators see for the same person.
 *
 * The previous version rendered every annotation avatar in the *current user's*
 * colour, so every comment in a thread looked like it came from the same person.
 */
const COLORS = [
  "#3b82f6", "#a855f7", "#10b981", "#f97316",
  "#ec4899", "#06b6d4", "#84cc16", "#f59e0b",
];

function colorFor(userId?: string): string {
  if (!userId) return "#64748b";
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function WorkspacePage() {
  const router  = useRouter();
  const params  = useParams();
  const wsId    = params.id as string;
  const { token, user, isLoading } = useAuth();

  const [workspace,    setWorkspace]    = useState<Workspace | null>(null);
  const [activeKey,    setActiveKey]    = useState<string | null>(null);
  const [annotations,  setAnnotations]  = useState<Annotation[]>([]);
  const [presence,     setPresence]     = useState<Presence[]>([]);
  const [cursors,      setCursors]      = useState<Record<string, Cursor>>({});
  const [newComment,   setNewComment]   = useState("");
  const [replyTo,      setReplyTo]      = useState<string | null>(null);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editDraft,    setEditDraft]    = useState("");
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  const hubRef        = useRef<signalR.HubConnection | null>(null);
  const previewRef    = useRef<HTMLDivElement | null>(null);
  const lastCursorAt  = useRef(0);

  // Availability is derived from the loaded workspace on every render rather
  // than stored, so switching workspaces cannot show stale file states.
  const files: FileItem[] = FILE_CATALOG.map(f => ({
    key: f.key, label: f.label, icon: f.icon, editable: f.editable,
    available: Boolean(workspace?.analysis?.[f.flag]),
  }));

  const activeFile = files.find(f => f.key === activeKey) ?? null;

  // ── Load workspace ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !token) { router.replace("/login"); return; }
    if (!token) return;

    let cancelled = false;
    BackendAPI.getWorkspace(token, wsId)
      .then(ws => {
        if (cancelled) return;
        setWorkspace(ws);
        setAnnotations(ws.annotations ?? []);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setError(errorMessage(e));
        setLoading(false);
      });

    // Guards against a late response from a previous workspace overwriting the
    // current one when the user navigates between workspaces quickly.
    return () => { cancelled = true; };
  }, [token, isLoading, wsId, router]);

  // ── SignalR connection ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !wsId) return;

    const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5150").replace(/\/$/, "");
    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${apiBase}/hubs/collab?access_token=${token}`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Sent to us alone on join — the people already in the room. UserJoined only
    // fires for arrivals after us, so without this the room looks empty to
    // whoever joins second.
    hub.on("Presence", ({ users }: { users: Presence[] }) => {
      setPresence(users ?? []);
    });

    hub.on("UserJoined", (data: Presence) => {
      setPresence(prev => [...prev.filter(p => p.userId !== data.userId), data]);
    });

    hub.on("UserLeft", ({ userId }: { userId: string }) => {
      setPresence(prev => prev.filter(p => p.userId !== userId));
      setCursors(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    hub.on("CursorMoved", (c: Omit<Cursor, "at">) => {
      setCursors(prev => ({ ...prev, [c.userId]: { ...c, at: Date.now() } }));
    });

    hub.on("AnnotationAdded", (ann: Annotation) => {
      setAnnotations(prev => mergeAnnotation(prev, ann));
    });

    hub.on("AnnotationUpdated", (ann: Annotation) => {
      setAnnotations(prev => replaceAnnotation(prev, ann));
    });

    hub.on("AnnotationResolved", (id: string) => {
      setAnnotations(prev => markResolved(prev, id));
    });

    hub.on("AnnotationDeleted", (id: string) => {
      setAnnotations(prev => removeAnnotation(prev, id));
    });

    // Re-join after an automatic reconnect, otherwise the connection is live but
    // no longer in the workspace group and all events stop arriving silently.
    hub.onreconnected(() => {
      hub.invoke("JoinWorkspace", wsId).catch(() => {});
    });

    hub.start()
      .then(() => hub.invoke("JoinWorkspace", wsId))
      .catch(e => console.warn("[Hub] Connection failed:", e));

    hubRef.current = hub;
    return () => { hub.stop(); hubRef.current = null; };
  }, [token, wsId]);

  // ── Expire stale remote cursors ───────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - CURSOR_TTL_MS;
      setCursors(prev => {
        const live = Object.fromEntries(
          Object.entries(prev).filter(([, c]) => c.at > cutoff));
        // Return the same object when nothing expired so React can skip the render.
        return Object.keys(live).length === Object.keys(prev).length ? prev : live;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Broadcast our own cursor ──────────────────────────────────────────────
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!hubRef.current || !activeKey || !previewRef.current) return;

    const now = Date.now();
    if (now - lastCursorAt.current < CURSOR_THROTTLE_MS) return;
    lastCursorAt.current = now;

    // Percentages, not pixels: collaborators run different window sizes, and an
    // absolute offset would land somewhere unrelated on their screen.
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;

    hubRef.current.invoke("MoveCursor", wsId, activeKey, x, y, 1).catch(() => {});
  }, [activeKey, wsId]);

  // ── File permission check ─────────────────────────────────────────────────
  const canAccess = (fileKey: string): boolean => {
    if (!workspace) return false;
    const perm = workspace.myPermissions?.[fileKey] ?? workspace.myPermissions?.["all"];
    return perm !== "none";
  };

  const canEdit = (fileKey: string): boolean => {
    const perm = workspace?.myPermissions?.[fileKey] ?? workspace?.myPermissions?.["all"];
    return perm === "edit";
  };

  // ── Download file ─────────────────────────────────────────────────────────
  const handleDownload = async (fileKey: string) => {
    if (!token || !workspace) return;
    if (!canAccess(fileKey)) { alert("You don't have permission to download this file."); return; }
    try {
      const type = fileKey === "pdf" ? "report" : fileKey.replace("_csv", "");
      const { url, fileName } = await BackendAPI.getDownloadUrl(
        token, workspace.analysisId, type);
      const a = Object.assign(document.createElement("a"),
        { href: url, download: fileName, target: "_blank" });
      a.click();
    } catch (e) { alert(errorMessage(e)); }
  };

  // ── Annotation actions ────────────────────────────────────────────────────
  //
  // Every handler updates local state as well as broadcasting. The hub sends to
  // Clients.OthersInGroup — deliberately, so senders do not echo their own
  // events — which meant the acting user previously saw nothing happen at all:
  // you posted a comment, resolved a thread or deleted one, and your own screen
  // was unchanged until a reload. Collaborators saw the update; you did not.

  const handleAddAnnotation = async () => {
    if (!newComment.trim() || !token || !activeFile) return;
    try {
      const ann: Annotation = await BackendAPI.addAnnotation(token, wsId, {
        fileType: activeFile.key,
        content:  newComment.trim(),
        parentId: replyTo,
      });
      setAnnotations(prev => mergeAnnotation(prev, { ...ann, replies: ann.replies ?? [] }));
      setNewComment("");
      setReplyTo(null);
      hubRef.current?.invoke("BroadcastAnnotation", wsId, ann).catch(() => {});
    } catch (e) { setError(errorMessage(e)); }
  };

  const handleResolve = async (annId: string) => {
    if (!token) return;
    try {
      await BackendAPI.resolveAnnotation(token, wsId, annId);
      setAnnotations(prev => markResolved(prev, annId));
      hubRef.current?.invoke("BroadcastAnnotationResolved", wsId, annId).catch(() => {});
    } catch (e) { setError(errorMessage(e)); }
  };

  const handleDeleteAnnotation = async (annId: string) => {
    if (!token || !confirm("Delete this annotation?")) return;
    try {
      await BackendAPI.deleteAnnotation(token, wsId, annId);
      setAnnotations(prev => removeAnnotation(prev, annId));
      hubRef.current?.invoke("BroadcastAnnotationDeleted", wsId, annId).catch(() => {});
    } catch (e) { setError(errorMessage(e)); }
  };

  // Editing was reachable from neither the UI nor the API layer, even though
  // both PATCH /annotations/{id} and the hub's BroadcastAnnotationEdit existed.
  const handleStartEdit = (ann: Annotation) => {
    setEditingId(ann.id);
    setEditDraft(ann.content);
  };

  const handleSaveEdit = async () => {
    if (!token || !editingId || !editDraft.trim()) return;
    try {
      const updated: Annotation = await BackendAPI.editAnnotation(
        token, wsId, editingId, editDraft.trim());
      setAnnotations(prev => replaceAnnotation(prev, updated));
      hubRef.current?.invoke("BroadcastAnnotationEdit", wsId, updated).catch(() => {});
      setEditingId(null);
      setEditDraft("");
    } catch (e) { setError(errorMessage(e)); }
  };

  // ── Filter annotations for active file ───────────────────────────────────
  const visibleAnnotations = annotations.filter(
    a => !activeFile || a.fileType === activeFile.key);

  const activeCursors = Object.values(cursors).filter(c => c.fileType === activeKey);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#080d1a", display: "flex",
      alignItems: "center", justifyContent: "center", color: "#64748b" }}>
      Loading workspace…
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#080d1a", display: "flex",
      alignItems: "center", justifyContent: "center", flexDirection: "column",
      gap: "16px", color: "#f87171" }}>
      <p>{error}</p>
      <button onClick={() => router.back()} style={{ background: "none", border: "none",
        color: "#64748b", cursor: "pointer" }}>← Go back</button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080d1a", color: "#e2e8f0",
      display: "grid", gridTemplateColumns: "260px 1fr 320px",
      gridTemplateRows: "56px 1fr", height: "100vh", overflow: "hidden" }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center",
        padding: "0 20px", gap: "16px",
        borderBottom: "1px solid rgba(30,41,59,0.8)",
        background: "rgba(8,13,26,0.98)" }}>

        <button onClick={() => router.push("/dashboard")}
          style={{ background: "none", border: "none", color: "#64748b",
            cursor: "pointer", fontSize: "0.85rem" }}>
          ← Dashboard
        </button>

        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700,
            color: "#e2e8f0" }}>
            {workspace?.analysis?.fileName ?? "Shared Workspace"}
          </h1>
        </div>

        {/* Live presence avatars */}
        <div style={{ display: "flex", gap: "-8px" }}>
          {presence.map((p, i) => (
            <div key={p.userId} title={p.userName} style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: p.color, border: "2px solid #080d1a",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.7rem", fontWeight: 700, color: "#fff",
              marginLeft: i > 0 ? "-8px" : 0, zIndex: presence.length - i,
            }}>
              {(p.userName || "?").charAt(0).toUpperCase()}
            </div>
          ))}
          {presence.length > 0 && (
            <span style={{ marginLeft: "8px", color: "#475569", fontSize: "0.75rem",
              display: "flex", alignItems: "center" }}>
              {presence.length} online
            </span>
          )}
        </div>
      </div>

      {/* ── Left: hierarchical file tree ─────────────────────────────────── */}
      <div style={{ borderRight: "1px solid rgba(30,41,59,0.8)",
        background: "rgba(8,13,26,0.6)", padding: "16px", overflowY: "auto" }}>
        <p style={{ margin: "0 0 12px", color: "#475569", fontSize: "0.72rem",
          textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Files
        </p>

        {files.map(file => {
          const accessible = file.available && canAccess(file.key);
          const isActive   = activeKey === file.key;

          return (
            <div key={file.key}
              onClick={() => accessible && setActiveKey(file.key)}
              style={{ padding: "10px 12px", borderRadius: "8px", marginBottom: "4px",
                cursor: accessible ? "pointer" : "not-allowed",
                background: isActive ? "rgba(37,99,235,0.15)" : "transparent",
                border: isActive ? "1px solid rgba(37,99,235,0.3)" : "1px solid transparent",
                opacity: file.available ? 1 : 0.35,
                display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1rem" }}>{file.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: "0.83rem", fontWeight: 500,
                  color: isActive ? "#93c5fd" : "#cbd5e1",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.label}
                </p>
                {!file.available && (
                  <p style={{ margin: 0, fontSize: "0.68rem", color: "#374151" }}>Not generated</p>
                )}
                {file.available && !canAccess(file.key) && (
                  <p style={{ margin: 0, fontSize: "0.68rem", color: "#374151" }}>No access</p>
                )}
              </div>
              {file.available && accessible && (
                <button
                  onClick={e => { e.stopPropagation(); handleDownload(file.key); }}
                  title="Download"
                  style={{ background: "none", border: "none", color: "#475569",
                    cursor: "pointer", fontSize: "0.85rem", padding: "2px" }}>
                  ↓
                </button>
              )}
            </div>
          );
        })}

        {/* Analysis info */}
        {workspace?.analysis && (
          <div style={{ marginTop: "24px", padding: "14px", borderRadius: "10px",
            background: "rgba(15,23,42,0.6)", border: "1px solid rgba(30,41,59,0.6)" }}>
            <p style={{ margin: "0 0 6px", color: "#475569", fontSize: "0.72rem",
              textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Dataset
            </p>
            <p style={{ margin: "0 0 4px", fontSize: "0.82rem", color: "#94a3b8" }}>
              {workspace.analysis.rowCount?.toLocaleString() ?? "—"} rows ×{" "}
              {workspace.analysis.columnCount ?? "—"} cols
            </p>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#475569" }}>
              {workspace.analysis.completedAt
                ? new Date(workspace.analysis.completedAt).toLocaleDateString("en-CA")
                : "In progress"}
            </p>
          </div>
        )}
      </div>

      {/* ── Centre: file preview area ─────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden",
        background: "rgba(2,6,23,0.8)" }}>

        {activeFile ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px",
              marginBottom: "20px" }}>
              <span style={{ fontSize: "1.5rem" }}>{activeFile.icon}</span>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                {activeFile.label}
              </h2>
              <button
                onClick={() => handleDownload(activeFile.key)}
                style={{ marginLeft: "auto", padding: "7px 16px", borderRadius: "8px",
                  border: "1px solid rgba(59,130,246,0.35)", background: "transparent",
                  color: "#93c5fd", fontSize: "0.8rem", cursor: "pointer" }}>
                Download
              </button>
            </div>

            {/* Permission badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "4px 12px", borderRadius: "999px", marginBottom: "20px",
              background: canEdit(activeFile.key)
                ? "rgba(16,185,129,0.1)" : "rgba(30,41,59,0.5)",
              border: canEdit(activeFile.key)
                ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(30,41,59,0.6)" }}>
              <span style={{ color: canEdit(activeFile.key) ? "#6ee7b7" : "#64748b",
                fontSize: "0.72rem", fontWeight: 600 }}>
                {canEdit(activeFile.key) ? "✎ Editor" : "👁 Viewer"}
              </span>
            </div>

            {/* Shared surface — cursors are positioned relative to this box */}
            <div
              ref={previewRef}
              onPointerMove={handlePointerMove}
              style={{ position: "relative", background: "rgba(15,23,42,0.7)",
                borderRadius: "12px", border: "1px solid rgba(30,41,59,0.7)",
                padding: "48px", textAlign: "center", color: "#334155",
                minHeight: "320px", overflow: "hidden" }}>

              <p style={{ fontSize: "2rem", margin: "0 0 12px" }}>{activeFile.icon}</p>
              <p style={{ margin: "0 0 6px", color: "#64748b", fontSize: "0.9rem" }}>
                {activeFile.label}
              </p>
              <p style={{ margin: 0, color: "#334155", fontSize: "0.78rem" }}>
                Download to open in your preferred application.
                Use the annotations panel to leave comments for your team.
              </p>
              {activeCursors.length > 0 && (
                <p style={{ margin: "16px 0 0", color: "#475569", fontSize: "0.72rem" }}>
                  {activeCursors.length === 1
                    ? `${activeCursors[0].userName} is viewing this file`
                    : `${activeCursors.length} collaborators are viewing this file`}
                </p>
              )}

              {/* Live collaborator cursors. Coordinates arrive as percentages of
                  this box, so they land in the same relative spot regardless of
                  each viewer's window size. */}
              {activeCursors.map(c => (
                <div key={c.userId} style={{
                  position: "absolute", left: `${c.x}%`, top: `${c.y}%`,
                  pointerEvents: "none", transform: "translate(-2px, -2px)",
                  transition: "left 60ms linear, top 60ms linear", zIndex: 5 }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M2 2 L2 14 L5.5 10.5 L8 15.5 L10 14.5 L7.5 9.5 L12.5 9.5 Z"
                      fill={c.color} stroke="#0b1220" strokeWidth="1" strokeLinejoin="round" />
                  </svg>
                  <span style={{ position: "absolute", left: "16px", top: "12px",
                    background: c.color, color: "#fff", fontSize: "0.65rem",
                    fontWeight: 600, padding: "2px 6px", borderRadius: "4px",
                    whiteSpace: "nowrap" }}>
                    {c.userName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center",
            justifyContent: "center", color: "#334155", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "2.5rem", opacity: 0.3 }}>📁</span>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>
              Select a file from the left panel
            </p>
          </div>
        )}
      </div>

      {/* ── Right: annotations panel ──────────────────────────────────────── */}
      <div style={{ borderLeft: "1px solid rgba(30,41,59,0.8)",
        background: "rgba(8,13,26,0.7)", display: "flex",
        flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "16px 16px 12px",
          borderBottom: "1px solid rgba(30,41,59,0.6)" }}>
          <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "#94a3b8" }}>
            Annotations
            {activeFile && <span style={{ marginLeft: "8px", color: "#475569",
              fontWeight: 400, fontSize: "0.8rem" }}>
              ({visibleAnnotations.filter(a => !a.resolvedAt).length} open)
            </span>}
          </h3>
        </div>

        {/* Annotation list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          {!activeFile ? (
            <p style={{ color: "#334155", fontSize: "0.82rem", textAlign: "center",
              marginTop: "24px" }}>
              Select a file to view annotations
            </p>
          ) : visibleAnnotations.length === 0 ? (
            <p style={{ color: "#334155", fontSize: "0.82rem", textAlign: "center",
              marginTop: "24px" }}>
              No annotations yet. Add the first one below.
            </p>
          ) : (
            visibleAnnotations.map(ann => (
              <div key={ann.id} style={{ marginBottom: "12px",
                opacity: ann.resolvedAt ? 0.45 : 1 }}>
                <div style={{ background: "rgba(15,23,42,0.7)",
                  border: "1px solid rgba(30,41,59,0.6)", borderRadius: "10px",
                  padding: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "20px", height: "20px", borderRadius: "50%",
                        background: colorFor(ann.userId), display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: "0.65rem", fontWeight: 700,
                        color: "#fff", flexShrink: 0 }}>
                        {(ann.authorName || ann.authorEmail || "?").charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        {ann.authorName || ann.authorEmail || "Unknown"}
                      </span>
                    </div>
                    {ann.resolvedAt && (
                      <span style={{ fontSize: "0.68rem", color: "#10b981",
                        background: "rgba(16,185,129,0.1)", padding: "2px 8px",
                        borderRadius: "999px" }}>
                        ✓ Resolved
                      </span>
                    )}
                  </div>
                  {editingId === ann.id ? (
                    <div style={{ marginBottom: "8px" }}>
                      <textarea
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        rows={3}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: "6px",
                          border: "1px solid rgba(59,130,246,0.4)", background: "rgba(2,6,23,0.8)",
                          color: "#e2e8f0", fontSize: "0.83rem", resize: "none", outline: "none",
                          boxSizing: "border-box", fontFamily: "inherit" }} />
                      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                        <button onClick={handleSaveEdit}
                          disabled={!editDraft.trim()}
                          style={{ background: "rgba(37,99,235,0.25)", border: "none",
                            color: "#93c5fd", cursor: "pointer", fontSize: "0.72rem",
                            padding: "4px 10px", borderRadius: "5px",
                            opacity: editDraft.trim() ? 1 : 0.4 }}>
                          Save
                        </button>
                        <button onClick={() => { setEditingId(null); setEditDraft(""); }}
                          style={{ background: "none", border: "none", color: "#475569",
                            cursor: "pointer", fontSize: "0.72rem", padding: "4px 0" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "#cbd5e1",
                      lineHeight: "1.5" }}>
                      {ann.content}
                    </p>
                  )}

                  {editingId !== ann.id && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {!ann.resolvedAt && (
                        <>
                          <button onClick={() => setReplyTo(ann.id)}
                            style={{ background: "none", border: "none", color: "#475569",
                              cursor: "pointer", fontSize: "0.72rem", padding: 0 }}>
                            Reply
                          </button>
                          <button onClick={() => handleResolve(ann.id)}
                            style={{ background: "none", border: "none", color: "#10b981",
                              cursor: "pointer", fontSize: "0.72rem", padding: 0 }}>
                            Resolve
                          </button>
                        </>
                      )}
                      {ann.userId === user?.id && !ann.resolvedAt && (
                        <button onClick={() => handleStartEdit(ann)}
                          style={{ background: "none", border: "none", color: "#93c5fd",
                            cursor: "pointer", fontSize: "0.72rem", padding: 0 }}>
                          Edit
                        </button>
                      )}
                      {ann.userId === user?.id && (
                        <button onClick={() => handleDeleteAnnotation(ann.id)}
                          style={{ background: "none", border: "none", color: "#f87171",
                            cursor: "pointer", fontSize: "0.72rem", padding: 0 }}>
                          Delete
                        </button>
                      )}
                    </div>
                  )}

                  {/* Replies */}
                  {ann.replies?.length > 0 && (
                    <div style={{ marginTop: "10px", paddingLeft: "14px",
                      borderLeft: "2px solid rgba(30,41,59,0.8)" }}>
                      {ann.replies.map(r => (
                        <div key={r.id} style={{ marginBottom: "8px" }}>
                          <span style={{ fontSize: "0.72rem", color: colorFor(r.userId) }}>
                            {r.authorName || r.authorEmail || "Unknown"}:
                          </span>
                          <p style={{ margin: "2px 0 0", fontSize: "0.82rem",
                            color: "#94a3b8" }}>
                            {r.content}
                          </p>
                          {r.userId === user?.id && (
                            <button onClick={() => handleDeleteAnnotation(r.id)}
                              style={{ background: "none", border: "none", color: "#f87171",
                                cursor: "pointer", fontSize: "0.68rem", padding: "2px 0 0" }}>
                              Delete
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* New annotation input */}
        {activeFile && (
          <div style={{ padding: "12px", borderTop: "1px solid rgba(30,41,59,0.6)" }}>
            {replyTo && (
              <div style={{ display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "0.72rem", color: "#475569" }}>
                  Replying to thread
                </span>
                <button onClick={() => setReplyTo(null)}
                  style={{ background: "none", border: "none", color: "#475569",
                    cursor: "pointer", fontSize: "0.72rem" }}>
                  Cancel
                </button>
              </div>
            )}
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder={activeFile ? `Annotate ${activeFile.label}…` : "Select a file first"}
              rows={3}
              disabled={!activeFile}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "8px",
                border: "1px solid rgba(30,41,59,0.8)", background: "rgba(2,6,23,0.7)",
                color: "#e2e8f0", fontSize: "0.83rem", resize: "none", outline: "none",
                boxSizing: "border-box", fontFamily: "inherit" }} />
            <button
              onClick={handleAddAnnotation}
              disabled={!newComment.trim()}
              style={{ width: "100%", marginTop: "8px", padding: "9px", borderRadius: "8px",
                border: "none", background: "rgba(37,99,235,0.25)", color: "#93c5fd",
                fontWeight: 600, fontSize: "0.83rem", cursor: "pointer",
                opacity: !newComment.trim() ? 0.4 : 1 }}>
              Add annotation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
