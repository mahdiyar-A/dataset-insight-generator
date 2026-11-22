"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";
import { supabase } from "@/lib/supabaseClient";

/** Inline status banner: a kind plus the text to show, or nothing. */
type StatusMsg = { type: "success" | "error" | "info"; text: string } | null;

export default function AccountSettingsPage() {
  const router = useRouter();
  const { user: currentUser, isLoading, updateUser, refreshUser, logout, token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", phoneNumber: "", email: "" });
  const [initialized,   setInitialized]   = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState<StatusMsg>(null);
  const [pwForm,   setPwForm]   = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg,    setPwMsg]    = useState<StatusMsg>(null);
  const [showPw,   setShowPw]   = useState(false);
  // Someone who signs in with Google or GitHub has no DIG password to change.
  const [hasPassword, setHasPassword] = useState(true);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting,          setDeleting]          = useState(false);
  const [deleteMsg,         setDeleteMsg]         = useState<StatusMsg>(null);
  const [avatarUrl,     setAvatarUrl]     = useState<string | null>(null);
  const [uploadingPic,  setUploadingPic]  = useState(false);

  useEffect(() => {
    if (currentUser && !initialized) {
      // Split userName into first/last if backend doesn't return them separately
      const parts = (currentUser.userName ?? "").split(" ");
      setForm({
        firstName:   currentUser.firstName   ?? parts[0]                    ?? "",
        lastName:    currentUser.lastName    ?? parts.slice(1).join(" ")    ?? "",
        phoneNumber: currentUser.phoneNumber ?? "",
        email:       currentUser.email       ?? "",
      });
      if (currentUser.profilePicture) setAvatarUrl(currentUser.profilePicture);
      setInitialized(true);
    }
  }, [currentUser, initialized]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const providers = session?.user?.app_metadata?.providers as string[] | undefined;
      if (providers) setHasPassword(providers.includes("email"));
    });
  }, []);

  if (isLoading) return <div style={loadingStyle}>Loading…</div>;

  const avatarLetter = (form.firstName?.charAt(0) || form.lastName?.charAt(0) || currentUser?.email?.charAt(0) || "U").toUpperCase();
  const fullName     = `${form.firstName} ${form.lastName}`.trim() || currentUser?.userName || "—";
  // Only allow https, http, or blob: URLs as image src — blocks javascript: protocol injection
  const safeAvatarSrc = avatarUrl && /^(https?:|blob:)/i.test(avatarUrl) ? avatarUrl : null;

  // ── Save profile name + phone
  const handleProfileSave = async () => {
    if (!form.firstName.trim()) {
      setProfileMsg({ type: "error", text: "First name is required." });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const userName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
      // One after the other. Each save rewrites the whole profile from what it
      // just read, so at the same time one could undo the other.
      await BackendAPI.updateUsername(token, userName);
      await BackendAPI.updatePhone(token, form.phoneNumber.trim() || null);
      await refreshUser();
      setProfileMsg({ type: "success", text: "Profile updated." });
    } catch (err) {
      setProfileMsg({ type: "error", text: (err as Error)?.message || "Failed to save." });
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Upload profile picture
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show local preview immediately
    setAvatarUrl(URL.createObjectURL(file));
    setUploadingPic(true);
    try {
      const result = await BackendAPI.uploadProfilePicture(token, file);
      // Backend returns { profilePicturePath }
      localStorage.removeItem("dig_user");
      await refreshUser();
    } catch (err) {
      setProfileMsg({ type: "error", text: "Picture upload failed: " + (err as Error).message });
    } finally {
      setUploadingPic(false);
    }
  };

  const handleRemovePhoto = async () => {
    try {
      await BackendAPI.removeProfilePicture(token);
      setAvatarUrl(null);
      updateUser({ profilePicture: undefined });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setProfileMsg({ type: "error", text: (err as Error)?.message || "Couldn't remove the picture." });
    }
  };

  // ── Change password
  const handlePasswordSave = async () => {
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      setPwMsg({ type: "error", text: "Please fill in all password fields." });
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ type: "error", text: "New passwords do not match." });
      return;
    }
    if (pwForm.next.length < 8) {
      setPwMsg({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    setSavingPw(true);
    setPwMsg(null);
    try {
      // Passwords live in Supabase Auth, not in DIG's own tables, so that is
      // where the old one is checked and the new one saved.
      const { error: wrongPassword } = await supabase.auth.signInWithPassword({
        email: currentUser?.email ?? "",
        password: pwForm.current,
      });
      if (wrongPassword) {
        setPwMsg({ type: "error", text: "Current password is incorrect." });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: pwForm.next });
      if (error) throw error;
      setPwMsg({ type: "success", text: "Password changed successfully." });
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPwMsg({ type: "error", text: (err as Error)?.message || "Failed to change password." });
    } finally {
      setSavingPw(false);
    }
  };

  // ── Delete account
  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteMsg(null);
    try {
      await BackendAPI.deleteAccount(token);
      logout();
      router.push("/login");
    } catch (err) {
      setDeleteMsg({ type: "error", text: (err as Error)?.message || "Failed to delete account." });
      setDeleting(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={wrapStyle}>

        <button onClick={() => router.push("/dashboard")} style={backBtnStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Dashboard
        </button>

        <div>
          <h1 style={pageTitleStyle}>Account Settings</h1>
          <p style={{ margin: "4px 0 0", color: "var(--ink-faint)", fontSize: "0.85rem" }}>Manage your profile, password, and account.</p>
        </div>

        {/* ── PROFILE ── */}
        <div className="card" style={sectionStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={avatarStyle} onClick={() => fileInputRef.current?.click()} title="Click to change picture">
              {safeAvatarSrc
                ? <img src={safeAvatarSrc} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "999px" }} />
                : avatarLetter}
              <div style={{ position: "absolute", inset: 0, borderRadius: "0", background: "color-mix(in srgb, var(--card) 45%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }} className="avatar-overlay">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
            </div>
            <div>
              <h2 style={sectionHeadStyle}>Profile Information</h2>
              <p style={{ margin: "4px 0 0", color: "var(--ink)", fontSize: "0.85rem", fontWeight: 600 }}>{fullName}</p>
              <p style={{ margin: "2px 0 0", color: "var(--ink-faint)", fontSize: "0.78rem" }}>{currentUser?.email}</p>
            </div>
          </div>

          <input type="file" ref={fileInputRef} accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button className="primary-btn" style={{ width: "fit-content", padding: "8px 16px", fontSize: "0.82rem" }}
              onClick={() => fileInputRef.current?.click()} disabled={uploadingPic}>
              {uploadingPic ? "Uploading…" : avatarUrl ? "Change picture" : "Upload picture"}
            </button>
            {avatarUrl && (
              <button onClick={handleRemovePhoto} style={dangerSmallBtn}>Remove picture</button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <Field label="First name" value={form.firstName} onChange={(v) => setForm(p => ({ ...p, firstName: v }))} placeholder="First name" />
            <Field label="Last name"  value={form.lastName}  onChange={(v) => setForm(p => ({ ...p, lastName: v }))}  placeholder="Last name" />
          </div>

          <Field label="Phone number (optional)" value={form.phoneNumber} onChange={(v) => setForm(p => ({ ...p, phoneNumber: v }))} placeholder="+1 123 456 7890" />

          <Field label="Email address" value={form.email} onChange={() => {}} disabled />
          <p style={{ margin: "-8px 0 0", color: "var(--ink-faint)", fontSize: "0.75rem" }}>Email cannot be changed here.</p>

          {profileMsg && <Msg msg={profileMsg} />}

          <button className="primary-btn" style={{ width: "fit-content", padding: "9px 22px", fontSize: "0.85rem" }}
            onClick={handleProfileSave} disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
        </div>

        {/* ── CHANGE PASSWORD ── */}
        <div className="card" style={sectionStyle}>
          <h2 style={sectionHeadStyle}>Change Password</h2>
          {!hasPassword ? (
            <p style={{ margin: "-8px 0 0", color: "var(--ink-faint)", fontSize: "0.82rem" }}>
              You sign in with Google or GitHub, so there is no DIG password to change.
            </p>
          ) : (<>
          <p style={{ margin: "-8px 0 0", color: "var(--ink-faint)", fontSize: "0.82rem" }}>Minimum 8 characters.</p>

          <Field label="Current password"    type={showPw ? "text" : "password"} value={pwForm.current} onChange={(v) => setPwForm(p => ({ ...p, current: v }))} placeholder="Your current password" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <Field label="New password"         type={showPw ? "text" : "password"} value={pwForm.next}    onChange={(v) => setPwForm(p => ({ ...p, next: v }))}    placeholder="Min 8 characters" />
            <Field label="Confirm new password" type={showPw ? "text" : "password"} value={pwForm.confirm} onChange={(v) => setPwForm(p => ({ ...p, confirm: v }))} placeholder="Repeat new password" />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.78rem", color: "var(--ink-faint)", cursor: "pointer" }}>
            <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} style={{ accentColor: "var(--cobalt-accent)" }} />
            Show passwords
          </label>

          {pwMsg && <Msg msg={pwMsg} />}

          <button className="primary-btn" style={{ width: "fit-content", padding: "9px 22px", fontSize: "0.85rem" }}
            onClick={handlePasswordSave} disabled={savingPw}>
            {savingPw ? "Updating…" : "Update password"}
          </button>
          </>)}
        </div>

       
        {/* ── DANGER ZONE ── */}
        <div className="card" style={{ ...sectionStyle, borderColor: "color-mix(in srgb, var(--danger) 35%, transparent)" }}>
          <h2 style={{ ...sectionHeadStyle, color: "var(--danger-text)" }}>Danger Zone</h2>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}>Delete Account</p>
              <p style={{ margin: "4px 0 0", color: "var(--ink-faint)", fontSize: "0.78rem" }}>Permanently removes your account and all data. Cannot be undone.</p>
            </div>
            <button style={dangerBtnStyle} onClick={() => setShowDeleteConfirm(true)}>Delete Account</button>
          </div>

          {showDeleteConfirm && (
            <div style={{ padding: "16px", borderRadius: "0", background: "color-mix(in srgb, var(--danger) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)" }}>
              <p style={{ margin: "0 0 6px", fontSize: "0.85rem", fontWeight: 700, color: "var(--danger-text)" }}>⚠ Are you sure? This cannot be undone.</p>
              <p style={{ margin: "0 0 12px", color: "var(--ink-faint)", fontSize: "0.78rem" }}>All datasets, reports, and account data will be permanently deleted.</p>
              {deleteMsg && <Msg msg={deleteMsg} />}
              <div style={{ display: "flex", gap: "10px" }}>
                <button style={{ ...dangerBtnStyle, background: "color-mix(in srgb, var(--danger) 30%, transparent)", color: "var(--danger-text)", cursor: deleting ? "not-allowed" : "pointer" }}
                  onClick={handleDeleteAccount} disabled={deleting}>
                  {deleting ? "Deleting…" : "Yes, delete my account"}
                </button>
                <button className="primary-btn" style={{ padding: "8px 16px", fontSize: "0.82rem" }}
                  onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      <style>{`
        .avatar-wrap:hover .avatar-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

function Field({ label, value, onChange, placeholder = "", type = "text", disabled = false }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} disabled={disabled}
        style={{ background: disabled ? "color-mix(in srgb, var(--card) 50%, transparent)" : "var(--card)", border: "1px solid var(--line)", borderRadius: "0", padding: "9px 13px", fontSize: "0.85rem", color: disabled ? "var(--ink-faint)" : "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box", cursor: disabled ? "not-allowed" : "text" }}
        onFocus={e => { if (!disabled) { e.target.style.borderColor = "var(--cobalt-accent)"; e.target.style.boxShadow = "0 0 0 2px color-mix(in srgb, var(--cobalt) 15%, transparent)"; }}}
        onBlur={e  => { e.target.style.borderColor = "var(--line)"; e.target.style.boxShadow = "none"; }}
      />
    </div>
  );
}

function Msg({ msg }: { msg: NonNullable<StatusMsg> }) {
  return (
    <p style={{ margin: 0, fontSize: "0.8rem", color: msg.type === "success" ? "var(--ok-text)" : "var(--danger-text)", fontWeight: 600 }}>
      {msg.type === "success" ? "✓ " : "✕ "}{msg.text}
    </p>
  );
}

const pageStyle: React.CSSProperties        = { minHeight: "100vh", background: "var(--paper)", padding: "32px 20px", color: "var(--ink)" };
const wrapStyle: React.CSSProperties        = { maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "22px" };
const backBtnStyle: React.CSSProperties     = { display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: "var(--ink-faint)", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, padding: 0, width: "fit-content" };
const pageTitleStyle: React.CSSProperties   = { margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "var(--ink)" };
const sectionStyle: React.CSSProperties     = { display: "flex", flexDirection: "column", gap: "16px" };
const sectionHeadStyle: React.CSSProperties = { margin: 0, fontSize: "0.9rem", color: "var(--ink-soft)", letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600 };
const avatarStyle: React.CSSProperties      = { position: "relative", width: "52px", height: "52px", borderRadius: "999px", background: "color-mix(in srgb, var(--cobalt) 20%, transparent)", border: "1px solid color-mix(in srgb, var(--cobalt) 40%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 700, color: "var(--cobalt-accent)", flexShrink: 0, overflow: "hidden", cursor: "pointer" };
const loadingStyle: React.CSSProperties     = { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--ink-faint)", fontSize: "0.9rem", background: "var(--card)" };
const labelStyle: React.CSSProperties       = { fontSize: "0.78rem", fontWeight: 600, color: "var(--ink-soft)", letterSpacing: "0.03em" };
const dangerBtnStyle: React.CSSProperties   = { padding: "8px 16px", borderRadius: "0", border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)", background: "color-mix(in srgb, var(--danger) 20%, transparent)", color: "var(--danger-text)", fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" };
const dangerSmallBtn: React.CSSProperties   = { padding: "8px 14px", borderRadius: "0", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)", background: "transparent", color: "var(--danger-text)", fontSize: "0.78rem", cursor: "pointer" };
const disabledSelectStyle: React.CSSProperties = { background: "color-mix(in srgb, var(--card) 50%, transparent)", border: "1px solid var(--line)", borderRadius: "0", padding: "9px 13px", fontSize: "0.82rem", color: "var(--ink-faint)", cursor: "not-allowed", width: "100%" };