// frontend/lib/BackendAPI.js

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5150").replace(/\/$/, "");
  
async function readError(res) {
  try {
    const data = await res.json();
    return data?.message || data?.error || JSON.stringify(data);
  } catch {
    return await res.text();
  }
}

export default class BackendAPI {
  // AUTH
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
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) throw new Error((await readError(res)) || "Failed to fetch user");
    return await res.json();
  }

  // keep these mocks if other UI still calls them
  static async sendAnalysisMessage(message) {
    return new Promise((resolve) =>
      setTimeout(() => resolve(`Assistant response to "${message}" (mock)`), 300)
    );
  }
}