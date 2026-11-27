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

/** A number with a fixed count of decimals, in the language's own digits. */
export const dec = (lang: Lang, n: number, d: number) =>
  n.toLocaleString(LOCALE[lang], { minimumFractionDigits: d, maximumFractionDigits: d });

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
 * first row of data). `flag` is the problem the check finds in that row, and
 * `fixed` what that cell is in cleaned_coffee_sales.csv: a blank rating takes
 * the column's typical value, and an impossible count is pulled back to the
 * edge of the normal range (ai_engine/core/cleaner.py). Of the two repeated
 * rows, the later one is removed.
 */
export const MESSY_COLUMNS = ['date', 'store', 'product', 'units_sold', 'satisfaction'] as const;
export const MESSY_ROWS: { row: number; flag?: 'blank' | 'neg' | 'dup'; cells: string[]; fixed?: string }[] = [
  { row: 4, cells: ['2025-01-01', 'Harbour', 'Sandwich', '42', '4.8'] },
  { row: 50, flag: 'blank', cells: ['2025-01-10', 'Midtown', 'Croissant', '27', ''], fixed: '4.3' },
  { row: 89, flag: 'neg', cells: ['2025-01-15', 'Midtown', 'Drip coffee', '-1', '4.1'], fixed: '6.9' },
  { row: 1628, flag: 'dup', cells: ['2025-09-11', 'Harbour', 'Croissant', '32', '4.3'] },
  { row: 2337, flag: 'dup', cells: ['2025-09-11', 'Harbour', 'Croissant', '32', '4.3'] },
];

export type Answer = { q: string; a: string; badge: string; kind: 'worked' | 'looked' | 'refused'; sum?: string };

const listOf = (lang: Lang, items: string[]) => {
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(lang === 'fa' ? '، ' : ', ');
  return `${rest} ${lang === 'en' ? 'and' : lang === 'fr' ? 'et' : 'و'} ${last}`;
};

const lift = Math.round((100 * REVENUE.perDay.weekend) / REVENUE.perDay.weekday - 100);
const ratio = (lang: Lang) => (REVENUE.perDay.weekend / REVENUE.perDay.weekday).toLocaleString(LOCALE[lang], { maximumFractionDigits: 2 });

