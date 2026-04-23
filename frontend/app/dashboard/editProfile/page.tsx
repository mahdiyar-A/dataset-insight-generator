// @ts-nocheck
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import BackendAPI from "@/lib/BackendAPI";

export default function AccountSettingsPage() {
  const router = useRouter();
  const { user: currentUser, isLoading, updateUser, refreshUser, logout, token } = useAuth();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", phoneNumber: "", email: "" });
  const [initialized,   setInitialized]   = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState(null);

  const [pwForm,   setPwForm]   = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg,    setPwMsg]    = useState(null);
  const [showPw,   setShowPw]   = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting,          setDeleting]          = useState(false);
  const [deleteMsg,         setDeleteMsg]         = useState(null);

  const [avatarUrl,     setAvatarUrl]     = useState(null);
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
      await Promise.all([
        BackendAPI.updateUsername(token, userName),
        BackendAPI.updatePhone(token, form.phoneNumber.trim() || null),
      ]);
      await refreshUser();
      setProfileMsg({ type: "success", text: "Profile updated." });
    } catch (err) {
      setProfileMsg({ type: "error", text: err?.message || "Failed to save." });
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Upload profile picture
  const handlePhotoChange = async (e) => {
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
      setProfileMsg({ type: "error", text: "Picture upload failed: " + err.message });
    } finally {
      setUploadingPic(false);
    }
  };

  const handleRemovePhoto = () => {
    setAvatarUrl(null);
    updateUser({ profilePicture: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      await BackendAPI.changePassword(token, pwForm.current, pwForm.next);
      await refreshUser();
      setPwMsg({ type: "success", text: "Password changed successfully." });
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPwMsg({ type: "error", text: err?.message || "Failed to change password." });
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
      setDeleteMsg({ type: "error", text: err?.message || "Failed to delete account." });
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
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "0.85rem" }}>Manage your profile, password, and account.</p>
        </div>

        {/* ── PROFILE ── */}
        <div className="card" style={sectionStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={avatarStyle} onClick={() => fileInputRef.current?.click()} title="Click to change picture">
              {safeAvatarSrc
                ? <img src={safeAvatarSrc} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "999px" }} />
                : avatarLetter}
              <div style={{ position: "absolute", inset: 0, borderRadius: "999px", background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }} className="avatar-overlay">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
            </div>
            <div>
              <h2 style={sectionHeadStyle}>Profile Information</h2>
              <p style={{ margin: "4px 0 0", color: "#e5e7eb", fontSize: "0.85rem", fontWeight: 600 }}>{fullName}</p>
              <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: "0.78rem" }}>{currentUser?.email}</p>
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
          <p style={{ margin: "-8px 0 0", color: "#4b5563", fontSize: "0.75rem" }}>Email cannot be changed here.</p>

          {profileMsg && <Msg msg={profileMsg} />}

          <button className="primary-btn" style={{ width: "fit-content", padding: "9px 22px", fontSize: "0.85rem" }}
            onClick={handleProfileSave} disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </button>
        </div>

        {/* ── CHANGE PASSWORD ── */}
        <div className="card" style={sectionStyle}>
          <h2 style={sectionHeadStyle}>Change Password</h2>
          <p style={{ margin: "-8px 0 0", color: "#6b7280", fontSize: "0.82rem" }}>Minimum 8 characters.</p>

          <Field label="Current password"    type={showPw ? "text" : "password"} value={pwForm.current} onChange={(v) => setPwForm(p => ({ ...p, current: v }))} placeholder="Your current password" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <Field label="New password"         type={showPw ? "text" : "password"} value={pwForm.next}    onChange={(v) => setPwForm(p => ({ ...p, next: v }))}    placeholder="Min 8 characters" />
            <Field label="Confirm new password" type={showPw ? "text" : "password"} value={pwForm.confirm} onChange={(v) => setPwForm(p => ({ ...p, confirm: v }))} placeholder="Repeat new password" />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.78rem", color: "#6b7280", cursor: "pointer" }}>
            <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} style={{ accentColor: "#2563eb" }} />
            Show passwords
          </label>

          {pwMsg && <Msg msg={pwMsg} />}

          <button className="primary-btn" style={{ width: "fit-content", padding: "9px 22px", fontSize: "0.85rem" }}
            onClick={handlePasswordSave} disabled={savingPw}>
            {savingPw ? "Updating…" : "Update password"}
          </button>
        </div>

       
        {/* ── DANGER ZONE ── */}
        <div className="card" style={{ ...sectionStyle, borderColor: "rgba(249,115,115,0.3)" }}>
          <h2 style={{ ...sectionHeadStyle, color: "#f97373" }}>Danger Zone</h2>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600, color: "#e5e7eb" }}>Delete Account</p>
              <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "0.78rem" }}>Permanently removes your account and all data. Cannot be undone.</p>
            </div>
            <button style={dangerBtnStyle} onClick={() => setShowDeleteConfirm(true)}>Delete Account</button>
          </div>

          {showDeleteConfirm && (
            <div style={{ padding: "16px", borderRadius: "12px", background: "rgba(127,29,29,0.15)", border: "1px solid rgba(249,115,115,0.3)" }}>
              <p style={{ margin: "0 0 6px", fontSize: "0.85rem", fontWeight: 700, color: "#fca5a5" }}>⚠ Are you sure? This cannot be undone.</p>
              <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: "0.78rem" }}>All datasets, reports, and account data will be permanently deleted.</p>
              {deleteMsg && <Msg msg={deleteMsg} />}
              <div style={{ display: "flex", gap: "10px" }}>
                <button style={{ ...dangerBtnStyle, background: "rgba(127,29,29,0.3)", color: "#fca5a5", cursor: deleting ? "not-allowed" : "pointer" }}
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

