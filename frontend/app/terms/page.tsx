import type { Metadata } from 'next';

import LegalPage from '@/components/LegalPage';

/*
 * Terms of Service.
 *
 * The limits quoted here (file size, history slots, plan behaviour) are the
 * ones the code enforces, not marketing numbers: 50 MB is the storage bucket's
 * own limit, and 5/15 history slots come from AnalysisService.HistoryLimitFor.
 * If either changes in code, this page is wrong and must change with it.
 *
 * [REVIEW] markers are facts only the operator can supply.
 */

export const metadata: Metadata = {
  title: 'Terms of Service | DIG',
  description:
    'The terms for using DIG: what the service does, what you keep, what we do not promise, plans and cancellation.',
  alternates: { canonical: '/terms' },
};

const UPDATED = 'LAST UPDATED 27 SEPTEMBER 2026';

const INTRO = [
  'These terms govern your use of DIG. They are written in plain language on purpose — you should be able to read them.',
  'By creating an account or running an analysis, you agree to them.',
];

const SECTIONS = [
  {
    heading: 'The service',
    body: [
      'DIG accepts a spreadsheet or CSV file, cleans and profiles it, runs statistical analysis on it, and produces a written report with charts. Some of that work is done by our own code and some by AI models operated by other companies, as described in our Privacy Policy.',
      'DIG is operated by [REVIEW: legal entity name]. We may add, change or remove features. If we remove something you depend on, we will tell registered users by email.',
    ],
  },
  {
    heading: 'Your account',
    body: [
      'You need an account to run an analysis. You are responsible for keeping your sign-in credentials secure and for everything done through your account.',
      'One account per person. Do not share credentials, and do not create accounts to get around plan limits.',
    ],
  },
  {
    heading: 'Your data stays yours',
    body: [
      'You keep all rights to the files you upload and to the reports generated from them. We claim no ownership over either.',
      'You grant us only the permission needed to run the service: to store your file, process it, send derived data to the providers listed in the Privacy Policy, and deliver the report back to you. Nothing more. We do not use your data to train models and we do not share it with anyone beyond those providers.',
    ],
  },
  {
    heading: 'What you must not upload',
    body: ['You are responsible for having the right to upload what you upload. Do not upload:'],
    list: [
      'Data you are not legally permitted to share with a third-party processor — see the sensitive-data warning in our Privacy Policy, which explains that some real values are sent to an AI provider.',
      'Personal data belonging to other people without a lawful basis for processing it.',
      'Anything unlawful, or content you do not hold the rights to.',
      'Files intended to attack or disrupt the service.',
    ],
  },
  {
    heading: 'Limits',
    body: ['The service enforces these limits:'],
    list: [
      'Uploads are capped at 50 MB per file.',
      'Analysis history is capped at 5 analyses on the free plan and 15 on Pro. Exceeding the cap deletes your oldest analysis and its files automatically and permanently.',
      'Download your reports if you want to keep them. Your history is working space, not an archive, and we do not undertake to recover a pruned analysis.',
      'Free accounts may run 2 analyses per 48 hours. Pro accounts are unlimited. The service also applies general request limits to protect against abuse.',
    ],
  },
  {
    heading: 'Plans and payment',
    body: [
      'There is a free plan and a paid Pro plan (CAD $9.99 per month). Payment is handled by Stripe; your card details never reach our servers.',
      'Pro renews automatically until you cancel. You can cancel at any time and keep access until the end of the period you have already paid for. Your history cap drops back to the free plan limit when Pro ends, which may prune older analyses.',
      '[REVIEW: add your refund policy, and how much notice you will give before a price change.]',
    ],
  },
  {
    heading: 'What we do not promise',
    body: [
      'DIG produces statistical analysis and AI-written commentary. Both can be wrong. A correlation is not a cause, an AI model can misread a column, and a report can state something confidently that is not true of your data.',
      'The output is a starting point for your own judgement, not a professional opinion. Do not rely on it alone for a financial, medical, legal, employment or safety decision. Check anything that matters against the underlying data.',
      'The service is provided as is, without warranties of any kind. We do not promise it will be available without interruption, free of errors, or that any particular analysis will succeed.',
    ],
  },
  {
    heading: 'Limitation of liability',
    body: [
      'To the fullest extent the law allows, we are not liable for indirect or consequential loss, lost profits, lost data, or decisions made on the basis of a report.',
      'Where liability cannot be excluded, it is limited to the amount you paid us in the 12 months before the claim — which for a free-plan user is nothing.',
      'Nothing here excludes liability that cannot lawfully be excluded, including for fraud.',
      '[REVIEW: have this section checked against your jurisdiction\'s consumer-protection rules, which may override parts of it.]',
    ],
  },
  {
    heading: 'Ending the agreement',
    body: [
      'You can stop using DIG and delete your account at any time. Deleting it removes your analyses and every file stored for you.',
      'We may suspend or close an account that breaks these terms, attacks the service, or is used to avoid paying for it. Where circumstances allow, we will tell you why first.',
    ],
  },
  {
    heading: 'Governing law',
    body: [
      '[REVIEW: name the governing law and the courts that have jurisdiction — normally where your legal entity is established.]',
    ],
  },
  {
    heading: 'Changes to these terms',
    body: [
      'We may update these terms. The date at the top changes when we do, and material changes will be emailed to registered users. Continuing to use the service after a change means you accept the updated terms.',
    ],
  },
];

const CLOSING =
  'The limits described here are the ones the software actually enforces. This document has not been reviewed by a lawyer — have a qualified professional review it and fill in every [REVIEW] item before charging customers.';

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={UPDATED}
      intro={INTRO}
      sections={SECTIONS}
      closing={CLOSING}
    />
  );
}
