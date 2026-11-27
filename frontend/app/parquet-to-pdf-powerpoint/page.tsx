import type { Metadata } from 'next';

import UseCasePage, { metadataFor } from '../home/UseCasePage';
import { USE_CASES } from '../home/useCases';

const page = USE_CASES.parquet;

export const metadata: Metadata = metadataFor(page);

export default function Page() {
  return <UseCasePage page={page} />;
}
