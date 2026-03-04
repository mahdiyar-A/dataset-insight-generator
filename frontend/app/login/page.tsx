"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/contexts/AuthContext";
import "./login.css";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");

    const e = email.trim();
    if (!isValidEmail(e))
      return setError("Enter a valid email (must include @).");
    if (!password) return setError("Password is required.");

    setLoading(true);
    try {
      await login(e, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-body">
      <div className="auth-container">
        <h2>Login</h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="auth-error">{error}</p>}

        <div className="forgot-password">
          <Link href="/login/forgotPassword">Forgot password?</Link>
        </div>

        <button className="auth-btn" onClick={handleLogin} disabled={loading}>
          {loading ? "Logging in…" : "Login"}
        </button>

        <div className="auth-footer">
          Don&apos;t have an account? <Link href="/register">Register</Link>
        </div>
      </div>
    </div>
  );
}
