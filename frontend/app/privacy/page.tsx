import type { Metadata } from 'next';

import LegalPage from '@/components/LegalPage';

/*
 * Privacy Policy.
 *
 * Every factual claim below was checked against the code rather than written
 * from a template, because a privacy policy that describes a data flow the
 * software does not have is worse than none: it is a false statement made to
 * users. In particular the third-party section says plainly that up to five
 * real values per column are sent to Groq for domain classification
 * (ai_service/ai_engine/llm/groq_client.py, _build_fingerprint), which the
 * usual "we only send anonymous metadata" boilerplate would have hidden.
 *
 * Operator, jurisdiction and retention were supplied by the operator on
 * 2026-09-27: sole individual, Toronto, Ontario. There are no placeholders
 * left on the page. The 30-day log retention is a commitment the hosting
 * configuration has to honour — see the note in the Terms.
 */

export const metadata: Metadata = {
  title: 'Privacy Policy | DIG',
  description:
    'How DIG handles the files you upload, what leaves our servers, which third parties are involved, and how to delete your data.',
  alternates: { canonical: '/privacy' },
};

const UPDATED = 'LAST UPDATED 27 SEPTEMBER 2026';

const INTRO = [
  'DIG turns a spreadsheet into an analysis report. To do that it has to read your file, so this page explains exactly what happens to it: where it is stored, what is computed locally, what is sent to other companies, and how to get rid of it.',
  'It is written to be specific rather than reassuring. Where something does leave our servers, it says so.',
];

const SECTIONS = [
  {
    heading: 'Who we are',
    body: [
      'DIG (Dataset Insight Generator) is run by Mahdiyar Ashrafioun, an individual based in Toronto, Ontario, Canada. It is not incorporated — there is no company behind it, just one person. You can reach us at dataset_insight_generator.ai@proton.me for any question about this policy or any request described below.',
      'The service is offered through datainsightgen.com, datainsightgen.ca and datainsightgen.online. This policy covers all three.',
    ],
  },
  {
    heading: 'What we collect',
    body: ['Three kinds of data, and nothing else:'],
    list: [
      'Account data — your email address, a hashed password (or the identifier from your sign-in provider), your plan, and the dates you signed up and last signed in. We never store your password itself.',
      'The files you upload — the spreadsheet or CSV you choose to analyse, exactly as you sent it, plus the reports generated from it.',
      'Operational records — the analyses you have run, their status, timestamps, and errors when something fails. These exist so the product works and so we can fix it when it does not.',
    ],
  },
  {
    heading: 'What we do not collect',
    body: [
      'There is no advertising network, no analytics or tracking script, and no third-party cookie anywhere on this site. We do not build a profile of you, we do not track you across other sites, and we do not sell or rent anything to anyone.',
      'Your browser stores a sign-in token so you stay logged in, and your language and theme choice for the duration of the tab. Both are strictly necessary for the site to function, which is why you are not asked to consent to a cookie banner — there is nothing optional to consent to.',
    ],
  },
  {
    heading: 'Where your file is stored',
    body: [
      'Uploaded files and generated reports are held in private storage on Supabase, which hosts our database and file storage. The storage bucket is private: files are not reachable by URL, and access requires a signed request tied to your account.',
      'Our database enforces row-level security, meaning the rules that restrict each row to its owner are applied by the database itself rather than only by application code. A bug in the application cannot hand your rows to another user.',
    ],
  },
  {
    heading: 'What leaves our servers',
    body: [
      'This is the part most policies are vague about, so here it is precisely. Your file itself is never sent to any AI provider. What is sent is derived from it, and some of that derived data does contain real values from your file:',
    ],
    list: [
      'Groq — used once per analysis to work out what kind of dataset you uploaded. It receives each column\'s name, data type, how much of it is missing, how many distinct values it holds, basic numeric ranges, the three most frequent values in each text column, and up to five example values taken from each column. Those example values are real cells from your file.',
      'Google (Gemini) — used to write the report. It receives computed statistics: correlations, group averages, outlier rates, trends, and category labels such as region or product names. It does not receive individual rows.',
      'Stripe — handles payment if you subscribe. Your card details go directly to Stripe and never touch our servers. We receive only a customer reference and your subscription status.',
      'Supabase — hosts the database, authentication and file storage described above.',
    ],
  },
  {
    heading: 'Why this matters for sensitive data',
    body: [
      'Because up to five real values from each column are sent to Groq, you should not upload files containing personal health records, government identifiers, financial account numbers, credentials, or anything else you are not permitted to share with a third-party processor.',
      'If you need to analyse data like that, remove or mask the sensitive columns first. The statistical engine, data cleaning and quality checks all run entirely on our own servers, so a dataset with identifying columns stripped out still produces a full analysis.',
      'Each provider handles what it receives under its own terms: Groq (groq.com), Google (policies.google.com/privacy), Stripe (stripe.com/privacy) and Supabase (supabase.com/privacy).',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'Your analysis history is capped by plan: 5 analyses on the free plan, 15 on Pro. When you exceed the cap, the oldest analysis is deleted automatically along with its uploaded file and generated reports. This happens as part of running a new analysis — it is not something we do on request, and there is no hidden archive behind it.',
      'Deleting your account deletes your account record, your analyses, and every file stored for you.',
      'Operational logs and error records are kept for at most 30 days and are then deleted. Payment records held by Stripe are kept as long as tax and accounting law requires.',
    ],
  },
  {
    heading: 'Your rights',
    body: [
      'You can ask us to show you the data we hold about you, correct it, delete it, or send you a copy. Email dataset_insight_generator.ai@proton.me and we will respond within 30 days.',
      'You can delete your own analyses at any time from your dashboard, which removes the stored files with them.',
      'Because DIG is operated from Ontario, your personal information is handled under Canada’s federal Personal Information Protection and Electronic Documents Act (PIPEDA). Ontario has no separate private-sector privacy statute, so PIPEDA is the law that applies.',
      'If you are not satisfied with how a request was handled, you can complain to the Office of the Privacy Commissioner of Canada at priv.gc.ca. If you are outside Canada, you may also have rights under your own local law; contact us and we will do what it requires.',
    ],
  },
  {
    heading: 'Security',
    body: [
      'Traffic is encrypted in transit. Files are stored in a private bucket with per-user access rules enforced at the database level, and passwords are hashed rather than stored.',
      'No system is perfect, and we would rather say that than claim otherwise. If you find a security problem, email us and we will treat it as a priority.',
    ],
  },
  {
    heading: 'Children',
    body: [
      'DIG is not intended for children and we do not knowingly collect data from anyone under 16. If you believe a child has created an account, contact us and we will delete it.',
    ],
  },
  {
    heading: 'Changes to this policy',
    body: [
      'If we change how data is handled — particularly if we add a provider or send more data to an existing one — we will update this page and change the date at the top. Material changes will be announced by email to registered users.',
    ],
  },
];

const CLOSING =
  'This policy describes how the software actually behaves today, verified against the source code. It has not been reviewed by a lawyer — worth doing before taking paying customers.';

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro={INTRO}
      sections={SECTIONS}
      closing={CLOSING}
    />
  );
}