function proofEn() {
  const l: Lang = 'en';
  return {
    eyebrow: 'SEE IT WORK',
    heading: 'From a messy file to one you can trust.',
    sub: 'A sample file: one year of sales at a made-up coffee chain, exactly as it was uploaded. Press a problem to find it, then let DIG clean it.',
    before: 'BEFORE',
    rows: `${num(l, FILE.rows)} rows`,
    problems: ['repeated rows', 'blank cells', 'below zero'],
    find: 'Press one to find it in the file',
    blank: 'blank',
    tableLabel: 'Five rows of coffee_sales.csv, four of them with a problem',
    after: 'AFTER',
    cleanedRows: `${num(l, FILE.cleanRows)} rows`,
    askFirst: 'DIG found three kinds of problem. It asks before it changes a thing.',
    clean: 'Yes, clean it',
    again: 'Show the file as it came',
    removed: `Removed: the same as row ${num(l, MESSY_ROWS[3].row)}`,
    filled: 'Filled with the typical rating',
    pulled: 'Pulled back into the normal range',
    done: ['repeats removed', 'blanks filled', 'impossible values fixed'],
    csv: 'Download the cleaned file',
    tryTitle: 'Don’t take DIG’s word for it. Press one.',
    answers: [
      {
        q: `Where does ${percent(l, SHARE)} come from?`,
        a: `Sandwiches brought in ${money(l, top.total, 2)} of the ${money(l, REVENUE.total, 2)} the four shops took in over the year.`,
        badge: 'Worked out from the file', kind: 'worked',
        sum: `${money(l, top.total, 2)} ÷ ${money(l, REVENUE.total, 2)} = ${percent(l, SHARE)}`,
      },
      {
        q: 'Are weekends really busier?',
        a: `Yes. On an average Saturday or Sunday the four shops took in ${money(l, REVENUE.perDay.weekend, 2)}, and on a weekday ${money(l, REVENUE.perDay.weekday, 2)}: ${percent(l, lift)} more.`,
        badge: 'Worked out from the file', kind: 'worked',
        sum: `${money(l, REVENUE.perDay.weekend, 2)} ÷ ${money(l, REVENUE.perDay.weekday, 2)} = ${ratio(l)}`,
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
    heading: 'D’un fichier en désordre à un fichier fiable.',
    sub: 'Un fichier d’exemple : un an de ventes d’une chaîne de cafés fictive, tel qu’il a été importé. Cliquez sur un problème pour le trouver, puis laissez DIG nettoyer.',
    before: 'AVANT',
    rows: `${num(l, FILE.rows)} lignes`,
    problems: ['lignes répétées', 'cellules vides', 'valeurs sous zéro'],
    find: 'Cliquez pour le trouver dans le fichier',
    blank: 'vide',
    tableLabel: 'Cinq lignes de coffee_sales.csv, dont quatre posent problème',
    after: 'APRÈS',
    cleanedRows: `${num(l, FILE.cleanRows)} lignes`,
    askFirst: 'DIG a trouvé trois sortes de problèmes. Il demande avant de toucher à quoi que ce soit.',
    clean: 'Oui, nettoyer',
    again: 'Revoir le fichier tel qu’il était',
    removed: `Supprimée : identique à la ligne ${num(l, MESSY_ROWS[3].row)}`,
    filled: 'Remplie avec la note habituelle',
    pulled: 'Ramenée dans la plage normale',
    done: ['répétitions supprimées', 'vides remplis', 'valeurs impossibles corrigées'],
    csv: 'Télécharger le fichier nettoyé',
    tryTitle: 'Ne croyez pas DIG sur parole. Cliquez.',
    answers: [
      {
        q: `D’où viennent ces ${percent(l, SHARE)} ?`,
        a: `Les sandwichs ont rapporté ${money(l, top.total, 2)} sur les ${money(l, REVENUE.total, 2)} encaissés par les quatre cafés dans l’année.`,
        badge: 'Calculé à partir du fichier', kind: 'worked',
        sum: `${money(l, top.total, 2)} ÷ ${money(l, REVENUE.total, 2)} = ${percent(l, SHARE)}`,
      },
      {
        q: 'Le week-end est-il vraiment plus actif ?',
        a: `Oui. Un samedi ou un dimanche moyen, les quatre cafés ont encaissé ${money(l, REVENUE.perDay.weekend, 2)}, et un jour de semaine ${money(l, REVENUE.perDay.weekday, 2)} : ${percent(l, lift)} de plus.`,
        badge: 'Calculé à partir du fichier', kind: 'worked',
        sum: `${money(l, REVENUE.perDay.weekend, 2)} ÷ ${money(l, REVENUE.perDay.weekday, 2)} = ${ratio(l)}`,
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
    heading: 'از یک فایل به‌هم‌ریخته تا فایلی که می‌شود به آن اعتماد کرد.',
    sub: 'یک فایل نمونه: فروش یک‌سالهٔ یک کافهٔ زنجیره‌ای فرضی، دقیقاً همان‌طور که آپلود شد. یک مشکل را بزنید تا پیدایش کنید، بعد بگذارید DIG پاکش کند.',
    before: 'قبل',
    rows: `${num(l, FILE.rows)} ردیف`,
    problems: ['ردیف تکراری', 'خانهٔ خالی', 'مقدار زیر صفر'],
    find: 'یکی را بزنید تا در فایل پیدایش کنید',
    blank: 'خالی',
    tableLabel: 'پنج ردیف از coffee_sales.csv که چهارتای آن‌ها مشکل دارند',
    after: 'بعد',
    cleanedRows: `${num(l, FILE.cleanRows)} ردیف`,
    askFirst: 'DIG سه نوع مشکل پیدا کرد. پیش از هر تغییری از شما می‌پرسد.',
    clean: 'بله، پاکش کن',
    again: 'نمایش فایل همان‌طور که بود',
    removed: `حذف شد: همانند ردیف ${num(l, MESSY_ROWS[3].row)}`,
    filled: 'با امتیاز معمول پر شد',
    pulled: 'به محدودهٔ عادی برگردانده شد',
    done: ['تکراری حذف شد', 'خانهٔ خالی پر شد', 'مقدار ناممکن اصلاح شد'],
    csv: 'دانلود فایل پاک‌شده',
    tryTitle: 'فقط به حرف DIG اعتماد نکنید. یکی را بزنید.',
    answers: [
      {
        q: `این ${percent(l, SHARE)} از کجا آمده؟`,
        a: `ساندویچ‌ها ${money(l, top.total, 2)} از ${money(l, REVENUE.total, 2)} فروش سال چهار شعبه را آورده‌اند.`,
        badge: 'محاسبه‌شده از فایل', kind: 'worked',
        sum: `${money(l, top.total, 2)} ÷ ${money(l, REVENUE.total, 2)} = ${percent(l, SHARE)}`,
      },
      {
        q: 'آیا آخر هفته‌ها واقعاً شلوغ‌ترند؟',
        a: `بله. در یک شنبه یا یکشنبهٔ معمولی چهار شعبه ${money(l, REVENUE.perDay.weekend, 2)} فروختند و در یک روز کاری ${money(l, REVENUE.perDay.weekday, 2)}؛ یعنی ${percent(l, lift)} بیشتر.`,
        badge: 'محاسبه‌شده از فایل', kind: 'worked',
        sum: `${money(l, REVENUE.perDay.weekend, 2)} ÷ ${money(l, REVENUE.perDay.weekday, 2)} = ${ratio(l)}`,
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
    note: 'Cancel Pro anytime.',
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
    note: 'Annulez Pro à tout moment.',
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
    note: 'هر وقت خواستید Pro را لغو کنید.',
  },
};

// ── Security ─────────────────────────────────────────────────────────────────

/**
 * Three promises, in a customer's words. Each is what the Privacy Policy says:
 * the AI gets a summary and a few example values, never the file; analyses are
 * private unless shared with a team; an analysis or the account can be deleted.
 * Nothing here may promise more than that policy does.
 */
export const TRUST: Record<Lang, {
  eyebrow: string; heading: string; sub: string; items: { title: string; body: string }[];
  note: string; policy: string;
}> = {
  en: {
    eyebrow: 'SECURITY',
    heading: 'Your data stays yours.',
    sub: 'Upload with confidence. You decide who sees your work, and for how long.',
    items: [
      { title: 'Your file stays with us', body: 'DIG cleans and analyses your file on its own servers. The AI gets a short summary and a few example values, never the whole file.' },
      { title: 'Private unless you share it', body: 'Only you, and the teammates you invite, can open your analyses.' },
      { title: 'Delete it anytime', body: 'Remove an analysis, or your whole account, whenever you like.' },
    ],
    note: 'Please don’t upload confidential or legally sensitive data.',
    policy: 'Read the Privacy Policy',
  },
  fr: {
    eyebrow: 'SÉCURITÉ',
    heading: 'Vos données restent les vôtres.',
    sub: 'Importez en toute confiance. Vous décidez qui voit votre travail, et pour combien de temps.',
    items: [
      { title: 'Votre fichier reste chez nous', body: 'DIG nettoie et analyse votre fichier sur ses propres serveurs. L’IA ne reçoit qu’un court résumé et quelques exemples de valeurs, jamais le fichier entier.' },
      { title: 'Privé, sauf si vous le partagez', body: 'Seuls vous et les coéquipiers que vous invitez pouvez ouvrir vos analyses.' },
      { title: 'Supprimez-le quand vous voulez', body: 'Effacez une analyse, ou votre compte entier, à tout moment.' },
    ],
    note: 'Merci de ne pas importer de données confidentielles ou juridiquement sensibles.',
    policy: 'Lire la politique de confidentialité',
  },
  fa: {
    eyebrow: 'امنیت',
    heading: 'داده‌های شما مال خودتان می‌ماند.',
    sub: 'با خیال راحت آپلود کنید. شما تصمیم می‌گیرید چه کسی کارتان را ببیند و تا کی.',
    items: [
      { title: 'فایل شما پیش ما می‌ماند', body: 'DIG فایل شما را روی سرورهای خودش پاک‌سازی و تحلیل می‌کند. هوش مصنوعی فقط یک خلاصهٔ کوتاه و چند مقدار نمونه می‌بیند، هرگز کل فایل را.' },
      { title: 'خصوصی، مگر اینکه به اشتراک بگذارید', body: 'فقط شما و هم‌تیمی‌هایی که دعوت می‌کنید می‌توانید تحلیل‌هایتان را باز کنید.' },
      { title: 'هر وقت خواستید پاکش کنید', body: 'یک تحلیل یا کل حسابتان را هر زمان که بخواهید حذف کنید.' },
    ],
    note: 'لطفاً داده‌های محرمانه یا حساس از نظر قانونی آپلود نکنید.',
    policy: 'خواندن سیاست حریم خصوصی',
  },
};

// ── Questions ────────────────────────────────────────────────────────────────

export const FAQ: Record<Lang, { eyebrow: string; heading: string; sub: string; items: { q: string; a: string }[] }> = {
  en: {
    eyebrow: 'FAQ',
    heading: 'Questions, answered.',
    sub: 'Anything else? Write to us.',
    items: [
      { q: 'What files can I upload?', a: 'CSV, Excel, JSON, Parquet, SPSS, Stata, SAS and other common data files, up to 50 MB each.' },
      { q: 'Do I need to know statistics or code?', a: 'No. DIG writes the report in plain words for whoever will read it. The exact statistics wait on a last page, for anyone who wants them.' },
      { q: 'Is the free plan really free?', a: `Yes, and no card is needed. You get ${PLANS.free.window.count} analyses every ${PLANS.free.window.hours} hours, the full report as a PDF, and ${PLANS.free.questions} questions a day about your results.` },
      { q: 'Does the AI see my file?', a: 'Not the file itself. DIG works on your file on its own servers, and the AI gets a short summary of your columns and a few example values. The Privacy Policy lists exactly what.' },
      { q: 'Can my team work on a report together?', a: 'Yes, on Pro. Up to 5 people, each on Pro, can edit the same report, leave comments, and see each other’s changes as they save.' },
      { q: 'Which languages can reports be written in?', a: `On Pro, any of ${REPORT_LANGUAGES.en.length}: ${listOf('en', REPORT_LANGUAGES.en)}.` },
      { q: 'Can I cancel Pro?', a: 'Yes, anytime, from your account.' },
    ],
  },
  fr: {
    eyebrow: 'FAQ',
    heading: 'Vos questions, nos réponses.',
    sub: 'Autre chose ? Écrivez-nous.',
    items: [
      { q: 'Quels fichiers puis-je importer ?', a: 'CSV, Excel, JSON, Parquet, SPSS, Stata, SAS et d’autres fichiers de données courants, jusqu’à 50 Mo chacun.' },
      { q: 'Faut-il connaître les statistiques ou le code ?', a: 'Non. DIG rédige le rapport en mots simples pour la personne qui le lira. Les statistiques exactes attendent sur une dernière page, pour qui les veut.' },
      { q: 'Le forfait gratuit est-il vraiment gratuit ?', a: `Oui, et aucune carte n’est requise. Vous avez ${PLANS.free.window.count} analyses toutes les ${PLANS.free.window.hours} heures, le rapport complet en PDF et ${PLANS.free.questions} questions par jour sur vos résultats.` },
      { q: 'L’IA voit-elle mon fichier ?', a: 'Pas le fichier lui-même. DIG traite votre fichier sur ses propres serveurs, et l’IA reçoit un court résumé de vos colonnes et quelques exemples de valeurs. La politique de confidentialité en donne le détail.' },
      { q: 'Mon équipe peut-elle travailler sur un rapport ensemble ?', a: 'Oui, avec Pro. Jusqu’à 5 personnes, chacune avec Pro, peuvent modifier le même rapport, laisser des commentaires et voir les changements des autres dès qu’ils sont enregistrés.' },
      { q: 'Dans quelles langues les rapports peuvent-ils être rédigés ?', a: `Avec Pro, dans ${REPORT_LANGUAGES.fr.length} langues : ${listOf('fr', REPORT_LANGUAGES.fr)}.` },
      { q: 'Puis-je annuler Pro ?', a: 'Oui, à tout moment, depuis votre compte.' },
    ],
  },
  fa: {
    eyebrow: 'پرسش‌ها',
    heading: 'پرسش‌های شما، پاسخ‌های ما.',
    sub: 'سؤال دیگری دارید؟ برایمان بنویسید.',
    items: [
      { q: 'چه فایل‌هایی می‌توانم آپلود کنم؟', a: 'CSV، اکسل، JSON، Parquet، SPSS، Stata، SAS و دیگر فایل‌های رایج داده، هر کدام تا ۵۰ مگابایت.' },
      { q: 'باید آمار یا برنامه‌نویسی بلد باشم؟', a: 'نه. DIG گزارش را به زبان ساده برای کسی که آن را می‌خواند می‌نویسد. آمار دقیق در صفحهٔ آخر می‌ماند، برای هر کسی که بخواهد.' },
      { q: 'طرح رایگان واقعاً رایگان است؟', a: `بله، و نیازی به کارت بانکی نیست. ${num('fa', PLANS.free.window.count)} تحلیل در هر ${num('fa', PLANS.free.window.hours)} ساعت، گزارش کامل به‌صورت PDF و ${num('fa', PLANS.free.questions)} پرسش در روز دربارهٔ نتایج می‌گیرید.` },
      { q: 'هوش مصنوعی فایل من را می‌بیند؟', a: 'خود فایل را نه. DIG فایل شما را روی سرورهای خودش پردازش می‌کند و هوش مصنوعی فقط خلاصه‌ای کوتاه از ستون‌ها و چند مقدار نمونه می‌گیرد. جزئیات در سیاست حریم خصوصی آمده است.' },
      { q: 'تیم من می‌تواند با هم روی یک گزارش کار کند؟', a: `بله، با Pro. تا ${num('fa', 5)} نفر، هر کدام با Pro، می‌توانند یک گزارش را ویرایش کنند، یادداشت بگذارند و تغییرات هم را به محض ذخیره ببینند.` },
      { q: 'گزارش به چه زبان‌هایی نوشته می‌شود؟', a: `با Pro، به ${num('fa', REPORT_LANGUAGES.fa.length)} زبان: ${listOf('fa', REPORT_LANGUAGES.fa)}.` },
      { q: 'می‌توانم Pro را لغو کنم؟', a: 'بله، هر زمان، از حساب کاربری‌تان.' },
    ],
  },
};

// ── The founder ──────────────────────────────────────────────────────────────

// Name, role and school only: nothing about where the founder lives. The quote
// speaks for the owner: they approved the first one on 2026-11-26 and on
// 2026-11-27 asked for it to say that DIG is AI, which this one does. Change it
// only with their say-so.
export const FOUNDER: Record<Lang, {
  eyebrow: string; heading: string; quote: string;
  name: string; role: string; school: string; linkedin: string;
}> = {
  en: {
    eyebrow: 'WHY I BUILT DIG',
    heading: 'An AI analyst for everyone.',
    quote: 'Hiring an analyst costs a fortune, and a chatbot will happily make numbers up. So I built an AI analyst that does neither. It reads every row, checks every number, writes for whoever is reading and works alongside your whole team. Everyone, from a café owner to a CEO, deserves one. That’s DIG.',
    name: 'Mahdiyar Ashrafioun',
    role: 'Founder and developer',
    school: 'Computer Science student, University of Calgary',
    linkedin: 'Connect on LinkedIn',
  },
  fr: {
    eyebrow: 'POURQUOI J’AI CRÉÉ DIG',
    heading: 'Un analyste IA pour tout le monde.',
    quote: 'Un analyste coûte une fortune, et un chatbot invente volontiers des chiffres. Alors j’ai créé un analyste IA qui ne fait ni l’un ni l’autre. Il lit chaque ligne, vérifie chaque chiffre, écrit pour celui qui lit et travaille avec toute votre équipe. Tout le monde, du patron de café au PDG, mérite le sien. C’est DIG.',
    name: 'Mahdiyar Ashrafioun',
    role: 'Fondateur et développeur',
    school: 'Étudiant en informatique, Université de Calgary',
    linkedin: 'Me retrouver sur LinkedIn',
  },
  fa: {
    eyebrow: 'چرا DIG را ساختم',
    heading: 'یک تحلیلگر هوش مصنوعی برای همه.',
    quote: 'استخدام یک تحلیلگر هزینهٔ زیادی دارد و یک چت‌بات به‌راحتی عدد می‌سازد. پس یک تحلیلگر هوش مصنوعی ساختم که هیچ‌کدام از این‌ها نیست. تک‌تک ردیف‌ها را می‌خواند، هر عدد را بررسی می‌کند، برای هر کسی که گزارش را می‌خواند می‌نویسد و کنار کل تیم شما کار می‌کند. همه، از صاحب یک کافه تا مدیرعامل، سزاوار یکی هستند. این DIG است.',
    name: 'مهدیار اشرفیون',
    role: 'بنیان‌گذار و توسعه‌دهنده',
    school: 'دانشجوی علوم کامپیوتر، دانشگاه کالگاری',
    linkedin: 'در لینکدین',
  },
};

// ── The last word, and the footer ────────────────────────────────────────────

export const CLOSING: Record<Lang, { heading: string; sub: string; demo: string; register: string; ask: string; write: string }> = {
  en: {
    heading: 'See what your data is saying.',
    sub: 'Try the demo in a minute, or create a free account and use your own file.',
    demo: 'Open the demo', register: 'Create a free account',
    ask: 'Questions?', write: 'Email us',
  },
  fr: {
    heading: 'Découvrez ce que disent vos données.',
    sub: 'Essayez la démo en une minute, ou créez un compte gratuit pour utiliser votre propre fichier.',
    demo: 'Ouvrir la démo', register: 'Créer un compte gratuit',
    ask: 'Des questions ?', write: 'Écrivez-nous',
  },
  fa: {
    heading: 'ببینید داده‌هایتان چه می‌گویند.',
    sub: 'دمو را در یک دقیقه امتحان کنید، یا یک حساب رایگان بسازید و فایل خودتان را بدهید.',
    demo: 'باز کردن دمو', register: 'ساخت حساب رایگان',
    ask: 'سؤالی دارید؟', write: 'به ما ایمیل بزنید',
  },
};

/** DIG's company page and its founder's, both on LinkedIn. */
export const LINKEDIN = {
  dig: 'https://www.linkedin.com/company/144091416/',
  founder: 'https://www.linkedin.com/in/mahdiyar-ashrafioun/',
};

export const CONTACT_EMAIL = 'support@datainsightgen.com';

export const FOOTER: Record<Lang, {
  tagline: string; product: string; uses: string; company: string; legal: string;
  demo: string; features: string; pricing: string; faq: string; contact: string;
  digOn: string; founded: string; founder: string; rights: string;
}> = {
  en: {
    tagline: 'Turn a spreadsheet into a report people actually read.',
    product: 'Product', uses: 'Use cases', company: 'Company', legal: 'Legal',
    demo: 'Demo', features: 'Features', pricing: 'Pricing', faq: 'FAQ', contact: 'Contact',
    digOn: 'DIG on LinkedIn', founded: 'Founded by', founder: 'Mahdiyar Ashrafioun',
    rights: '© 2026 Dataset Insight Generator',
  },
  fr: {
    tagline: 'Transformez un tableur en un rapport qu’on lit vraiment.',
    product: 'Produit', uses: 'Cas d’usage', company: 'Entreprise', legal: 'Juridique',
    demo: 'Démo', features: 'Fonctionnalités', pricing: 'Tarifs', faq: 'FAQ', contact: 'Contact',
    digOn: 'DIG sur LinkedIn', founded: 'Fondé par', founder: 'Mahdiyar Ashrafioun',
    rights: '© 2026 Dataset Insight Generator',
  },
  fa: {
    tagline: 'یک صفحه‌گسترده را به گزارشی تبدیل کنید که واقعاً خوانده می‌شود.',
    product: 'محصول', uses: 'کاربردها', company: 'شرکت', legal: 'حقوقی',
    demo: 'دمو', features: 'ویژگی‌ها', pricing: 'قیمت‌ها', faq: 'پرسش‌ها', contact: 'تماس',
    digOn: 'DIG در لینکدین', founded: 'بنیان‌گذار:', founder: 'مهدیار اشرفیون',
    rights: '© ۲۰۲۶ Dataset Insight Generator',
  },
};
