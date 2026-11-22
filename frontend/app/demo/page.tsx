import type { Metadata } from 'next';

import DemoTour from './DemoTour';

export const metadata: Metadata = {
  title: 'Interactive demo | DIG',
  description:
    'Take DIG for a spin: upload, check and clean a real file, read the report, ask questions and compare the plans. No sign-up.',
  alternates: { canonical: '/demo' },
};

export default function DemoPage() {
  return <DemoTour />;
}
