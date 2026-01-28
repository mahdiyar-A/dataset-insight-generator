'use client';

import { useState } from 'react';
import styles from './forgotPassword.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSendReset = async () => {
    setError('');
    setSuccess('');

    if (!email) {
      setError('Please enter your email');
      return;
    }

    setLoading(true);

    try {
      const payload = { email };

      // 🔍 DEBUG: print request
      console.log('FORGOT PASSWORD REQUEST →', payload);

      const response = await fetch('https://your-backend-url/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('FORGOT PASSWORD STATUS →', response.status);

      const responseText = await response.text();
      console.log('FORGOT PASSWORD RESPONSE →', responseText);

      if (!response.ok) {
        throw new Error(responseText || 'Failed to send reset link');
      }

      setSuccess('If an account with that email exists, a reset link has been sent.');
      setEmail('');
    } catch (err: any) {
      console.error('FORGOT PASSWORD ERROR →', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authBody}>
      <div className={styles.authContainer}>
        <h2>Forgot Password</h2>
        <p>Enter your email and we’ll send you a password reset link.</p>

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {error && <p className={styles.authError}>{error}</p>}
        {success && <p className={styles.authSuccess}>{success}</p>}

        <button
          className={styles.authBtn}
          onClick={handleSendReset}
          disabled={loading}
        >
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>

        <div className={styles.authFooter}>
          <a href="/login">← Back to login</a>
        </div>
      </div>
    </div>
  );
}
