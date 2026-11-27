import type { Metadata } from 'next';

/**
 * The sign-up page is a client component, so its metadata lives here, with a
 * canonical of its own rather than the root layout's "/" (which said this page
 * was a copy of the homepage).
 */
export const metadata: Metadata = {
  title: 'Create a free account | DIG',
  description:
    'Create a free DIG account: upload a data file and get a written analysis, charts and a PDF report. No card needed.',
  alternates: { canonical: '/register' },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
