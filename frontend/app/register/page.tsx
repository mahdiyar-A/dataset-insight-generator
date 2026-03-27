'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/app/contexts/AuthContext';
import './register.css';

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isNameOk = (v: string) => /^[A-Za-z]{1,30}$/.test(v.trim()); // letters only, max 30
const isPasswordOk = (v: string) => v.length >= 8 && /\d/.test(v); // >=8 + digit

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');

    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim();

    if (!isNameOk(fn)) return setError('First name must be letters only (max 30).');
    if (!isNameOk(ln)) return setError('Last name must be letters only (max 30).');
    if (!isValidEmail(em)) return setError('Enter a valid email (must include @).');
    if (!isPasswordOk(password))
      return setError('Password must be at least 8 characters and contain at least 1 number.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setLoading(true);
    try {
      await register(fn, ln, em, password); // auto-login happens inside AuthContext
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-body">
      <div className="auth-container">
        <button
          onClick={() => router.push("/")}
          style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:"0.85rem", alignSelf:"flex-start", marginBottom:"8px", padding:"0" }}>
          ← Back
        </button>
        <h2>Create Account</h2>

        <div className="name-row">
          <div className="input-group">
            <label>First Name</label>
            <input
              type="text"
              placeholder="Enter your first name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Last Name</label>
            <input
              type="text"
              placeholder="Enter your last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="input-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Confirm Password</label>
          <input
            type="password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
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