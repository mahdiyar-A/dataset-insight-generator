'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const handleSubmit = () => {
    // placeholder only
    setMsg('Forgot password will be implemented later.');
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Forgot Password</h2>
      <p>Enter your email:</p>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button onClick={handleSubmit} style={{ marginLeft: 10 }}>Submit</button>
      {msg && <p style={{ marginTop: 20 }}>{msg}</p>}
      <p style={{ marginTop: 20 }}>
        <Link href="/login">Back to login</Link>
      </p>
    </div>
  );
}