// frontend/lib/BackendAPI.js

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
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export default class BackendAPI {

  // ── AUTH ──────────────────────────────────────────────

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

  static async me(token) {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch user");
    return await res.json();
  }

  // ── USER / PROFILE ────────────────────────────────────

  static async updateProfile(token, payload) {
    // payload: { firstName, lastName, username, phoneNumber }
    const res = await fetch(`${API_BASE}/api/users/profile`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to update profile");
    return await res.json();
  }

  static async changePassword(token, currentPassword, newPassword) {
    const res = await fetch(`${API_BASE}/api/users/password`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to change password");
    return await res.json();
  }

  static async deleteAccount(token) {
    const res = await fetch(`${API_BASE}/api/users/delete`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to delete account");
    return true;
  }

  // ── DATASETS ──────────────────────────────────────────

  static async uploadDataset(token, file) {
    // Reads CSV client-side first to get metadata
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    const rows    = Math.max(0, lines.length - 1);          // exclude header
    const columns = lines[0]?.split(",").length ?? 0;
    const sizeKB  = (file.size / 1024).toFixed(1);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("rows",    String(rows));
    formData.append("columns", String(columns));
    formData.append("sizeKB",  String(sizeKB));

    const res = await fetch(`${API_BASE}/api/datasets/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },   // NO Content-Type — let browser set multipart boundary
      body: formData,
    });
    if (!res.ok) throw new Error((await readError(res)) || "Upload failed");
    return await res.json();   // returns dataset record with id, rows, columns, size, uploadedAt
  }

  static async getDatasetHistory(token) {
    const res = await fetch(`${API_BASE}/api/datasets/history`, {
      headers: authHeaders(token),
    });
    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch history");
    return await res.json();
  }

  static async downloadDataset(token, id) {
    const res = await fetch(`${API_BASE}/api/datasets/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error((await readError(res)) || "Download failed");
    return await res.blob();
  }

  static async deleteDataset(token, id) {
    const res = await fetch(`${API_BASE}/api/datasets/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error((await readError(res)) || "Delete failed");
    return true;
  }
}