function Field({ label, value, onChange, placeholder, type = "text", disabled = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} disabled={disabled}
        style={{ background: disabled ? "rgba(15,23,42,0.5)" : "rgba(15,23,42,0.95)", border: "1px solid rgba(55,65,81,0.9)", borderRadius: "10px", padding: "9px 13px", fontSize: "0.85rem", color: disabled ? "#4b5563" : "#e5e7eb", outline: "none", width: "100%", boxSizing: "border-box", cursor: disabled ? "not-allowed" : "text" }}
        onFocus={e => { if (!disabled) { e.target.style.borderColor = "rgba(37,99,235,0.7)"; e.target.style.boxShadow = "0 0 0 2px rgba(37,99,235,0.15)"; }}}
        onBlur={e  => { e.target.style.borderColor = "rgba(55,65,81,0.9)"; e.target.style.boxShadow = "none"; }}
      />
    </div>
  );
}

function Msg({ msg }) {
  return (
    <p style={{ margin: 0, fontSize: "0.8rem", color: msg.type === "success" ? "#bbf7d0" : "#f97373", fontWeight: 600 }}>
      {msg.type === "success" ? "✓ " : "✕ "}{msg.text}
    </p>
  );
}

const pageStyle        = { minHeight: "100vh", background: "radial-gradient(circle at top, #020617 0, #020617 45%, #000 100%)", padding: "32px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#e5e7eb" };
const wrapStyle        = { maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "22px" };
const backBtnStyle     = { display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: "#6b7280", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500, padding: 0, width: "fit-content" };
const pageTitleStyle   = { margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "#f1f5f9" };
const sectionStyle     = { display: "flex", flexDirection: "column", gap: "16px" };
const sectionHeadStyle = { margin: 0, fontSize: "0.9rem", color: "#9ca3af", letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600 };
const avatarStyle      = { position: "relative", width: "52px", height: "52px", borderRadius: "999px", background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 700, color: "#bfdbfe", flexShrink: 0, overflow: "hidden", cursor: "pointer" };
const loadingStyle     = { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#6b7280", fontSize: "0.9rem", background: "#020617" };
const labelStyle       = { fontSize: "0.78rem", fontWeight: 600, color: "#9ca3af", letterSpacing: "0.03em" };
const dangerBtnStyle   = { padding: "8px 16px", borderRadius: "999px", border: "1px solid rgba(249,115,115,0.4)", background: "rgba(127,29,29,0.2)", color: "#f97373", fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" };
const dangerSmallBtn   = { padding: "8px 14px", borderRadius: "999px", border: "1px solid rgba(249,115,115,0.3)", background: "transparent", color: "#f97373", fontSize: "0.78rem", cursor: "pointer" };
const disabledSelectStyle = { background: "rgba(15,23,42,0.5)", border: "1px solid rgba(55,65,81,0.6)", borderRadius: "10px", padding: "9px 13px", fontSize: "0.82rem", color: "#374151", cursor: "not-allowed", width: "100%" };