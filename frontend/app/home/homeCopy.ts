/**
 * The words of the landing page's proof, files and pricing sections, in the
 * site's three languages.
 *
 * No figure is typed here. Each comes from app/demo/demoFacts.ts, which the
 * tests check against the sample files and the Plans page, so a sentence on
 * the landing page cannot drift from the product.
 */

import { CHECK, FILE, PLANS, REVENUE } from '../demo/demoFacts';

export type Lang = 'en' | 'fr' | 'fa';

const LOCALE: Record<Lang, string> = { en: 'en-US', fr: 'fr-CA', fa: 'fa-IR' };

/** A count, in the language's own digits. */
export const num = (lang: Lang, n: number) => n.toLocaleString(LOCALE[lang]);

/** Money, written the way the language writes it. */
export function money(lang: Lang, n: number, decimals = 0) {
  const figure = n.toLocaleString(LOCALE[lang], { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return lang === 'en' ? `$${figure}` : lang === 'fr' ? `${figure} $` : `${figure} دلار`;
}

export const BLANKS = CHECK.blanks.discount_pct + CHECK.blanks.satisfaction;

const top = REVENUE.byProduct[0];
/** Sandwiches' share of the year's money, in percent. The report says it too. */
export const SHARE = Math.round((100 * top.total) / REVENUE.total);

export const percent = (lang: Lang, n: number) =>
  lang === 'en' ? `${n}%` : lang === 'fr' ? `${num(lang, n)} %` : `${num(lang, n)}٪`;

/** The languages a report can be written in (ai_engine/llm/harness.py). */
export const REPORT_LANGUAGES: Record<Lang, string[]> = {
  en: ['English', 'French', 'Spanish', 'German', 'Chinese', 'Arabic', 'Portuguese', 'Persian'],
  fr: ['anglais', 'français', 'espagnol', 'allemand', 'chinois', 'arabe', 'portugais', 'persan'],
  fa: ['انگلیسی', 'فرانسوی', 'اسپانیایی', 'آلمانی', 'چینی', 'عربی', 'پرتغالی', 'فارسی'],
};

/**
 * Five rows of coffee_sales.csv as uploaded, numbered as in the file (1 is the
 * first row of data). `flag` is the problem the check finds in that row.
 */
export const MESSY_COLUMNS = ['date', 'store', 'product', 'units_sold', 'satisfaction'] as const;
export const MESSY_ROWS: { row: number; flag?: 'blank' | 'neg' | 'dup'; cells: string[] }[] = [
  { row: 4, cells: ['2025-01-01', 'Harbour', 'Sandwich', '42', '4.8'] },
  { row: 50, flag: 'blank', cells: ['2025-01-10', 'Midtown', 'Croissant', '27', ''] },
  { row: 89, flag: 'neg', cells: ['2025-01-15', 'Midtown', 'Drip coffee', '-1', '4.1'] },
  { row: 1628, flag: 'dup', cells: ['2025-09-11', 'Harbour', 'Croissant', '32', '4.3'] },
  { row: 2337, flag: 'dup', cells: ['2025-09-11', 'Harbour', 'Croissant', '32', '4.3'] },
];

export type Answer = { q: string; a: string; badge: string; kind: 'worked' | 'looked' | 'refused' };

const listOf = (lang: Lang, items: string[]) => {
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(lang === 'fa' ? '، ' : ', ');
  return `${rest} ${lang === 'en' ? 'and' : lang === 'fr' ? 'et' : 'و'} ${last}`;
};

function proofEn() {
  const l: Lang = 'en';
  return {
    eyebrow: 'SEE IT WORK',
    heading: 'From messy rows to a clear answer.',
    sub: 'A sample file: one year of sales at a made-up coffee chain. Every figure below is worked out from that file.',
    before: 'BEFORE',
    rows: `${num(l, FILE.rows)} rows`,
    problems: ['repeated rows', 'blank cells', 'below zero'],
    blank: 'blank',
    tableLabel: 'Five rows of coffee_sales.csv, four of them with a problem',
    after: 'AFTER',
    afterNote: 'The report, finding 1',
    finding: 'Sandwiches bring in a third of the money',
    share: 'of the year’s sales came from sandwiches',
    shareHint: 'Where does this number come from?',
    chartTitle: 'Sales by product, 2025',
    tryTitle: 'Don’t take DIG’s word for it. Press one.',
    answers: [
      {
        q: `Where does ${percent(l, SHARE)} come from?`,
        a: `Sandwiches brought in ${money(l, top.total, 2)} of the ${money(l, REVENUE.total, 2)} the four shops took in over the year.`,
        badge: 'Worked out from the file', kind: 'worked',
      },
      {
        q: 'Which store made the most revenue, and how much was it?',
        a: `Downtown store made the most revenue, with a total of ${money(l, REVENUE.byStore[0].total, 2)}.`,
        badge: 'Looked up in the file', kind: 'looked',
      },
      {
        q: 'What is the capital of France?',
        a: 'I can only help with questions about this retail dataset and its report.',
        badge: 'Outside the data · declined', kind: 'refused',
      },
    ] as Answer[],
    cta: 'Try all of it in the demo',
  };
}

type ProofCopy = ReturnType<typeof proofEn>;

function proofFr(): ProofCopy {
  const l: Lang = 'fr';
  return {
    eyebrow: 'VOYEZ PAR VOUS-MÊME',
    heading: 'De lignes en désordre à une réponse claire.',
    sub: 'Un fichier d’exemple : un an de ventes d’une chaîne de cafés fictive. Chaque chiffre ci-dessous est calculé à partir de ce fichier.',
    before: 'AVANT',
    rows: `${num(l, FILE.rows)} lignes`,
    problems: ['lignes répétées', 'cellules vides', 'valeurs sous zéro'],
    blank: 'vide',
    tableLabel: 'Cinq lignes de coffee_sales.csv, dont quatre posent problème',
    after: 'APRÈS',
    afterNote: 'Le rapport, constat 1',
    finding: 'Les sandwichs rapportent un tiers de l’argent',
    share: 'des ventes de l’année viennent des sandwichs',
    shareHint: 'D’où vient ce chiffre ?',
    chartTitle: 'Ventes par produit, 2025',
    tryTitle: 'Ne croyez pas DIG sur parole. Cliquez.',
    answers: [
      {
        q: `D’où viennent ces ${percent(l, SHARE)} ?`,
        a: `Les sandwichs ont rapporté ${money(l, top.total, 2)} sur les ${money(l, REVENUE.total, 2)} encaissés par les quatre cafés dans l’année.`,
        badge: 'Calculé à partir du fichier', kind: 'worked',
      },
      {
        q: 'Quel café a réalisé le plus de ventes, et combien ?',
        a: `Downtown a réalisé le plus de ventes, avec un total de ${money(l, REVENUE.byStore[0].total, 2)}.`,
        badge: 'Trouvé dans le fichier', kind: 'looked',
      },
      {
        q: 'Quelle est la capitale de la France ?',
        a: 'Je ne peux répondre qu’aux questions sur ces données de vente et leur rapport.',
        badge: 'Hors des données · refusé', kind: 'refused',
      },
    ],
    cta: 'Tout essayer dans la démo',
  };
}

function proofFa(): ProofCopy {
  const l: Lang = 'fa';
  return {
    eyebrow: 'خودتان ببینید',
    heading: 'از ردیف‌های به‌هم‌ریخته تا یک پاسخ روشن.',
    sub: 'یک فایل نمونه: فروش یک‌سالهٔ یک کافهٔ زنجیره‌ای فرضی. همهٔ عددهای زیر از همین فایل محاسبه شده‌اند.',
    before: 'قبل',
    rows: `${num(l, FILE.rows)} ردیف`,
    problems: ['ردیف تکراری', 'خانهٔ خالی', 'مقدار زیر صفر'],
    blank: 'خالی',
    tableLabel: 'پنج ردیف از coffee_sales.csv که چهارتای آن‌ها مشکل دارند',
    after: 'بعد',
    afterNote: 'گزارش، یافتهٔ ۱',
    finding: 'یک‌سوم پول از ساندویچ می‌آید',
    share: 'از فروش سال از ساندویچ بوده است',
    shareHint: 'این عدد از کجا آمده؟',
    chartTitle: 'فروش هر محصول، ۲۰۲۵',
    tryTitle: 'فقط به حرف DIG اعتماد نکنید. یکی را بزنید.',
    answers: [
      {
        q: `این ${percent(l, SHARE)} از کجا آمده؟`,
        a: `ساندویچ‌ها ${money(l, top.total, 2)} از ${money(l, REVENUE.total, 2)} فروش سال چهار شعبه را آورده‌اند.`,
        badge: 'محاسبه‌شده از فایل', kind: 'worked',
      },
      {
        q: 'کدام شعبه بیشترین فروش را داشت و چقدر بود؟',
        a: `شعبهٔ Downtown بیشترین فروش را داشت، با مجموع ${money(l, REVENUE.byStore[0].total, 2)}.`,
        badge: 'پیداشده در فایل', kind: 'looked',
      },
      {
        q: 'پایتخت فرانسه کجاست؟',
        a: 'فقط می‌توانم به پرسش‌های مربوط به این داده‌های فروش و گزارش آن پاسخ دهم.',
        badge: 'خارج از داده‌ها · رد شد', kind: 'refused',
      },
    ],
    cta: 'همه را در دمو امتحان کنید',
  };
}

export const PROOF: Record<Lang, ProofCopy> = { en: proofEn(), fr: proofFr(), fa: proofFa() };

// ── The files ────────────────────────────────────────────────────────────────

export const FILES_COPY: Record<Lang, {
  eyebrow: string; heading: string; sub: string; every: string; pro: string; alt: string;
  pdf: string; pdfNote: string; docx: string; docxNote: string; pptx: string; pptxNote: string;
  open: string; download: string; csv: string; csvLink: string; kb: string;
}> = {
  en: {
    eyebrow: 'TAKE IT WITH YOU',
    heading: 'A finished report, ready to hand over.',
    sub: 'Pages from the sample report. Open one and look around.',
    every: 'Every plan', pro: 'Pro', alt: 'A page of the sample report',
    pdf: 'PDF', pdfNote: 'Ready to send or print.',
    docx: 'Word', docxNote: 'Change anything in Word.',
    pptx: 'PowerPoint', pptxNote: 'Ready to present.',
    open: 'Open the PDF', download: 'Download',
    csv: 'And the cleaned data as a CSV, on every plan.', csvLink: 'Download the sample CSV', kb: 'KB',
  },
  fr: {
    eyebrow: 'EMPORTEZ-LE',
    heading: 'Un rapport terminé, prêt à remettre.',
    sub: 'Des pages du rapport d’exemple (en anglais). Ouvrez-en une et regardez.',
    every: 'Tous les forfaits', pro: 'Pro', alt: 'Une page du rapport d’exemple',
    pdf: 'PDF', pdfNote: 'Prêt à envoyer ou à imprimer.',
    docx: 'Word', docxNote: 'Modifiez tout dans Word.',
    pptx: 'PowerPoint', pptxNote: 'Prêt à présenter.',
    open: 'Ouvrir le PDF', download: 'Télécharger',
    csv: 'Et les données nettoyées en CSV, avec tous les forfaits.', csvLink: 'Télécharger le CSV d’exemple', kb: 'Ko',
  },
  fa: {
    eyebrow: 'با خودتان ببرید',
    heading: 'یک گزارش کامل، آمادهٔ تحویل.',
    sub: 'صفحه‌هایی از گزارش نمونه (به انگلیسی). یکی را باز کنید و ببینید.',
    every: 'همهٔ طرح‌ها', pro: 'Pro', alt: 'یک صفحه از گزارش نمونه',
    pdf: 'PDF', pdfNote: 'آمادهٔ ارسال یا چاپ.',
    docx: 'Word', docxNote: 'همه‌چیز را در Word تغییر دهید.',
    pptx: 'PowerPoint', pptxNote: 'آمادهٔ ارائه.',
    open: 'باز کردن PDF', download: 'دانلود',
    csv: 'و داده‌های پاک‌شده به‌صورت CSV، در همهٔ طرح‌ها.', csvLink: 'دانلود CSV نمونه', kb: 'کیلوبایت',
  },
};

// ── The plans ────────────────────────────────────────────────────────────────

type PlanCopy = { name: string; price: string; per: string; lead: string; items: string[]; cta: string };

const price = Number(PLANS.pro.price.replace('$', ''));

export const PRICING: Record<Lang, {
  heading: string; sub: string; free: PlanCopy; pro: PlanCopy; note: string;
}> = {
  en: {
    heading: 'Start free. Go Pro when you need more.',
    sub: 'Free gives you the full report on your own file. No card needed.',
    free: {
      name: 'Free', price: '$0', per: 'forever', lead: 'You get:',
      items: [
        `${PLANS.free.window.count} analyses every ${PLANS.free.window.hours} hours`,
        `${PLANS.free.kept} analyses kept`,
        `${PLANS.free.questions} questions a day about your results`,
        'The full written report, as a PDF',
        'The cleaned data as a CSV',
        'Edit the report, with versions and Undo',
      ],
      cta: 'Create a free account',
    },
    pro: {
      name: 'Pro', price: money('en', price, 2), per: 'a month, CAD', lead: 'Everything in Free, and:',
      items: [
        `Up to ${PLANS.pro.window.count} analyses a day`,
        `${PLANS.pro.kept} analyses kept`,
        `${PLANS.pro.questions} questions a day`,
        'Word and PowerPoint reports',
        'Steer the report: its focus, tone, look and your own questions',
        `Reports in ${REPORT_LANGUAGES.en.length} languages: ${listOf('en', REPORT_LANGUAGES.en)}`,
        'Edit the report as a team: up to 5 people, each on Pro',
        'Priority support',
      ],
      cta: 'Start free, upgrade anytime',
    },
    note: 'Payments go through Stripe. We never store your card details. Cancel anytime.',
  },
  fr: {
    heading: 'Commencez gratuitement. Passez à Pro au besoin.',
    sub: 'Le forfait gratuit donne le rapport complet sur votre propre fichier. Aucune carte requise.',
    free: {
      name: 'Gratuit', price: '0 $', per: 'pour toujours', lead: 'Vous obtenez :',
      items: [
        `${PLANS.free.window.count} analyses toutes les ${PLANS.free.window.hours} heures`,
        `${PLANS.free.kept} analyses conservées`,
        `${PLANS.free.questions} questions par jour sur vos résultats`,
        'Le rapport complet, en PDF',
        'Les données nettoyées en CSV',
        'Le rapport modifiable, avec versions et annulation',
      ],
      cta: 'Créer un compte gratuit',
    },
    pro: {
      name: 'Pro', price: money('fr', price, 2), per: 'par mois, CAD', lead: 'Tout le forfait gratuit, et :',
      items: [
        `Jusqu’à ${PLANS.pro.window.count} analyses par jour`,
        `${PLANS.pro.kept} analyses conservées`,
        `${PLANS.pro.questions} questions par jour`,
        'Rapports Word et PowerPoint',
        'Orientez le rapport : sujet, ton, style et vos propres questions',
        `Rapports en ${REPORT_LANGUAGES.fr.length} langues : ${listOf('fr', REPORT_LANGUAGES.fr)}`,
        'Modifiez le rapport en équipe : jusqu’à 5 personnes, chacune avec Pro',
        'Assistance prioritaire',
      ],
      cta: 'Commencer gratuitement',
    },
    note: 'Les paiements passent par Stripe. Nous ne conservons jamais les données de votre carte. Annulez à tout moment.',
  },
  fa: {
    heading: 'رایگان شروع کنید. وقتی بیشتر خواستید، Pro بگیرید.',
    sub: 'طرح رایگان گزارش کامل را روی فایل خودتان می‌دهد. نیازی به کارت بانکی نیست.',
    free: {
      name: 'رایگان', price: '۰ دلار', per: 'برای همیشه', lead: 'شامل:',
      items: [
        `${num('fa', PLANS.free.window.count)} تحلیل در هر ${num('fa', PLANS.free.window.hours)} ساعت`,
        `نگهداری ${num('fa', PLANS.free.kept)} تحلیل`,
        `${num('fa', PLANS.free.questions)} پرسش در روز دربارهٔ نتایج`,
        'گزارش کامل به‌صورت PDF',
        'داده‌های پاک‌شده به‌صورت CSV',
        'ویرایش گزارش، با نسخه‌ها و امکان بازگشت',
      ],
      cta: 'ساخت حساب رایگان',
    },
    pro: {
      name: 'Pro', price: money('fa', price, 2), per: 'کانادا، در ماه', lead: 'همهٔ امکانات رایگان، و:',
      items: [
        `تا ${num('fa', PLANS.pro.window.count)} تحلیل در روز`,
        `نگهداری ${num('fa', PLANS.pro.kept)} تحلیل`,
        `${num('fa', PLANS.pro.questions)} پرسش در روز`,
        'گزارش Word و PowerPoint',
        'هدایت گزارش: موضوع، لحن، ظاهر و پرسش‌های خودتان',
        `گزارش به ${num('fa', REPORT_LANGUAGES.fa.length)} زبان: ${listOf('fa', REPORT_LANGUAGES.fa)}`,
        `ویرایش گروهی گزارش: تا ${num('fa', 5)} نفر، هر کدام با Pro`,
        'پشتیبانی اولویت‌دار',
      ],
      cta: 'رایگان شروع کنید',
    },
    note: 'پرداخت‌ها از طریق Stripe انجام می‌شود. اطلاعات کارت شما را هرگز نگه نمی‌داریم. هر زمان خواستید لغو کنید.',
  },
};
