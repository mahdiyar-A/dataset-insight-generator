/**
 * Everything the demo says about the sample file that sample.json does not.
 *
 * Each figure was worked out from the two files in public/demo
 * (coffee_sales.csv as uploaded, cleaned_coffee_sales.csv after cleaning), and
 * tests/demoTour.test.tsx works them out again from those files, so a figure
 * here cannot drift from the data it describes. Nothing is made up.
 */

export const FILE = {
  rows: 2360,
  cleanRows: 2336,
  columns: 8,
  firstDate: '2025-01-01',
  lastDate: '2025-12-31',
  stores: ['Downtown', 'Harbour', 'Midtown', 'University'],
  products: ['Cold brew', 'Croissant', 'Drip coffee', 'Latte', 'Sandwich'],
};

/** What the check found in the file as uploaded. */
export const CHECK = {
  repeatedRows: 24,
  blanks: { discount_pct: 23, satisfaction: 71 },
  belowZero: 6, // rows that sold fewer than zero items
};

/** Revenue per product, store, day and month, from the cleaned file. */
export const REVENUE = {
  total: 381667.1,
  byProduct: [
    { name: 'Sandwich', average: 265.88, total: 122040.59 },
    { name: 'Cold brew', average: 175.21, total: 80773.76 },
    { name: 'Latte', average: 160.25, total: 73556.51 },
    { name: 'Croissant', average: 127.23, total: 60944.67 },
    { name: 'Drip coffee', average: 92.79, total: 44351.57 },
  ],
  byStore: [
    { name: 'Downtown', average: 219.57, total: 124276.64 },
    { name: 'Harbour', average: 175.05, total: 104328.05 },
    { name: 'University', average: 142.79, total: 81817.97 },
    { name: 'Midtown', average: 118.54, total: 71244.44 },
  ],
  noDiscountShare: 80.4, // percent of rows with no discount
  perDay: { weekend: 1155.31, weekday: 1001.97 }, // average revenue of a day, all four shops
  bestMonth: { month: 12, total: 37006.95 },
  worstMonth: { month: 6, total: 26295.22 },
  prices: { Sandwich: 8.9, 'Drip coffee': 3.1 },
};

/** What DIG read each column as, shown when a column name is clicked. */
export const COLUMNS: Record<string, { kind: string; note: string }> = {
  date: { kind: 'Dates', note: `From ${FILE.firstDate} to ${FILE.lastDate}, so DIG can look for a trend over the year.` },
  store: { kind: 'Category', note: `${FILE.stores.length} stores: ${FILE.stores.join(', ')}.` },
  product: { kind: 'Category', note: `${FILE.products.length} products: ${FILE.products.join(', ')}.` },
  units_sold: { kind: 'Count', note: 'How many were sold in that row. DIG noticed a few rows below zero.' },
  unit_price: { kind: 'Money', note: 'The price of one item, from $3.10 to $8.90.' },
  discount_pct: { kind: 'Percent', note: `From 0 to 15%. ${CHECK.blanks.discount_pct} rows left it blank.` },
  revenue: { kind: 'Money', note: 'What the sale brought in. This is what the report explains.' },
  satisfaction: { kind: 'Rating', note: `A score from 2.7 to 5.0. ${CHECK.blanks.satisfaction} rows left it blank.` },
};

/**
 * Numbers in the report summary a visitor can click, each with what it means
 * in plain words. Every key must appear in sample.json's summary exactly.
 */
export const EVIDENCE: { text: string; plain: string }[] = [
  { text: '32%', plain: 'Sandwiches brought in $122,040.59 of the $381,667.10 the four shops took in over the year.' },
  { text: '$8.90', plain: 'A sandwich costs $8.90 in every shop. A drip coffee, the cheapest thing on the menu, is $3.10.' },
  { text: '$124,277', plain: 'Everything Downtown took in over the year: $124,276.64, rounded to the dollar.' },
  { text: '1.74 times', plain: 'Downtown’s $124,276.64 divided by Midtown’s $71,244.44.' },
  { text: '15% busier', plain: 'An average Saturday or Sunday brought in $1,155.31 across the four shops, an average weekday $1,001.97.' },
  { text: '$37,007', plain: 'December’s sales across the four shops came to $37,006.95, the best month of the year. June was the quietest, at $26,295.' },
];

