/**
 * The words of the app window under the title, in the site's three languages.
 *
 * The window is the sample run, so everything in it is the sample's: the five
 * findings and their charts are sample.json's report, and the questions are
 * three of its saved answers. Figures come from demoFacts (worked out from the
 * sample files, and checked by the tests) or, where demoFacts has none, from
 * the sample report's own sentences, which the tests compare.
 *
 * None of these questions is asked again further down the page: the proof
 * section has its own.
 */

import sample from '../demo/sample.json';
import { FILE, REVENUE } from '../demo/demoFacts';
import { dec, money, num, percent, SHARE } from './homeCopy';
import type { Lang } from './homeCopy';

export type HeroAnswer = { q: string; a: string; badge: string; kind: 'looked' | 'analysis' };
export type HeroFinding = { title: string; figure: string; caption: string; chart: string };

const [store, quietest] = [REVENUE.byStore[0], REVENUE.byStore[REVENUE.byStore.length - 1]];
/** Downtown against Midtown, as the report puts it: "1.74 times Midtown". */
export const STORE_RATIO = store.total / quietest.total;
/** How much busier an average weekend day is than a weekday, in percent. */
export const WEEKEND_LIFT = Math.round((100 * REVENUE.perDay.weekend) / REVENUE.perDay.weekday - 100);
/** Items sold a row with a discount and without one (the report's finding 4). */
export const DISCOUNT_ITEMS = { with: 35, without: 30 };
/** Average rating with a discount and without one (the saved answer on discounts). */
export const RATING = { with: 4.17, without: 4.3 };

/** The charts of the five findings, in the report's order. */
export const CHARTS = sample.report.insights.map(i => i.chart.src);

const saved = (q: string) => sample.answers.find(a => a.q === q)!;
const STORE_Q = 'Which store made the most revenue, and how much was it?';
const DISCOUNT_Q = 'Did discounts make customers less satisfied?';
const TOTAL_Q = 'What was the total revenue for the whole period?';

