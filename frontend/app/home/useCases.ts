import { PLANS } from '../demo/demoFacts';
import { MAX_UPLOAD_BYTES } from '@/lib/uploadFormats';

/**
 * One page per file problem people search for, each answering that search in
 * full rather than sending everyone to the homepage. English only: these are
 * written for English searches.
 *
 * Every claim is something DIG does today. tests/useCasePages.test.tsx checks
 * the ones that could drift against the code itself: the file types against
 * the upload list, the size limit, the SPSS labels and the duplicate rule
 * against the AI service, and the prices against demoFacts.
 */

export interface UseCase {
  path: string;
  /** The link text in the footer and in "Other files". */
  short: string;
  eyebrow: string;
  /** The page title in search results, complete (no site suffix added). */
  title: string;
  description: string;
  h1: string;
  lead: string;
  /** File types shown under the title. Each must be in UPLOAD_EXTENSIONS. */
  exts: string[];
  pain: { heading: string; body: string };
  does: { title: string; body: string }[];
  steps: { title: string; body: string }[];
  limits: string[];
  faq: { q: string; a: string }[];
}

export const UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

const free = PLANS.free;
const pro = PLANS.pro;

/** The same plain answer on every page, built from the plan facts. */
export const IS_IT_FREE =
  `Yes, to start. The Free plan gives you ${free.window.count} analyses every ${free.window.hours} hours, `
  + `with a PDF report and the cleaned data, and no card is needed. `
  + `Pro is ${pro.price} ${pro.per} and adds Word and PowerPoint reports.`;

export const FREE_LINE =
  `Free plan: ${free.window.count} analyses every ${free.window.hours} hours. No card needed.`;

const steps = (upload: string) => [
  { title: 'Create a free account', body: 'No card is needed.' },
  { title: 'Upload your file', body: upload },
  { title: 'Say what the data is', body: 'DIG asks in one line, so it reads your columns the right way.' },
  { title: 'Read, ask, download', body: 'Read the findings, ask follow-up questions, then download the report and the cleaned data.' },
];

const spss: UseCase = {
  path: '/analyze-spss-file-without-spss',
  short: 'SPSS files, without SPSS',
  eyebrow: 'SPSS FILES',
  title: 'Analyze an SPSS (.sav) File Without SPSS | DIG',
  description:
    'Open and analyze an SPSS .sav file without an SPSS licence. DIG keeps your answer labels, '
    + 'cleans the data and writes a report with charts. Free to start.',
  h1: 'Analyze an SPSS file without SPSS.',
  lead:
    'Got a .sav file and no SPSS licence? Upload it to DIG. It opens the file, keeps your answer '
    + 'labels, cleans what needs cleaning and writes a report with charts you can download.',
  exts: ['.sav', '.zsav'],
  pain: {
    heading: 'A .sav file opens in one program.',
    body:
      'SPSS saves data in its own format, so a survey export or a file from a colleague often '
      + 'cannot be read without a licence. Convert it by hand and the labels that say what each '
      + 'code means are easy to lose, and then a column of 1s to 5s tells you nothing.',
  },
  does: [
    { title: 'Opens .sav and .zsav', body: 'No SPSS and no plug-in. DIG reads the file directly, compressed .zsav files included.' },
    { title: 'Keeps your answer labels', body: 'Answers show as “Strongly agree”, not “5”, in the report, the charts and the chat.' },
    { title: 'Cleans before it counts', body: 'DIG checks for repeated rows, blank cells and extreme values, asks before it cleans, and lists every change.' },
    { title: 'Writes the report', body: 'Findings in plain words, each with the number it rests on, and charts to match.' },
  ],
  steps: steps(`Drop in the .sav file, up to ${UPLOAD_MB} MB.`),
  limits: [
    'DIG reads the data in the file. It does not run SPSS syntax (.sps) or open output (.spv) files.',
    `Files can be up to ${UPLOAD_MB} MB. For a bigger one, save a copy with just the variables you need.`,
    'Stata (.dta) and SAS (.sas7bdat, .xpt) files work the same way.',
  ],
  faq: [
    { q: 'Do I need SPSS installed?', a: 'No. DIG opens the .sav file itself, and there is nothing to install.' },
    { q: 'Will my value labels survive?', a: 'Yes. DIG applies the labels stored in the file, so a code like 5 shows as the answer it stands for.' },
    { q: 'Can I get the data back as a spreadsheet?', a: 'Yes. Every analysis comes with the cleaned data as a CSV file, which opens in Excel or Google Sheets.' },
    { q: 'Is it free?', a: IS_IT_FREE },
  ],
};

