/**
 * BackendAPI — central HTTP client for all DIG backend calls.
 *
 * Auth flows through Supabase (see AuthContext.tsx).
 * Every protected method takes the Supabase access_token as the first arg.
 *
 * Sections:
 *   USER PROFILE   — /api/user
 *   ANALYSIS       — /api/analyses  (history, upload, status, download)
 *   PLANS          — /api/plans     (Stripe checkout, portal, plan info)
 *   TEAMS          — /api/teams     (create, invite, members)
 *   WORKSPACES     — /api/workspaces (share, permissions, annotations)
 *   CHATBOT        — /api/chat
 *   GUEST          — /api/guest
 *   ADMIN          — /api/admin
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5150").replace(/\/$/, "");

async function readError(res) {
  try {
    const text = await res.text();
    if (!text) return null;
    try { const d = JSON.parse(text); return d?.message || d?.error || JSON.stringify(d); }
    catch  { return text; }
  } catch { return null; }
}

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function req(url, options, errorMsg) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error((await readError(res)) || errorMsg);
  return res.json();
}

export default class BackendAPI {

  // ── USER PROFILE ──────────────────────────────────────────────────────────

  static async getUserProfile(token) {
    return req(`${API_BASE}/api/user/me`, { headers: authHeaders(token) }, "Failed to fetch profile");
  }

  static async updateUsername(token, userName) {
    return req(`${API_BASE}/api/user/me/username`,
      { method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ userName }) },
      "Failed to update name");
  }

  static async updatePhone(token, phoneNumber) {
    return req(`${API_BASE}/api/user/me/phone`,
      { method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ phoneNumber }) },
      "Failed to update phone");
  }

  static async updateEmail(token, email) {
    return req(`${API_BASE}/api/user/me/email`,
      { method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ email }) },
      "Failed to update email");
  }

  static async uploadProfilePicture(token, file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/user/me/profile-picture`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to upload picture");
    return res.json();
  }

  static async changePassword(token, currentPassword, newPassword) {
    return req(`${API_BASE}/api/user/me/password`,
      { method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ currentPassword, newPassword }) },
      "Failed to change password");
  }

  static async deleteAccount(token) {
    const res = await fetch(`${API_BASE}/api/user/me`,
      { method: "DELETE", headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to delete account");
    return true;
  }

  // ── ANALYSIS HISTORY ──────────────────────────────────────────────────────
  // New model: users have up to 5 (free) or 15 (pro) history items.
  // Dashboard starts clean on login — user loads a history item or starts fresh.

  /** Returns the last N completed analyses for the user */
  static async getHistory(token) {
    const res = await fetch(`${API_BASE}/api/analyses/history`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch history");
    return res.json(); // array
  }

  /** Load one specific history item into the dashboard */
  static async getAnalysis(token, analysisId) {
    return req(`${API_BASE}/api/analyses/${analysisId}`,
      { headers: authHeaders(token) }, "Failed to load analysis");
  }

  /** Check if a pipeline is still running */
  static async getAnalysisStatus(token, analysisId) {
    const res = await fetch(`${API_BASE}/api/analyses/${analysisId}/status`,
      { headers: authHeaders(token) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch status");
    return res.json();
  }

  /** Get the currently-running analysis (if any) */
  static async getActiveAnalysis(token) {
    const res = await fetch(`${API_BASE}/api/analyses/active`,
      { headers: authHeaders(token) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch active");
    return res.json();
  }

  /**
   * Upload a CSV/XLSX to the server temp folder.
   * The file is NOT persisted to the DB yet — that happens after pipeline success.
   */
  static async uploadDataset(token, file) {
    const text    = await file.text();
    const lines   = text.split("\n").filter(l => l.trim());
    const rows    = Math.max(0, lines.length - 1);
    const columns = lines[0]?.split(",").length ?? 0;

    const form = new FormData();
    form.append("file",    file);
    form.append("rows",    String(rows));
    form.append("columns", String(columns));

    const res = await fetch(`${API_BASE}/api/analyses/upload`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!res.ok) throw new Error((await readError(res)) || "Upload failed");
    return res.json();
  }

  /** Get a short-lived signed URL for a specific file type */
  static async getDownloadUrl(token, analysisId, type) {
    // type: "original" | "cleaned" | "report" | "word" | "pptx"
    return req(`${API_BASE}/api/analyses/${analysisId}/download/${type}`,
      { headers: authHeaders(token) }, "Download failed");
  }

  /** Get chart objects for an analysis */
  static async getVisualizations(token, analysisId) {
    const res = await fetch(`${API_BASE}/api/analyses/${analysisId}/visualizations`,
      { headers: authHeaders(token) });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch visualizations");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  /** Delete a history entry + its Supabase Storage files */
  static async deleteAnalysis(token, analysisId) {
    const res = await fetch(`${API_BASE}/api/analyses/${analysisId}`,
      { method: "DELETE", headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Delete failed");
    return true;
  }

  // ── PLANS ─────────────────────────────────────────────────────────────────

  /** Returns both plan definitions and the user's current plan info */
  static async getPlans(token) {
    const res = await fetch(`${API_BASE}/api/plans`,
      { headers: token ? authHeaders(token) : {} });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch plans");
    return res.json(); // { plans: [...], userPlan: {...} }
  }

  /**
   * Start a Stripe Checkout session.
   * Returns { url } — redirect the user there.
   * No card data ever touches DIG servers.
   */
  static async subscribePro(token) {
    return req(`${API_BASE}/api/plans/subscribe`,
      { method: "POST", headers: authHeaders(token) },
      "Failed to start checkout");
  }

  /**
   * Open the Stripe Billing Portal (cancel / update card / view invoices).
   * Returns { url } — redirect the user there.
   */
  static async openBillingPortal(token) {
    return req(`${API_BASE}/api/plans/portal`,
      { method: "POST", headers: authHeaders(token) },
      "Failed to open billing portal");
  }

  // ── TEAMS ─────────────────────────────────────────────────────────────────

  static async getMyTeams(token) {
    return req(`${API_BASE}/api/teams`, { headers: authHeaders(token) }, "Failed to fetch teams");
  }

  static async createTeam(token, name) {
    return req(`${API_BASE}/api/teams`,
      { method: "POST", headers: authHeaders(token), body: JSON.stringify({ name }) },
      "Failed to create team");
  }

  static async getTeamMembers(token, teamId) {
    return req(`${API_BASE}/api/teams/${teamId}/members`,
      { headers: authHeaders(token) }, "Failed to fetch members");
  }

  static async inviteMember(token, teamId, email, role = "viewer") {
    return req(`${API_BASE}/api/teams/${teamId}/invite`,
      { method: "POST", headers: authHeaders(token), body: JSON.stringify({ email, role }) },
      "Failed to send invite");
  }

  static async acceptInvite(token, inviteToken) {
    return req(`${API_BASE}/api/teams/accept/${inviteToken}`,
      { method: "POST", headers: authHeaders(token) }, "Failed to accept invite");
  }

  static async updateMemberRole(token, teamId, memberId, role) {
    return req(`${API_BASE}/api/teams/${teamId}/members/${memberId}/role`,
      { method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ role }) },
      "Failed to update role");
  }

  static async removeMember(token, teamId, memberId) {
    const res = await fetch(`${API_BASE}/api/teams/${teamId}/members/${memberId}`,
      { method: "DELETE", headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to remove member");
    return true;
  }

  static async deleteTeam(token, teamId) {
    const res = await fetch(`${API_BASE}/api/teams/${teamId}`,
      { method: "DELETE", headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to delete team");
    return true;
  }

  static async getPendingInvites(token, teamId) {
    return req(`${API_BASE}/api/teams/${teamId}/invites`,
      { headers: authHeaders(token) }, "Failed to fetch invites");
  }

  static async revokeInvite(token, teamId, inviteId) {
    const res = await fetch(`${API_BASE}/api/teams/${teamId}/invites/${inviteId}`,
      { method: "DELETE", headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to revoke invite");
    return true;
  }

  // ── WORKSPACES ────────────────────────────────────────────────────────────

  static async getMyWorkspaces(token) {
    return req(`${API_BASE}/api/workspaces`, { headers: authHeaders(token) }, "Failed to fetch workspaces");
  }

  static async getWorkspace(token, workspaceId) {
    return req(`${API_BASE}/api/workspaces/${workspaceId}`,
      { headers: authHeaders(token) }, "Failed to fetch workspace");
  }

  static async shareAnalysis(token, analysisId, teamId) {
    return req(`${API_BASE}/api/workspaces`,
      { method: "POST", headers: authHeaders(token), body: JSON.stringify({ analysisId, teamId }) },
      "Failed to share analysis");
  }

  static async unshareWorkspace(token, workspaceId) {
    const res = await fetch(`${API_BASE}/api/workspaces/${workspaceId}`,
      { method: "DELETE", headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to unshare");
    return true;
  }

  static async setPermission(token, workspaceId, targetUserId, fileType, permission) {
    return req(`${API_BASE}/api/workspaces/${workspaceId}/permissions`,
      { method: "PUT", headers: authHeaders(token),
        body: JSON.stringify({ targetUserId, fileType, permission }) },
      "Failed to set permission");
  }

  /**
   * @param {string} token
   * @param {string} workspaceId
   * @param {string | null} [fileType] Omit or pass null for all file types.
   */
  static async getAnnotations(token, workspaceId, fileType = null) {
    const url = fileType
      ? `${API_BASE}/api/workspaces/${workspaceId}/annotations?fileType=${fileType}`
      : `${API_BASE}/api/workspaces/${workspaceId}/annotations`;
    return req(url, { headers: authHeaders(token) }, "Failed to fetch annotations");
  }

  /**
   * @param {string} token
   * @param {string} workspaceId
   * @param {{ fileType: string, content: string, position?: string | null, parentId?: string | null }} annotation
   *   parentId is the annotation being replied to — null for a top-level comment.
   */
  static async addAnnotation(token, workspaceId, { fileType, content, position = null, parentId = null }) {
    return req(`${API_BASE}/api/workspaces/${workspaceId}/annotations`,
      { method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ fileType, content, position, parentId }) },
      "Failed to add annotation");
  }

  static async editAnnotation(token, workspaceId, annotationId, content) {
    return req(`${API_BASE}/api/workspaces/${workspaceId}/annotations/${annotationId}`,
      { method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ content }) },
      "Failed to edit annotation");
  }

  static async resolveAnnotation(token, workspaceId, annotationId) {
    return req(`${API_BASE}/api/workspaces/${workspaceId}/annotations/${annotationId}/resolve`,
      { method: "POST", headers: authHeaders(token) }, "Failed to resolve");
  }

  static async deleteAnnotation(token, workspaceId, annotationId) {
    const res = await fetch(`${API_BASE}/api/workspaces/${workspaceId}/annotations/${annotationId}`,
      { method: "DELETE", headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to delete annotation");
    return true;
  }

  // ── CHATBOT ───────────────────────────────────────────────────────────────

  static async getChatHistory(token) {
    const res = await fetch(`${API_BASE}/api/chat/history`, { headers: authHeaders(token) });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch history");
    return res.json();
  }

  /**
   * Send a chat message to the analysis assistant.
   * message: "start_analysis" | "yes" | "no"
   * meta: { fileName, fileSizeBytes, rowCount, columnCount, pendingCondition, analysisId }
   * customization (pro only): { language, tone, audience, depth, insightsCount, occasion,
   *   focusOn, comparisons, mustMention[], chartStyle,
   *   includeMethodology, includeConfidence,
   *   outputFormat: { pdf, word, pptx } }
   */
  static async sendChatMessage(token, message, meta = {}) {
    return req(`${API_BASE}/api/chat/message`,
      {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          message,
          fileName:         meta.fileName         ?? null,
          fileSizeBytes:    meta.fileSizeBytes     ?? null,
          rowCount:         meta.rowCount          ?? null,
          columnCount:      meta.columnCount       ?? null,
          pendingCondition: meta.pendingCondition  ?? null,
          analysisId:       meta.analysisId        ?? null,
          customization:    meta.customization     ?? null,
        }),
      },
      "Failed to send message");
  }

  // ── GUEST ─────────────────────────────────────────────────────────────────

  static async guestUpload(file, sessionId) {
    const text    = await file.text();
    const lines   = text.split("\n").filter(l => l.trim());
    const rows    = Math.max(0, lines.length - 1);
    const columns = lines[0]?.split(",").length ?? 0;

    const form = new FormData();
    form.append("file",      file);
    form.append("sessionId", sessionId);
    form.append("rows",      String(rows));
    form.append("columns",   String(columns));

    const res = await fetch(`${API_BASE}/api/guest/upload`,
      { method: "POST", body: form });
    if (!res.ok) throw new Error((await readError(res)) || "Guest upload failed");
    return res.json();
  }

  static async guestChat(message, sessionId, meta = {}) {
    return req(`${API_BASE}/api/guest/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId, ...meta }),
      },
      "Guest chat failed");
  }

  static async guestStatus(sessionId) {
    const res = await fetch(`${API_BASE}/api/guest/status/${sessionId}`);
    if (!res.ok) return null;
    return res.json();
  }

  // ── ADMIN ─────────────────────────────────────────────────────────────────

  static async adminGetStats(token) {
    return req(`${API_BASE}/api/admin/stats`, { headers: authHeaders(token) }, "Failed to fetch stats");
  }

  /**
   * Owner analytics: analyses per day, success rate, LLM cost, user counts.
   * @param {string} token
   * @param {number} [days]
   */
  static async adminGetAnalytics(token, days = 30) {
    return req(`${API_BASE}/api/admin/analytics?days=${days}`,
      { headers: authHeaders(token) }, "Failed to fetch analytics");
  }

  /**
   * Without these JSDoc annotations TypeScript infers `plan` and `search` as
   * type `null` from their defaults, so any caller passing a real filter string
   * fails the production type check (`next build`) while the dev server happily
   * runs. Annotating keeps this .js module usable from .tsx callers.
   *
   * @param {string} token
   * @param {{ page?: number, size?: number, plan?: string | null, search?: string | null }} [opts]
   */
  static async adminGetUsers(token, { page = 1, size = 25, plan = null, search = null } = {}) {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    if (plan)   params.set("plan",   plan);
    if (search) params.set("search", search);
    return req(`${API_BASE}/api/admin/users?${params}`,
      { headers: authHeaders(token) }, "Failed to fetch users");
  }

  /**
   * @param {string} token
   * @param {string} userId
   * @param {string} plan
   * @param {string | null} [expiresAt] ISO timestamp, or null for no expiry.
   */
  static async adminSetPlan(token, userId, plan, expiresAt = null) {
    return req(`${API_BASE}/api/admin/users/${userId}/plan`,
      { method: "PATCH", headers: authHeaders(token),
        body: JSON.stringify({ plan, expiresAt }) },
      "Failed to set plan");
  }

  static async adminDeleteUser(token, userId) {
    const res = await fetch(`${API_BASE}/api/admin/users/${userId}`,
      { method: "DELETE", headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to delete user");
    return true;
  }
}
