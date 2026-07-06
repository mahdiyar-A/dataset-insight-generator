"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import * as signalR from "@microsoft/signalr";

// ── Types ─────────────────────────────────────────────────────────────────────
type Annotation = {
  id: string; userId: string; fileType: string; content: string;
  position?: any; createdAt: string; resolvedAt?: string;
  parentId?: string; authorName?: string; authorEmail?: string;
  replies: Annotation[];
};

type Presence = { userId: string; userName: string; color: string; fileType?: string };

type FileItem = {
  key: string; label: string; icon: string; available: boolean; editable: boolean;
};

const FILE_TYPES: FileItem[] = [
  { key: "pdf",          label: "PDF Report",    icon: "📄", available: false, editable: false },
  { key: "word",         label: "Word Report",   icon: "📝", available: false, editable: true  },
  { key: "pptx",         label: "Presentation",  icon: "📊", available: false, editable: true  },
  { key: "cleaned_csv",  label: "Cleaned CSV",   icon: "🗂",  available: false, editable: true  },
  { key: "original_csv", label: "Original CSV",  icon: "📋", available: false, editable: false },
  { key: "charts",       label: "Charts",        icon: "📈", available: false, editable: false },
];

const COLORS = ["#3b82f6","#a855f7","#10b981","#f97316","#ec4899","#06b6d4"];

