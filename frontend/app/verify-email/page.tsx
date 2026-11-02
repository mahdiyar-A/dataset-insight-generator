'use client';

import AuthLinkStatus from '@/components/AuthLinkStatus';

// Where the sign-up confirmation email lands (emailRedirectTo in AuthContext).
export default function VerifyEmailPage() {
  return (
    <AuthLinkStatus
      successTitle="Email verified!"
      successMessage="Your account is active. Taking you to your dashboard..."
      redirectTo="/dashboard"
      redirectLabel="Go to dashboard"
    />
  );
}