export const HERO: Record<Lang, {
  label: string; ready: string; tabs: string[]; findingOf: (n: number) => string; prev: string; next: string;
  findings: HeroFinding[]; ask: string; tryAsking: string; placeholder: string; send: string; thinking: string;
  offline: string; answers: HeroAnswer[];
  rows: string; cleanRows: string; dataNote: string;
  dots: { min: string; chatOff: string; chatOn: string; big: string; small: string };
  minimised: string; reopen: string;
  files: string; pdf: string; docx: string; pptx: string; csv: string; pro: string;
}> = {
  en: {
    label: 'A DIG report on the sample file. Press the tabs, the findings and the questions.',
    ready: 'Report ready',
    tabs: ['Report', 'Charts', 'Data'],
    findingOf: n => `FINDING ${n} OF 5`,
    prev: 'Previous finding', next: 'Next finding',
    findings: [
      { title: sample.report.insights[0].title, figure: percent('en', SHARE), caption: 'of the year’s sales came from sandwiches', chart: 'Sales by product, 2025' },
      { title: sample.report.insights[1].title, figure: money('en', store.total), caption: `taken at Downtown, ${dec('en', STORE_RATIO, 2)} times Midtown`, chart: 'Sales by shop, 2025' },
      { title: sample.report.insights[2].title, figure: percent('en', WEEKEND_LIFT), caption: 'more money on an average weekend day than on a weekday', chart: 'Sales on an average day' },
      { title: sample.report.insights[3].title, figure: num('en', DISCOUNT_ITEMS.with), caption: `items sold on average with a discount, ${DISCOUNT_ITEMS.without} without. The money barely moved.`, chart: 'Items sold, with and without a discount' },
      { title: sample.report.insights[4].title, figure: money('en', REVENUE.bestMonth.total), caption: 'in December, the best month of the year', chart: 'Sales by month, 2025' },
    ],
    ask: 'ASK DIG', tryAsking: 'Try asking', placeholder: 'Ask about your data…', send: 'Send', thinking: 'DIG is reading the file…',
    offline: 'This preview answers the three questions above. Open the demo, or sign up free and ask anything about your own file.',
    answers: [
      { q: STORE_Q, a: saved(STORE_Q).a, badge: 'Looked up in the file', kind: 'looked' },
      { q: DISCOUNT_Q, a: saved(DISCOUNT_Q).a, badge: 'From the analysis', kind: 'analysis' },
      { q: TOTAL_Q, a: saved(TOTAL_Q).a, badge: 'Looked up in the file', kind: 'looked' },
    ],
    rows: `${num('en', FILE.rows)} rows · ${FILE.columns} columns`,
    cleanRows: `${num('en', FILE.cleanRows)} rows after cleaning`,
    dataNote: 'The first rows of the file, as uploaded.',
    dots: { min: 'Minimise', chatOff: 'Hide the chat', chatOn: 'Show the chat', big: 'Make it bigger', small: 'Make it smaller' },
    minimised: 'The report is tucked away.', reopen: 'Open it again',
    files: 'Download the sample', pdf: 'PDF report', docx: 'Word report', pptx: 'PowerPoint deck', csv: 'Cleaned data (CSV)', pro: 'Pro',
  },
  fr: {
    label: 'Un rapport DIG sur le fichier d’exemple. Cliquez sur les onglets, les constats et les questions.',
    ready: 'Rapport prêt',
    tabs: ['Rapport', 'Graphiques', 'Données'],
    findingOf: n => `CONSTAT ${num('fr', n)} SUR 5`,
    prev: 'Constat précédent', next: 'Constat suivant',
    findings: [
      { title: 'Les sandwichs rapportent un tiers de l’argent', figure: percent('fr', SHARE), caption: 'des ventes de l’année viennent des sandwichs', chart: 'Ventes par produit, 2025' },
      { title: 'Downtown est votre café le plus actif', figure: money('fr', store.total), caption: `encaissés à Downtown, ${dec('fr', STORE_RATIO, 2)} fois Midtown`, chart: 'Ventes par café, 2025' },
      { title: `Le week-end est ${percent('fr', WEEKEND_LIFT)} plus actif`, figure: percent('fr', WEEKEND_LIFT), caption: 'de ventes en plus un jour de week-end moyen qu’en semaine', chart: 'Ventes un jour moyen' },
      { title: 'Les remises font vendre plus d’articles, pas plus d’argent', figure: num('fr', DISCOUNT_ITEMS.with), caption: `articles vendus en moyenne avec une remise, ${DISCOUNT_ITEMS.without} sans. L’argent a à peine bougé.`, chart: 'Articles vendus, avec et sans remise' },
      { title: 'Une année stable, avec une belle fin', figure: money('fr', REVENUE.bestMonth.total), caption: 'en décembre, le meilleur mois de l’année', chart: 'Ventes par mois, 2025' },
    ],
    ask: 'DEMANDEZ À DIG', tryAsking: 'Essayez', placeholder: 'Posez une question sur vos données…', send: 'Envoyer', thinking: 'DIG lit le fichier…',
    offline: 'Cet aperçu répond aux trois questions ci-dessus. Ouvrez la démo, ou inscrivez-vous gratuitement et demandez ce que vous voulez sur votre propre fichier.',
    answers: [
      { q: 'Quel café a réalisé le plus de ventes, et combien ?', a: `Downtown a réalisé le plus de ventes, avec un total de ${money('fr', store.total, 2)}.`, badge: 'Trouvé dans le fichier', kind: 'looked' },
      { q: 'Les remises ont-elles rendu les clients moins satisfaits ?', a: `Un peu. Les clients qui ont eu une remise ont noté leur visite ${dec('fr', RATING.with, 2)} sur 5 en moyenne, contre ${dec('fr', RATING.without, 2)} pour les autres. L’écart est faible, et il ne montre pas que la remise en est la cause.`, badge: 'Tiré de l’analyse', kind: 'analysis' },
      { q: 'Quel a été le chiffre d’affaires total sur toute la période ?', a: `Le chiffre d’affaires total sur toute la période est de ${money('fr', REVENUE.total, 2)}.`, badge: 'Trouvé dans le fichier', kind: 'looked' },
    ],
    rows: `${num('fr', FILE.rows)} lignes · ${FILE.columns} colonnes`,
    cleanRows: `${num('fr', FILE.cleanRows)} lignes après nettoyage`,
    dataNote: 'Les premières lignes du fichier, tel qu’importé.',
    dots: { min: 'Réduire', chatOff: 'Masquer le chat', chatOn: 'Afficher le chat', big: 'Agrandir', small: 'Rétrécir' },
    minimised: 'Le rapport est rangé.', reopen: 'Le rouvrir',
    files: 'Télécharger l’exemple', pdf: 'Rapport PDF', docx: 'Rapport Word', pptx: 'Présentation PowerPoint', csv: 'Données nettoyées (CSV)', pro: 'Pro',
  },
  fa: {
    label: 'گزارش DIG روی فایل نمونه. زبانه‌ها، یافته‌ها و پرسش‌ها را بزنید.',
    ready: 'گزارش آماده است',
    tabs: ['گزارش', 'نمودارها', 'داده‌ها'],
    findingOf: n => `یافتهٔ ${num('fa', n)} از ۵`,
    prev: 'یافتهٔ قبلی', next: 'یافتهٔ بعدی',
    findings: [
      { title: 'یک‌سوم پول از ساندویچ می‌آید', figure: percent('fa', SHARE), caption: 'از فروش سال از ساندویچ بوده است', chart: 'فروش هر محصول، ۲۰۲۵' },
      { title: 'Downtown پرفروش‌ترین شعبهٔ شماست', figure: money('fa', store.total), caption: `فروش شعبهٔ Downtown، ${dec('fa', STORE_RATIO, 2)} برابر Midtown`, chart: 'فروش هر شعبه، ۲۰۲۵' },
      { title: `آخر هفته‌ها ${percent('fa', WEEKEND_LIFT)} شلوغ‌ترند`, figure: percent('fa', WEEKEND_LIFT), caption: 'فروش بیشتر در یک روز آخر هفتهٔ معمولی نسبت به یک روز کاری', chart: 'فروش در یک روز معمولی' },
      { title: 'تخفیف کالای بیشتری می‌فروشد، نه پول بیشتر', figure: num('fa', DISCOUNT_ITEMS.with), caption: `کالا به‌طور میانگین با تخفیف فروخته شد و ${num('fa', DISCOUNT_ITEMS.without)} بدون آن. پول تقریباً تغییری نکرد.`, chart: 'کالای فروخته‌شده، با و بدون تخفیف' },
      { title: 'سالی پایدار با پایانی قوی', figure: money('fa', REVENUE.bestMonth.total), caption: 'در دسامبر، بهترین ماه سال', chart: 'فروش هر ماه، ۲۰۲۵' },
    ],
    ask: 'از DIG بپرسید', tryAsking: 'امتحان کنید', placeholder: 'دربارهٔ داده‌هایتان بپرسید…', send: 'ارسال', thinking: 'DIG در حال خواندن فایل است…',
    offline: 'این پیش‌نمایش به سه پرسش بالا پاسخ می‌دهد. دمو را باز کنید، یا رایگان ثبت‌نام کنید و هر چه خواستید دربارهٔ فایل خودتان بپرسید.',
    answers: [
      { q: 'کدام شعبه بیشترین فروش را داشت و چقدر بود؟', a: `شعبهٔ Downtown بیشترین فروش را داشت، با مجموع ${money('fa', store.total, 2)}.`, badge: 'پیداشده در فایل', kind: 'looked' },
      { q: 'آیا تخفیف مشتری‌ها را کمتر راضی کرد؟', a: `کمی. مشتری‌هایی که تخفیف گرفتند به‌طور میانگین ${dec('fa', RATING.with, 2)} از ۵ به بازدیدشان دادند، در برابر ${dec('fa', RATING.without, 2)} برای بقیه. این فاصله کوچک است و نشان نمی‌دهد که علتش تخفیف بوده.`, badge: 'از تحلیل', kind: 'analysis' },
      { q: 'کل فروش در تمام دوره چقدر بود؟', a: `کل فروش در تمام دوره ${money('fa', REVENUE.total, 2)} بود.`, badge: 'پیداشده در فایل', kind: 'looked' },
    ],
    rows: `${num('fa', FILE.rows)} ردیف · ${num('fa', FILE.columns)} ستون`,
    cleanRows: `${num('fa', FILE.cleanRows)} ردیف پس از پاک‌سازی`,
    dataNote: 'نخستین ردیف‌های فایل، همان‌طور که آپلود شد.',
    dots: { min: 'کوچک کردن', chatOff: 'پنهان کردن چت', chatOn: 'نمایش چت', big: 'بزرگ‌تر', small: 'کوچک‌تر' },
    minimised: 'گزارش کنار گذاشته شد.', reopen: 'دوباره باز کنید',
    files: 'دانلود نمونه', pdf: 'گزارش PDF', docx: 'گزارش Word', pptx: 'ارائهٔ PowerPoint', csv: 'دادهٔ پاک‌شده (CSV)', pro: 'Pro',
  },
};

/** The question each saved answer was, in English, for the tests. */
export const HERO_SAVED_QUESTIONS = [STORE_Q, DISCOUNT_Q, TOTAL_Q];
