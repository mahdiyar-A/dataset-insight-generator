'use client';

import SocialSignIn from '@/components/SocialSignIn';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/app/contexts/AuthContext';
import { errorMessage } from "@/lib/types";
import { isFirstNameOk, isLastNameOk } from '@/lib/nameRules';

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isPasswordOk = (v: string) => v.length >= 8 && /\d/.test(v);

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [verificationSent, setVerificationSent] = useState(false);

  const handleRegister = async () => {
    setError('');
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim();

    // A space gets its own answer: "Mary Ann" was refused with a list of
    // allowed characters that never said the space was the problem.
    if (/\s/.test(fn)) return setError('A first name can\'t contain a space. Join the parts with a hyphen (Mary-Ann), or put the second part in your last name.');
    if (!isFirstNameOk(fn)) return setError('Enter your first name: letters, apostrophes, hyphens or dots, up to 30.');
    if (!isLastNameOk(ln))  return setError('Enter your last name: letters, spaces, apostrophes, hyphens or dots, up to 30.');
    if (!isValidEmail(em)) return setError('Enter a valid email.');
    if (!isPasswordOk(password)) return setError('Password must be at least 8 characters and contain a number.');
    if (password !== confirm)    return setError('Passwords do not match.');

    setLoading(true);
    try {
      const { needsVerification } = await register(fn, ln, em, password);
      if (needsVerification) {
        setVerificationSent(true); // show "check your email" screen
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(errorMessage(err) || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Email verification sent screen ────────────────────────────────────────
  if (verificationSent) {
    return (
      <div className="auth-body">
        <div className="auth-container" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
          <h2>Check your email</h2>
          <p style={{ color: 'var(--ink-soft)', lineHeight: 1.7, marginBottom: '24px' }}>
            We sent a verification link to <strong style={{ color: 'var(--ink)' }}>{email}</strong>.
            <br />Click the link to activate your account.
          </p>
          <p style={{ color: 'var(--ink-faint)', fontSize: '0.85rem' }}>
            Didn't receive it? Check spam or{' '}
            <span style={{ color: 'var(--cobalt-accent)', cursor: 'pointer' }}
              onClick={() => setVerificationSent(false)}>
              try again
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-body">
      <div className="auth-container">
        <button onClick={() => router.push('/')}
          style={{ background: 'none', border: 'none', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: '0.85rem', alignSelf: 'flex-start', marginBottom: '8px', padding: '0' }}>
          ← Back
        </button>
        <h2>Create Account</h2>

        <SocialSignIn />

        <div className="name-row">
          <div className="input-group">
            <label>First Name</label>
            <input type="text" placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Last Name</label>
            <input type="text" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="input-group">
          <label>Email</label>
          <input type="email" placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        <div className="input-group">
          <label>Password</label>
          <input type="password" placeholder="At least 8 characters + 1 number" value={password} onChange={e => setPassword(e.target.value)} />
        </div>

        <div className="input-group">
          <label>Confirm Password</label>
          <input type="password" placeholder="Repeat password" value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="auth-btn" onClick={handleRegister} disabled={loading}>
          {loading ? 'Creating account…' : 'Register'}
        </button>

        <div className="auth-footer">
          Already have an account? <Link href="/login">Login</Link>
        </div>
      </div>
    </div>
  );
}