export default function WorkspacePage() {
  const router  = useRouter();
  const params  = useParams();
  const wsId    = params.id as string;
  const { token, user, isLoading } = useAuth();

  const [workspace,    setWorkspace]    = useState<any>(null);
  const [activeFile,   setActiveFile]   = useState<FileItem | null>(null);
  const [annotations,  setAnnotations]  = useState<Annotation[]>([]);
  const [presence,     setPresence]     = useState<Presence[]>([]);
  const [newComment,   setNewComment]   = useState("");
  const [replyTo,      setReplyTo]      = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const hubRef = useRef<signalR.HubConnection | null>(null);

  const myColor = COLORS[Math.abs((user?.id ?? "").split("").reduce(
    (a, c) => a + c.charCodeAt(0), 0) % COLORS.length)];

  // ── Load workspace ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !token) { router.replace("/login"); return; }
    if (!token) return;

    BackendAPI.getWorkspace(token, wsId)
      .then(ws => {
        setWorkspace(ws);
        setAnnotations(ws.annotations ?? []);
        // Set available files from analysis
        if (ws.analysis) {
          FILE_TYPES.forEach(f => {
            f.available = ws.analysis[
              f.key === "pdf" ? "hasPdf" :
              f.key === "word" ? "hasWord" :
              f.key === "pptx" ? "hasPptx" :
              f.key === "cleaned_csv" ? "hasCleanedCsv" :
              f.key === "original_csv" ? "hasOriginalCsv" : "hasCharts"
            ] ?? false;
          });
        }
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [token, isLoading, wsId]);

  // ── SignalR connection ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !wsId) return;

    const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5150").replace(/\/$/, "");
    const hub = new signalR.HubConnectionBuilder()
      .withUrl(`${apiBase}/hubs/collab?access_token=${token}`)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    hub.on("UserJoined", (data: Presence) => {
      setPresence(prev => [...prev.filter(p => p.userId !== data.userId), data]);
    });

    hub.on("UserLeft", ({ userId }: { userId: string }) => {
      setPresence(prev => prev.filter(p => p.userId !== userId));
    });

    hub.on("CursorMoved", (data: any) => {
      // Cursor movement handled via CSS transforms (out of scope for this version)
    });

    hub.on("AnnotationAdded",   (ann: Annotation) => {
      setAnnotations(prev => [...prev, ann]);
    });

    hub.on("AnnotationUpdated", (ann: Annotation) => {
      setAnnotations(prev => prev.map(a => a.id === ann.id ? ann : a));
    });

    hub.on("AnnotationResolved", (id: string) => {
      setAnnotations(prev => prev.map(a =>
        a.id === id ? { ...a, resolvedAt: new Date().toISOString() } : a));
    });

    hub.on("AnnotationDeleted", (id: string) => {
      setAnnotations(prev => prev.filter(a => a.id !== id));
    });

    hub.start()
      .then(() => hub.invoke("JoinWorkspace", wsId))
      .catch(e => console.warn("[Hub] Connection failed:", e));

    hubRef.current = hub;
    return () => { hub.stop(); };
  }, [token, wsId]);

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
    } catch (e: any) { alert(e.message); }
  };

  // ── Add annotation ────────────────────────────────────────────────────────
  const handleAddAnnotation = async () => {
    if (!newComment.trim() || !token || !activeFile) return;
    try {
      const ann = await BackendAPI.addAnnotation(token, wsId, {
        fileType: activeFile.key,
        content:  newComment.trim(),
        parentId: replyTo,
      });
      setNewComment("");
      setReplyTo(null);
      // Broadcast to collaborators
      hubRef.current?.invoke("BroadcastAnnotation", wsId, ann).catch(() => {});
    } catch (e: any) { setError(e.message); }
  };

  const handleResolve = async (annId: string) => {
    if (!token) return;
    try {
      await BackendAPI.resolveAnnotation(token, wsId, annId);
      hubRef.current?.invoke("BroadcastAnnotationResolved", wsId, annId).catch(() => {});
    } catch (e: any) { setError(e.message); }
  };

  const handleDeleteAnnotation = async (annId: string) => {
    if (!token || !confirm("Delete this annotation?")) return;
    try {
      await BackendAPI.deleteAnnotation(token, wsId, annId);
      hubRef.current?.invoke("BroadcastAnnotationDeleted", wsId, annId).catch(() => {});
    } catch (e: any) { setError(e.message); }
  };

  // ── Filter annotations for active file ───────────────────────────────────
  const visibleAnnotations = annotations.filter(
    a => !activeFile || a.fileType === activeFile.key);

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

        {FILE_TYPES.map(file => {
          const accessible = file.available && canAccess(file.key);
          const isActive   = activeFile?.key === file.key;

          return (
            <div key={file.key}
              onClick={() => accessible && setActiveFile(file)}
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

            {/* Placeholder for file preview */}
            <div style={{ background: "rgba(15,23,42,0.7)", borderRadius: "12px",
              border: "1px solid rgba(30,41,59,0.7)", padding: "48px",
              textAlign: "center", color: "#334155" }}>
              <p style={{ fontSize: "2rem", margin: "0 0 12px" }}>{activeFile.icon}</p>
              <p style={{ margin: "0 0 6px", color: "#64748b", fontSize: "0.9rem" }}>
                {activeFile.label} preview
              </p>
              <p style={{ margin: 0, color: "#334155", fontSize: "0.78rem" }}>
                Download to open in your preferred application.
                Use the annotations panel to leave comments for your team.
              </p>
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
                        background: myColor, display: "flex", alignItems: "center",
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
                  <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "#cbd5e1",
                    lineHeight: "1.5" }}>
                    {ann.content}
                  </p>
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
                    {ann.userId === user?.id && (
                      <button onClick={() => handleDeleteAnnotation(ann.id)}
                        style={{ background: "none", border: "none", color: "#f87171",
                          cursor: "pointer", fontSize: "0.72rem", padding: 0 }}>
                        Delete
                      </button>
                    )}
                  </div>

                  {/* Replies */}
                  {ann.replies?.length > 0 && (
                    <div style={{ marginTop: "10px", paddingLeft: "14px",
                      borderLeft: "2px solid rgba(30,41,59,0.8)" }}>
                      {ann.replies.map(r => (
                        <div key={r.id} style={{ marginBottom: "8px" }}>
                          <span style={{ fontSize: "0.72rem", color: "#475569" }}>
                            {r.authorName || r.authorEmail}:
                          </span>
                          <p style={{ margin: "2px 0 0", fontSize: "0.82rem",
                            color: "#94a3b8" }}>
                            {r.content}
                          </p>
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
