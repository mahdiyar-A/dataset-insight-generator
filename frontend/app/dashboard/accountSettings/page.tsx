'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import BackendAPI from '@/lib/BackendAPI';
import styles from './accountSettings.module.css';

export default function AccountSettingsPage() {
  const router = useRouter();
  const { currentUser, logout } = useAuth();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogout = async () => {
    const token = localStorage.getItem('authToken');
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch {}
    logout();
    router.push('/login');
  };

  const handleDeleteAccount = async () => {
    setError('');
    setDeleting(true);

    try {
      const token = localStorage.getItem('authToken');
      if (!token) throw new Error('Not authenticated');
      // Call backend API to delete account (if implemented)
      const response = await fetch('/api/users/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to delete account');
      }
      logout();
      router.push('/login');
    } catch (err: any) {
      setError(err?.message || 'Failed to delete account');
      setDeleting(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Back to dashboard */}
      <a href="/dashboard" className={styles.btnGhost}>
        ← Back to dashboard
      </a>

      <h2>Account Settings</h2>

      {error && <p style={{ color: '#d32f2f', marginBottom: '16px' }}>{error}</p>}
      {success && <p style={{ color: '#388e3c', marginBottom: '16px' }}>{success}</p>}

      {/* Account Information Section */}
      <div className={styles.settingsSection}>
        <h3>Account Information</h3>
        <div className={styles.settingRow}>
          <div>
            <strong>Email</strong>
            <div className={styles.mutedSmall}>{currentUser?.email}</div>
          </div>
        </div>
        <div className={styles.settingRow}>
          <div>
            <strong>Username</strong>
            <div className={styles.mutedSmall}>{currentUser?.username}</div>
          </div>
        </div>
        <div className={styles.settingRow}>
          <div>
            <strong>Account Created</strong>
            <div className={styles.mutedSmall}>
              {new Date().toLocaleDateString()} (mock date)
            </div>
          </div>
        </div>
      </div>

      {/* Privacy & Security */}
      <div className={styles.settingsSection}>
        <h3>Privacy & Security</h3>
        <div className={styles.settingRow}>
          <div>
            <strong>Password</strong>
            <div className={styles.mutedSmall}>Manage your password</div>
          </div>
          <button className={styles.primaryBtn} disabled>
            Change (backend only)
          </button>
        </div>
        <div className={styles.settingRow}>
          <div>
            <strong>Login History</strong>
            <div className={styles.mutedSmall}>View recent login activity</div>
          </div>
          <button className={styles.primaryBtn} disabled>
            View (backend only)
          </button>
        </div>
      </div>

      {/* Danger Zone - Account Management */}
      <div className={styles.settingsSection} style={{ borderColor: '#d32f2f' }}>
        <h3 style={{ color: '#d32f2f' }}>Danger Zone</h3>

        <div className={styles.settingRow}>
          <div>
            <strong>Sign Out</strong>
            <div className={styles.mutedSmall}>
              End your current session
            </div>
          </div>
          <button
            className={styles.secondaryBtn}
            onClick={handleLogout}
          >
            Sign Out
          </button>
        </div>

        <div className={styles.settingRow}>
          <div>
            <strong>Delete Account</strong>
            <div className={styles.mutedSmall}>
              Permanently delete your account and all associated data
            </div>
          </div>
          <button
            className={styles.secondaryBtn}
            style={{ borderColor: '#d32f2f', color: '#d32f2f' }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </button>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div style={{
            marginTop: '16px',
            padding: '16px',
            backgroundColor: '#fff3e0',
            border: '1px solid #d32f2f',
            borderRadius: '8px',
          }}>
            <p style={{ marginBottom: '12px', fontWeight: 'bold' }}>
              ⚠️ Are you sure you want to delete your account?
            </p>
            <p style={{ marginBottom: '16px', fontSize: '0.9em', color: '#666' }}>
              This action cannot be undone. All your data will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className={styles.secondaryBtn}
                style={{ borderColor: '#d32f2f', color: '#d32f2f' }}
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete My Account'}
              </button>
              <button
                className={styles.primaryBtn}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}