const parquet: UseCase = {
  path: '/parquet-to-pdf-powerpoint',
  short: 'Parquet to PDF or PowerPoint',
  eyebrow: 'PARQUET FILES',
  title: 'Turn a Parquet File into a PDF or PowerPoint Report | DIG',
  description:
    'Upload a Parquet file and get a written report with charts, as a PDF, Word or PowerPoint file. '
    + 'No code and no notebook. Free to start.',
  h1: 'Turn a Parquet file into a PDF or PowerPoint report.',
  lead:
    'Parquet is great for storing data and hard to share, because nobody can double-click it. '
    + 'Upload it to DIG and get back a written report with charts that anyone can open.',
  exts: ['.parquet', '.pq', '.feather', '.arrow', '.orc'],
  pain: {
    heading: 'The data is there. Nobody can open it.',
    body:
      'Parquet files come out of pipelines, warehouses and notebooks. Sharing what is inside '
      + 'usually means writing code, making charts and pasting them into slides by hand. '
      + 'DIG does that part for you.',
  },
  does: [
    { title: 'Opens Parquet as it is', body: 'DIG reads the file with its column types intact, so dates stay dates and numbers stay numbers.' },
    { title: 'Finds what is worth saying', body: 'It looks for the patterns that matter and says how strong each one is, with the number it rests on.' },
    { title: 'Written for the reader', body: 'DIG works out who the report is for. A manager gets plain words, and the statistics wait on a last page.' },
    { title: 'PDF, Word or PowerPoint', body: 'PDF on every plan. Word and PowerPoint on Pro, with the charts already on the slides.' },
  ],
  steps: steps(`Drop in the .parquet file, up to ${UPLOAD_MB} MB.`),
  limits: [
    `Files can be up to ${UPLOAD_MB} MB. For a bigger table, export the rows or columns you want to report on.`,
    'Feather, Arrow and ORC files work the same way, and so do CSV and Excel.',
  ],
  faq: [
    { q: 'Do I need to write any code?', a: 'No. Upload the file, answer one question about what it is, and read the report.' },
    { q: 'Can I edit the report before I send it?', a: 'Yes. Hide or move findings, rename the report and undo any change. On Pro, a team can edit it together, live.' },
    { q: 'Which files do I get?', a: 'A PDF report on every plan, plus the cleaned data as a CSV. Word and PowerPoint come with Pro.' },
    { q: 'Is it free?', a: IS_IT_FREE },
  ],
};

const duplicates: UseCase = {
  path: '/remove-duplicate-survey-rows',
  short: 'Duplicate survey rows',
  eyebrow: 'SURVEY DATA',
  title: 'Remove Duplicate Survey Rows from a CSV Automatically | DIG',
  description:
    'Find and remove repeated rows in a survey CSV or Excel export automatically, then get the '
    + 'clean file back with a report on the answers. Free to start.',
  h1: 'Remove duplicate survey rows, automatically.',
  lead:
    'Double submissions and merged exports put the same answer in your file twice, and every count '
    + 'after that is off. DIG finds the repeated rows, asks before it cleans, and gives you the clean file back.',
  exts: ['.csv', '.xlsx', '.sav'],
  pain: {
    heading: 'One repeated row changes every percentage.',
    body:
      'Someone clicks Submit twice, or two exports get pasted together, and the same person is '
      + 'counted twice. Finding those rows by hand in a spreadsheet is slow, and it is easy to miss one.',
  },
  does: [
    { title: 'Finds exact repeats', body: 'A row that matches another in every column is a repeat. DIG counts them and removes the extra copies.' },
    { title: 'Looks past stray spaces', body: 'Spaces around text are trimmed before rows are compared, so “Yes” and “Yes ” count as the same answer.' },
    { title: 'Asks before it cleans', body: 'DIG shows what it found and cleans when you say so. Blank rows, gaps and extreme values are fixed in the same pass.' },
    { title: 'Hands back the clean file', body: 'Download the cleaned data as a CSV, on every plan, with a report on what the answers say.' },
  ],
  steps: steps(`Drop in the CSV or Excel export, up to ${UPLOAD_MB} MB. SPSS exports work too.`),
  limits: [
    'Only exact repeats are removed. If two rows differ in any column, such as a timestamp or a response ID, both are kept.',
    'Exports from survey tools such as Google Forms, Typeform or Qualtrics work, saved as CSV, Excel or SPSS.',
  ],
  faq: [
    { q: 'What counts as a duplicate?', a: 'Two rows that are the same in every column, once spaces around text are trimmed.' },
    { q: 'Could two different people be merged?', a: 'Only if every column matches. If your export has a response ID, two different people are never merged.' },
    { q: 'Can I get the cleaned CSV?', a: 'Yes, on every plan, Free included.' },
    { q: 'Is it free?', a: IS_IT_FREE },
  ],
};

export const USE_CASES = { spss, parquet, duplicates };

/** In the order the footer lists them. */
export const USE_CASE_LIST: UseCase[] = [spss, parquet, duplicates];
