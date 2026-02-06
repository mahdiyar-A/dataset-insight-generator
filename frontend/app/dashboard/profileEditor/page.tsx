'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/contexts/AuthContext';
import BackendAPI from '@/lib/BackendAPI';
import styles from './profileEditor.module.css';

export default function ProfileEditorPage() {
  const router = useRouter();
  const { currentUser, isLoading, updateUser } = useAuth();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    displayName: '',
    phoneNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [initialized, setInitialized] = useState(false); // only init once

  // Initialize form once from currentUser
  useEffect(() => {
    if (currentUser && !initialized) {
      const firstFromUser = currentUser.firstName ?? (currentUser.username || '').split(' ')[0] ?? '';
      const lasFromUser = currentUser.lastName ?? (currentUser.username || '').split(' ').slice(1).join(' ') ?? '';

      setFormData({
        firstName: firstFromUser,
        lastName: lasFromUser,
        email: currentUser.email || '',
        displayName: currentUser.username || '',
        phoneNumber: currentUser?.phoneNumber ?? '',
      });
      setInitialized(true);
    }
  }, [currentUser, initialized]);

  if (isLoading) {
    return <div className={styles.container}>Loading...</div>;
  }

  if (!currentUser) {
    return <div className={styles.container}>Not authenticated</div>;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const token = localStorage.getItem('authToken');
      if (!token) throw new Error('Not authenticated');

      // Build updated username from displayName or names
      const username = (formData.displayName || `${formData.firstName} ${formData.lastName}`).trim();

      // Prepare payload for backend
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        username,
        phoneNumber: formData.phoneNumber?.trim() || '',
      };

      // Call backend API to update profile
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to update profile');
      }
      const updatedUser = await response.json();
      updateUser(updatedUser); // update context/localStorage
      setSuccess('Profile updated successfully!');
      setLoading(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
      setLoading(false);
    }
  };

  const getInitial = () => {
    return (currentUser.username?.charAt(0) || 'U').toUpperCase();
  };

  return (
    <div className={styles.container}>
      <div className={styles.backDashboardContainer}>
        <a href="/dashboard" className={styles.btnGhost}>
          ← Back to dashboard
        </a>
      </div>

      <aside className={styles.card}>
        <div className={styles.bigAvatar}>
          {currentUser.profilePicture ? (
            <img src={currentUser.profilePicture} alt="Avatar" />
          ) : (
            getInitial()
          )}
        </div>
        <h3>{currentUser.username}</h3>
        <p style={{ color: '#666', fontSize: '0.9em' }}>{currentUser.email}</p>
      </aside>

      <section className={styles.card}>
        <h2>Edit profile</h2>

        {error && <p className={styles.error}>{error}</p>}
        {success && <p className={styles.success}>{success}</p>}

        <form onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label>First name</label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Last name</label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              disabled
            />
            <small>Email cannot be changed (requires backend verification)</small>
          </div>

          <div className={styles.inputGroup}>
            <label>Display name</label>
            <input
              type="text"
              name="displayName"
              value={formData.displayName}
              onChange={handleInputChange}
              placeholder="Optional (e.g., Mahdiyar)"
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Phone Number</label>
            <input
              type="text"
              name="phoneNumber"
              value={formData.phoneNumber}
              onChange={handleInputChange}
              placeholder="Optional (e.g., +1 123 456 7890)"
            />
          </div>

          <div className={styles.formActions}>
            <button className={styles.primaryBtn} type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}