import type { Metadata } from 'next';

/**
 * Like the login form: kept out of search results and the sitemap, with its
 * own canonical rather than the root layout's "/".
 */
export const metadata: Metadata = {
  title: 'Reset your password | DIG',
  robots: { index: false, follow: true },
  alternates: { canonical: '/forgot-password' },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
