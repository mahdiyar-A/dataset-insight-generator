/**
 * BackendAPI — thin wrapper around all DIG backend HTTP calls.
 *
 * Authentication is handled by Supabase on the client side (see AuthContext.tsx).
 * Every method here that talks to a protected endpoint accepts the Supabase
 * access_token and forwards it as a Bearer header.
 *
 * Note: login / register are NOT here. They go through Supabase directly
 * (supabase.auth.signInWithPassword / signUp) in AuthContext.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5150").replace(/\/$/, "");

// Parse error body from a failed response — handles both JSON and plain text
async function readError(res) {
  try {
    const text = await res.text();
    if (!text) return null;
    try {
      const data = JSON.parse(text);
      return data?.message || data?.error || JSON.stringify(data);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

// Shorthand for building the Authorization + Content-Type headers
function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default class BackendAPI {

  // ── USER PROFILE ──────────────────────────────────────────────────────────
  // Returns the full profile: { id, email, userName, firstName, lastName,
  //                             phoneNumber, profilePicture, createdAt, isActive }

  static async getUserProfile(token) {
    const res = await fetch(`${API_BASE}/api/user/me`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch profile");
    return await res.json();
  }

  static async updateUsername(token, userName) {
    const res = await fetch(`${API_BASE}/api/user/me/username`, {
      method:  "PATCH",
      headers: authHeaders(token),
      body:    JSON.stringify({ userName }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to update name");
    return await res.json();
  }

  static async updatePhone(token, phoneNumber) {
    const res = await fetch(`${API_BASE}/api/user/me/phone`, {
      method:  "PATCH",
      headers: authHeaders(token),
      body:    JSON.stringify({ phoneNumber }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to update phone");
    return await res.json();
  }

  static async updateEmail(token, email) {
    const res = await fetch(`${API_BASE}/api/user/me/email`, {
      method:  "PATCH",
      headers: authHeaders(token),
      body:    JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to update email");
    return await res.json();
  }

  static async uploadProfilePicture(token, file) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/user/me/profile-picture`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
      body:    formData,
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to upload picture");
    return await res.json();
  }

  static async changePassword(token, currentPassword, newPassword) {
    const res = await fetch(`${API_BASE}/api/user/me/password`, {
      method:  "PATCH",
      headers: authHeaders(token),
      body:    JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to change password");
    return await res.json();
  }

  static async deleteAccount(token) {
    const res = await fetch(`${API_BASE}/api/user/me`, {
      method:  "DELETE",
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to delete account");
    return true;
  }

  // ── DATASET ───────────────────────────────────────────────────────────────

  // Returns the user's current dataset from the DB, or null if none exists yet.
  // Only returns datasets whose analysis has completed — pending temp uploads are
  // stored server-side but not persisted to the DB until the pipeline finishes.
  static async getCurrentDataset(token) {
    const res = await fetch(`${API_BASE}/api/datasets/current`, { headers: authHeaders(token) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch dataset");
    return await res.json();
  }

  // Lightweight status poll — returns { status, hasCleanedCsv, hasPdfReport }
  // Called every 10 seconds while analysis is running
  static async getDatasetStatus(token) {
    const res = await fetch(`${API_BASE}/api/datasets/current/status`, { headers: authHeaders(token) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch status");
    return await res.json();
  }

  // Upload a CSV to the server's temp folder.
  // The file is NOT persisted to Supabase here — that only happens after the
  // AI pipeline completes successfully. Row/column counts are computed client-side
  // to avoid re-reading the file on the server.
  static async uploadDataset(token, file) {
    const text    = await file.text();
    const lines   = text.split("\n").filter(l => l.trim());
    const rows    = Math.max(0, lines.length - 1);
    const columns = lines[0]?.split(",").length ?? 0;

    const formData = new FormData();
    formData.append("file",    file);
    formData.append("rows",    String(rows));
    formData.append("columns", String(columns));

    const res = await fetch(`${API_BASE}/api/datasets/upload`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
      body:    formData,
    });
    if (!res.ok) throw new Error((await readError(res)) || "Upload failed");
    return await res.json();
  }

  // Returns a short-lived signed URL to download a dataset file.
  // type: "original" | "cleaned" | "report"
  static async getDownloadUrl(token, type) {
    const res = await fetch(`${API_BASE}/api/datasets/download/${type}`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Download failed");
    return await res.json(); // { url, fileName }
  }

  static async deleteCurrentDataset(token) {
    const res = await fetch(`${API_BASE}/api/datasets/current`, {
      method:  "DELETE",
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Delete failed");
    return true;
  }

  // ── VISUALIZATIONS ────────────────────────────────────────────────────────
  // Returns up to 5 chart objects: [{ type, label, url, desc, color }, ...]
  // Returns an empty array if no analysis has been run yet

  static async getVisualizations(token) {
    const res = await fetch(`${API_BASE}/api/datasets/visualizations`, {
      headers: authHeaders(token),
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch visualizations");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // ── CHATBOT ───────────────────────────────────────────────────────────────
  // The chatbot drives the analysis flow. Accepted messages:
  //   "start_analysis" — triggers Python /check quality check
  //   "yes" / "no"     — responds to a cleaning or low-confidence prompt
  // Response shape: { reply, condition, done, failed, requiresResponse }
  // condition: "not_clean" | "low_accuracy" | "not_workable" | "all_good"

  static async getChatHistory(token) {
    const res = await fetch(`${API_BASE}/api/chat/history`, { headers: authHeaders(token) });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch chat history");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  static async sendChatMessage(token, message, meta = {}) {
    const res = await fetch(`${API_BASE}/api/chat/message`, {
      method:  "POST",
      headers: authHeaders(token),
      body:    JSON.stringify({
        message,
        fileName:         meta.fileName         ?? null,
        fileSizeBytes:    meta.fileSizeBytes     ?? null,
        rowCount:         meta.rowCount          ?? null,
        columnCount:      meta.columnCount       ?? null,
        pendingCondition: meta.pendingCondition  ?? null,
      }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to send message");
    return await res.json();
  }
}
