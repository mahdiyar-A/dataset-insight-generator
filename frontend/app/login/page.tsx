"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/contexts/AuthContext";
import { useTranslations } from "next-intl";
import "./login.css";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const t = useTranslations("auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");

    const e = email.trim();
    if (!isValidEmail(e))
      return setError(t("errorInvalidEmail"));
    if (!password) return setError(t("errorPasswordRequired"));

    setLoading(true);
    try {
      await login(e, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || t("errorLoginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-body">
      <div className="auth-container">
        <h2>{t("loginTitle")}</h2>

        <input
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder={t("passwordPlaceholder")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="auth-error">{error}</p>}

        <div className="forgot-password">
          <Link href="/login/forgotPassword">{t("forgotPassword")}</Link>
        </div>

        <button className="auth-btn" onClick={handleLogin} disabled={loading}>
          {loading ? t("loginBtnLoading") : t("loginBtn")}
        </button>

        <div className="auth-footer">
          {t("noAccount")} <Link href="/register">{t("registerLink")}</Link>
        </div>
      </div>
    </div>
  );
}
