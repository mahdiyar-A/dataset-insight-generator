// frontend/lib/BackendAPI.js
// Full file — replace existing

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5150").replace(/\/$/, "");

async function readError(res) {
  try {
    const data = await res.json();
    return data?.message || data?.error || JSON.stringify(data);
  } catch {
    return await res.text();
  }
}

function authHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default class BackendAPI {

  // ── AUTH ──────────────────────────────────────────────────────────────

  static async login(email, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Login failed");
    return await res.json();
  }

  static async register(firstName, lastName, email, password) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, email, password }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Registration failed");
    return await res.json();
  }

  // ── USER PROFILE ──────────────────────────────────────────────────────

  static async getUserProfile(token) {
    // → { id, email, userName, firstName, lastName, phoneNumber, profilePicture, createdAt, isActive }
    const res = await fetch(`${API_BASE}/api/user/me`, { headers: authHeaders(token) });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch profile");
    return await res.json();
  }

  static async updateUsername(token, userName) {
    const res = await fetch(`${API_BASE}/api/user/me/username`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ userName }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to update name");
    return await res.json();
  }

  static async updatePhone(token, phoneNumber) {
    // PATCH /api/user/me/phone  { phoneNumber }
    const res = await fetch(`${API_BASE}/api/user/me/phone`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ phoneNumber }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to update phone");
    return await res.json();
  }

  static async updateEmail(token, email) {
    const res = await fetch(`${API_BASE}/api/user/me/email`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to update email");
    return await res.json();
  }

  static async uploadProfilePicture(token, file) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/user/me/profile-picture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to upload picture");
    return await res.json();
  }

  static async changePassword(token, currentPassword, newPassword) {
    const res = await fetch(`${API_BASE}/api/user/me/password`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to change password");
    return await res.json();
  }

  static async deleteAccount(token) {
    const res = await fetch(`${API_BASE}/api/user/me`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to delete account");
    return true;
  }

  // ── DATASET ───────────────────────────────────────────────────────────

  static async getCurrentDataset(token) {
    const res = await fetch(`${API_BASE}/api/datasets/current`, { headers: authHeaders(token) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch dataset");
    return await res.json();
  }

  static async getDatasetStatus(token) {
    const res = await fetch(`${API_BASE}/api/datasets/current/status`, { headers: authHeaders(token) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch status");
    return await res.json();
  }

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
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error((await readError(res)) || "Upload failed");
    return await res.json();
  }

  static async getDownloadUrl(token, type) {
    // type: "original" | "cleaned" | "report"
    const res = await fetch(`${API_BASE}/api/datasets/download/${type}`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Download failed");
    return await res.json(); // { url, fileName }
  }

  static async deleteCurrentDataset(token) {
    const res = await fetch(`${API_BASE}/api/datasets/current`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Delete failed");
    return true;
  }

  static async emailReport(token, { subject, includeAttachment = true } = {}) {
    const res = await fetch(`${API_BASE}/api/datasets/email-report`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ subject: subject ?? "Your DIG report is ready", includeAttachment }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Email failed");
    return await res.json();
  }

  // ── VISUALIZATIONS ────────────────────────────────────────────────────
  // Returns up to 5 charts for the current user's dataset
  // Shape: [{ type, label, url, desc, color }, ...]
  // Empty array if no analysis done yet

  static async getVisualizations(token) {
    const res = await fetch(`${API_BASE}/api/datasets/visualizations`, {
      headers: authHeaders(token),
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch visualizations");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // ── CHATBOT ───────────────────────────────────────────────────────────
  // Messages: "start_analysis" | "yes" | "no"
  // Response: { reply, condition, done, failed, requiresResponse }
  // condition: "not_clean" | "low_accuracy" | "not_workable" | "all_good"

  static async getChatHistory(token) {
    const res = await fetch(`${API_BASE}/api/chat/history`, {
      headers: authHeaders(token),
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch chat history");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  static async sendChatMessage(token, message, meta = {}) {
    const res = await fetch(`${API_BASE}/api/chat/message`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        message,
        fileName:      meta.fileName      ?? null,
        fileSizeBytes: meta.fileSizeBytes  ?? null,
        rowCount:      meta.rowCount       ?? null,
        columnCount:   meta.columnCount    ?? null,
      }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to send message");
    return await res.json();
    // → { reply, condition, done, failed, requiresResponse }
  }
}