/** What DIG says when clicked, between the lines of the tour. */
export const DIG_QUIPS = [
  'Hehe, that tickles!',
  `Fun fact: ${REVENUE.noDiscountShare}% of the sales had no discount at all.`,
  'Sandwiches are 1 in 5 rows, but bring in almost a third of the money.',
  'Downtown sells about 41 items a row. Midtown, about 22.',
  'I run on statistics, not coffee. Mostly.',
  'Every number I write is checked against the file. No guessing!',
];

/** The two plans, as the Plans page and the server enforce them. */
export const PLANS = {
  free: { name: 'Free', price: '$0', per: 'forever', analyses: '2 every 48 hours', window: { count: 2, hours: 48 }, kept: 5, questions: 10 },
  pro: { name: 'Pro', price: '$9.99', per: 'a month, CAD', analyses: 'Up to 20 a day', window: { count: 20, hours: 24 }, kept: 15, questions: 100 },
};

/** What each plan includes. `pro: true` rows are Pro only. */
export const PLAN_FEATURES: { name: string; pro: boolean; note?: string }[] = [
  { name: 'A full report written from your file', pro: false },
  { name: 'PDF report and the cleaned data', pro: false },
  { name: 'Edit the report, with versions and Undo', pro: false },
  { name: 'The chat suggests changes and next steps', pro: false },
  { name: 'Word and PowerPoint reports', pro: true },
  { name: 'Steer the report: focus, assumptions, your questions, language, tone', pro: true },
  { name: 'Edit together, live, as a team', pro: true, note: 'Up to 5 people, each on Pro' },
  { name: 'Priority support', pro: true },
];

/**
 * The example team in the Work together stop: made up, like the shops. The
 * roles and what each may do are the app's own (TeamRoles.cs, ReportAccess.cs).
 */
export const TEAM = [
  { id: 'you', name: 'You', face: 'You', role: 'Owner', color: '#2536E0', on: '#ffffff', away: '' },
  { id: 'sam', name: 'Sam', face: 'S', role: 'Editor', color: '#D6F24A', on: '#12121a', away: '' },
  { id: 'priya', name: 'Priya', face: 'P', role: 'Editor', color: '#E4572E', on: '#ffffff', away: '' },
  { id: 'leo', name: 'Leo', face: 'L', role: 'Viewer', color: '#7B5EA7', on: '#ffffff', away: '' },
  { id: 'ana', name: 'Ana', face: 'A', role: 'Editor', color: '#0F766E', on: '#ffffff', away: 'Away · seen 2 h ago' },
] as const;

export type TeammateId = (typeof TEAM)[number]['id'];

export const ROLES = [
  { role: 'Owner', can: 'Runs the team: invites people, changes their roles, removes them.' },
  { role: 'Editor', can: 'Edits the report, shares analyses with the team and invites people.' },
  { role: 'Viewer', can: 'Reads the report and comments on it.' },
];

/** The files from the sample run, all in public/demo. Sizes are checked by the tests. */
export const FILES = [
  { name: 'Report', ext: 'pdf', href: '/demo/sample_report.pdf', size: '224 KB', pro: false },
  { name: 'Report', ext: 'docx', href: '/demo/sample_report.docx', size: '201 KB', pro: true },
  { name: 'Report', ext: 'pptx', href: '/demo/sample_report.pptx', size: '223 KB', pro: true },
  { name: 'Cleaned data', ext: 'csv', href: '/demo/cleaned_coffee_sales.csv', size: '122 KB', pro: false },
  { name: 'Original file', ext: 'csv', href: '/demo/coffee_sales.csv', size: '118 KB', pro: false },
];

/** Who the visitor is, asked in the welcome, so DIG can say one line for them. */
export const PERSONAS = [
  { id: 'business', emoji: '🏪', label: 'I run a business', line: 'Then let’s find out what sells best, and where.' },
  { id: 'study', emoji: '🎓', label: 'I study or teach', line: 'Then I’ll show you the statistics behind every sentence.' },
  { id: 'data', emoji: '📊', label: 'I work with data', line: 'Then you’ll like this: every figure I write is checked against the file.' },
  { id: 'curious', emoji: '✨', label: 'Just curious', line: 'Curious is my favourite kind of person!' },
] as const;

export type PersonaId = (typeof PERSONAS)[number]['id'];
