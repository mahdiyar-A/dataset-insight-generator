'use client';

import AuthLinkStatus from '@/components/AuthLinkStatus';

// Where the email-change confirmation lands (emailRedirectTo in AuthContext's
// changeEmail). This page did not exist, so confirming a new address ended on
// a 404 even though the change itself had gone through.
export default function VerifyEmailChangePage() {
  return (
    <AuthLinkStatus
      successTitle="Email address updated"
      successMessage="Your new email address is confirmed. Taking you to your dashboard..."
      redirectTo="/dashboard"
      redirectLabel="Go to dashboard"
    />
  );
}
