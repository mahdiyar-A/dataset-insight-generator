import type { Metadata } from 'next';

import { PLANS } from '../demo/demoFacts';

/**
 * The plans page is a client component, so its metadata lives here. Without a
 * canonical of its own it took the root layout's "/", which told search
 * engines Pricing was a copy of the homepage and kept it out of results.
 */
export const metadata: Metadata = {
  title: 'Pricing | DIG',
  description:
    `Start free with ${PLANS.free.window.count} analyses every ${PLANS.free.window.hours} hours, no card needed. `
    + `Pro is ${PLANS.pro.price} ${PLANS.pro.per}: Word and PowerPoint reports, 8 languages and team editing.`,
  alternates: { canonical: '/plans' },
};

export default function PlansLayout({ children }: { children: React.ReactNode }) {
  return children;
}
