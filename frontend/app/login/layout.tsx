import type { Metadata } from 'next';

/**
 * Nobody searches for a login form, so search engines are asked to leave it
 * out (and it is not in the sitemap). Its canonical is its own, not the root
 * layout's "/", so the two signals do not contradict each other.
 */
export const metadata: Metadata = {
  title: 'Log in | DIG',
  robots: { index: false, follow: true },
  alternates: { canonical: '/login' },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
