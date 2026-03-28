'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/app/contexts/AuthContext';
import { useTranslations } from 'next-intl';
import './register.css';

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const isNameOk = (v: string) => /^[A-Za-z]{1,30}$/.test(v.trim()); // letters only, max 30
const isPasswordOk = (v: string) => v.length >= 8 && /\d/.test(v); // >=8 + digit

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const t = useTranslations('auth');

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

    if (!isNameOk(fn)) return setError(t('errorFirstName'));
    if (!isNameOk(ln)) return setError(t('errorLastName'));
    if (!isValidEmail(em)) return setError(t('errorInvalidEmail'));
    if (!isPasswordOk(password))
      return setError(t('errorPasswordWeak'));
    if (password !== confirmPassword) return setError(t('errorPasswordMatch'));

    setLoading(true);
    try {
      await register(fn, ln, em, password);
      router.push('/');
    } catch (err: any) {
      setError(err?.message || t('errorRegisterFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-body">
      <div className="auth-container">
        <h2>{t('registerTitle')}</h2>

        <div className="name-row">
          <div className="input-group">
            <label>{t('firstNameLabel')}</label>
            <input
              type="text"
              placeholder={t('firstNamePlaceholder')}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>{t('lastNameLabel')}</label>
            <input
              type="text"
              placeholder={t('lastNamePlaceholder')}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="input-group">
          <label>{t('emailLabel')}</label>
          <input
            type="email"
            placeholder={t('emailPlaceholderFull')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>{t('passwordLabel')}</label>
          <input
            type="password"
            placeholder={t('passwordPlaceholderFull')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>{t('confirmPasswordLabel')}</label>
          <input
            type="password"
            placeholder={t('confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="auth-btn" onClick={handleRegister} disabled={loading}>
          {loading ? t('registerBtnLoading') : t('registerBtn')}
        </button>

        <div className="auth-footer">
          {t('alreadyHaveAccount')} <Link href="/login">{t('loginLink')}</Link>
        </div>
      </div>
    </div>
  );
}