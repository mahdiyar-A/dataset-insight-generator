/**
 * "Chatbots talk. DIG delivers.": five things DIG does that a chatbot does not,
 * each with a small scene the visitor can press.
 *
 * The Features section above says what the analysis does (clean, read the
 * columns, find, chart, explain). This one says how working with DIG differs
 * from asking a chatbot, so the two never say the same thing.
 *
 * No product is named. Each claim is the app's own: reader-aware writing and
 * steering on Pro (the demo's What stop), answers added to the report with a
 * version and Undo (the demo's chat and drafts), teams of up to five with
 * Owner, Editor and Viewer (TeamRoles.cs, demoFacts.ROLES), every figure
 * checked against the file (llm/guard.py, insight_agent._grounded_figures),
 * and the report languages (harness.py LANGUAGE_NAMES). Figures come from
 * demoFacts. The three readers' versions of one finding are marked as an
 * example, since the sample report was written once.
 */

import { REVENUE } from '../demo/demoFacts';
import { HERO, STORE_RATIO } from './heroCopy';
import { REPORT_LANGUAGES, dec, money } from './homeCopy';
import type { Lang } from './homeCopy';

const busiest = REVENUE.byStore[0];
const quietest = REVENUE.byStore[REVENUE.byStore.length - 1];

export type Power = { tab: string; title: string; body: string; pro?: string };
export type Person = { id: 'you' | 'sam' | 'priya' | 'leo'; name: string; role: string; can: string };

/** Finding 1's title in each report language, in REPORT_LANGUAGES order. */
export const TITLE_IN: { text: string; dir: 'ltr' | 'rtl' }[] = [
  { text: 'Sandwiches bring in a third of the money', dir: 'ltr' },
  { text: 'Les sandwichs rapportent un tiers de l’argent', dir: 'ltr' },
  { text: 'Los sándwiches aportan un tercio del dinero', dir: 'ltr' },
  { text: 'Sandwiches bringen ein Drittel des Geldes ein', dir: 'ltr' },
  { text: '三明治带来了三分之一的收入', dir: 'ltr' },
  { text: 'الساندويتشات تجلب ثلث المال', dir: 'rtl' },
  { text: 'Os sanduíches trazem um terço do dinheiro', dir: 'ltr' },
  { text: 'یک‌سوم پول از ساندویچ می‌آید', dir: 'rtl' },
];

export const VERSUS: Record<Lang, {
  eyebrow: string; heading: string; sub: string; example: string; powers: Power[];
  readers: { who: string; text: string }[]; readersNote: string;
  chat: { ask: string; answer: string; offer: string; add: string; added: string; version: (n: number) => string; undo: string; finding: string };
  team: { people: Person[]; editing: string; comment: string; reply: string; pick: string };
  proof: { before: string; n1: string; mid: string; n2: string; after: string; hint: string; check1: string; check2: string; ok: string };
  langs: { names: string[]; note: string };
}> = {
  en: {
    eyebrow: 'THE DIFFERENCE',
    heading: 'Chatbots talk. DIG delivers.',
    sub: 'A chatbot hands you a reply. DIG hands you an analyst: one that bends to how you work, keeps the conversation going, brings your team in and proves every number. Press each one.',
    example: 'Example',
    powers: [
      { tab: 'Bends to you', title: 'It works the way you want.', body: 'Tell DIG who’s reading and what matters, and the whole report reshapes itself: its words, its depth, its tone. The same finding reads one way for a café owner and another for a board.', pro: 'On Pro, set the focus, assumptions, your own questions, language and tone before it starts.' },
      { tab: 'Keeps talking', title: 'A conversation that never ends.', body: 'Your report is never frozen. Ask a question, ask for a change, change your mind. DIG answers from your file, offers to add what it found, and saves every version, so Undo is one press away.' },
      { tab: 'Brings your team', title: 'Your whole team, one live report.', body: 'Invite your team and work on the same report at the same time. Everyone sees edits as they happen, leaves comments and asks DIG together, with roles that keep the right people in charge.', pro: 'Up to five people on Pro.' },
      { tab: 'Proves its numbers', title: 'Every number, checked.', body: 'A chatbot can hand you a confident number it made up. DIG works each figure out from your file and checks it again before it reaches you. Press a number and see.' },
      { tab: 'Speaks their language', title: 'Written in your reader’s language.', body: 'Choose a language and the whole report is written in it: English, French, Spanish, German, Chinese, Arabic, Portuguese or Persian.', pro: 'Reports in 8 languages on Pro.' },
    ],
    readers: [
      { who: 'Café owner', text: `Downtown is your busiest shop by far. It took ${money('en', busiest.total)} this year, nearly twice what Midtown took.` },
      { who: 'Board', text: `Downtown brings in a third of revenue (${money('en', busiest.total)}), ${dec('en', STORE_RATIO, 2)} times Midtown. Prices are the same everywhere, so the gap is how much people buy.` },
      { who: 'Researcher', text: `Revenue differs by store: Downtown ${money('en', busiest.total, 2)} against Midtown ${money('en', quietest.total, 2)}, a ratio of ${dec('en', STORE_RATIO, 2)}. Unit prices are identical across stores, so the difference comes from units sold.` },
    ],
    readersNote: 'One finding, written for three readers',
    chat: {
      ask: HERO.en.answers[1].q, answer: HERO.en.answers[1].a,
      offer: 'Add this to the report?', add: 'Add it', added: 'Added under finding 4',
      version: n => `Version ${n} saved`, undo: 'Undo', finding: HERO.en.findings[3].title,
    },
    team: {
      people: [
        { id: 'you', name: 'You', role: 'Owner', can: 'Runs the team: invites people, changes their roles, removes them.' },
        { id: 'sam', name: 'Sam', role: 'Editor', can: 'Edits the report, shares analyses with the team and invites people.' },
        { id: 'priya', name: 'Priya', role: 'Editor', can: 'Edits the report, shares analyses with the team and invites people.' },
        { id: 'leo', name: 'Leo', role: 'Viewer', can: 'Reads the report and comments on it.' },
      ],
      editing: 'Sam is editing finding 2',
      comment: 'Is Downtown ahead at weekends too?',
      reply: 'Good question. Let’s ask DIG in the chat.',
      pick: 'Press a person to see what they can do.',
    },
    proof: {
      before: 'Downtown took ', n1: money('en', busiest.total), mid: ' this year, ', n2: `${dec('en', STORE_RATIO, 2)} times`, after: ' Midtown.',
      hint: 'Press a number.',
      check1: `Added up from every Downtown sale in the file: ${money('en', busiest.total, 2)}`,
      check2: `${money('en', busiest.total, 2)} ÷ ${money('en', quietest.total, 2)} = ${dec('en', STORE_RATIO, 2)}`,
      ok: 'Checked against the file',
    },
    langs: { names: REPORT_LANGUAGES.en, note: 'Finding 1, in each language' },
  },
  fr: {
    eyebrow: 'LA DIFFÉRENCE',
    heading: 'Les chatbots parlent. DIG livre.',
    sub: 'Un chatbot vous donne une réponse. DIG vous donne un analyste : il s’adapte à votre façon de travailler, continue la conversation, fait entrer votre équipe et prouve chaque chiffre. Cliquez sur chacun.',
    example: 'Exemple',
    powers: [
      { tab: 'S’adapte à vous', title: 'Il travaille comme vous le voulez.', body: 'Dites à DIG qui va lire et ce qui compte : tout le rapport se transforme, ses mots, sa profondeur, son ton. Le même constat ne se lit pas pareil pour un patron de café et pour un conseil d’administration.', pro: 'Avec Pro, fixez l’objectif, les hypothèses, vos propres questions, la langue et le ton avant qu’il commence.' },
      { tab: 'Continue la conversation', title: 'Une conversation qui ne s’arrête jamais.', body: 'Votre rapport n’est jamais figé. Posez une question, demandez un changement, changez d’avis. DIG répond à partir de votre fichier, propose d’ajouter ce qu’il a trouvé et garde chaque version : Annuler est toujours à un clic.' },
      { tab: 'Fait entrer l’équipe', title: 'Toute votre équipe, un seul rapport en direct.', body: 'Invitez votre équipe et travaillez sur le même rapport en même temps. Chacun voit les modifications en direct, laisse des commentaires et interroge DIG, avec des rôles qui laissent les bonnes personnes aux commandes.', pro: 'Jusqu’à cinq personnes avec Pro.' },
      { tab: 'Prouve ses chiffres', title: 'Chaque chiffre, vérifié.', body: 'Un chatbot peut vous donner avec aplomb un chiffre inventé. DIG calcule chaque chiffre à partir de votre fichier et le vérifie encore avant de vous le montrer. Cliquez sur un chiffre pour voir.' },
      { tab: 'Parle leur langue', title: 'Écrit dans la langue de votre lecteur.', body: 'Choisissez une langue et tout le rapport est écrit dedans : anglais, français, espagnol, allemand, chinois, arabe, portugais ou persan.', pro: 'Rapports en 8 langues avec Pro.' },
    ],
    readers: [
      { who: 'Patron de café', text: `Downtown est de loin votre café le plus actif. Il a encaissé ${money('fr', busiest.total)} cette année, presque deux fois Midtown.` },
      { who: 'Conseil', text: `Downtown apporte un tiers du chiffre d’affaires (${money('fr', busiest.total)}), ${dec('fr', STORE_RATIO, 2)} fois Midtown. Les prix sont partout les mêmes : l’écart vient de la quantité achetée.` },
      { who: 'Chercheur', text: `Le chiffre d’affaires varie selon le café : Downtown ${money('fr', busiest.total, 2)} contre Midtown ${money('fr', quietest.total, 2)}, un rapport de ${dec('fr', STORE_RATIO, 2)}. Les prix unitaires sont identiques partout, donc l’écart vient des quantités vendues.` },
    ],
    readersNote: 'Un constat, écrit pour trois lecteurs',
    chat: {
      ask: HERO.fr.answers[1].q, answer: HERO.fr.answers[1].a,
      offer: 'L’ajouter au rapport ?', add: 'Ajouter', added: 'Ajouté sous le constat 4',
      version: n => `Version ${n} enregistrée`, undo: 'Annuler', finding: HERO.fr.findings[3].title,
    },
    team: {
      people: [
        { id: 'you', name: 'Vous', role: 'Propriétaire', can: 'Dirige l’équipe : invite des personnes, change leurs rôles, les retire.' },
        { id: 'sam', name: 'Sam', role: 'Éditeur', can: 'Modifie le rapport, partage des analyses avec l’équipe et invite des personnes.' },
        { id: 'priya', name: 'Priya', role: 'Éditrice', can: 'Modifie le rapport, partage des analyses avec l’équipe et invite des personnes.' },
        { id: 'leo', name: 'Leo', role: 'Lecteur', can: 'Lit le rapport et le commente.' },
      ],
      editing: 'Sam modifie le constat 2',
      comment: 'Downtown est-il aussi devant le week-end ?',
      reply: 'Bonne question. Demandons à DIG dans le chat.',
      pick: 'Cliquez sur quelqu’un pour voir ce qu’il peut faire.',
    },
    proof: {
      before: 'Downtown a encaissé ', n1: money('fr', busiest.total), mid: ' cette année, ', n2: `${dec('fr', STORE_RATIO, 2)} fois`, after: ' Midtown.',
      hint: 'Cliquez sur un chiffre.',
      check1: `Additionné à partir de chaque vente de Downtown dans le fichier : ${money('fr', busiest.total, 2)}`,
      check2: `${money('fr', busiest.total, 2)} ÷ ${money('fr', quietest.total, 2)} = ${dec('fr', STORE_RATIO, 2)}`,
      ok: 'Vérifié dans le fichier',
    },
    langs: { names: REPORT_LANGUAGES.fr, note: 'Le constat 1, dans chaque langue' },
  },
  fa: {
    eyebrow: 'تفاوت',
    heading: 'چت‌بات‌ها حرف می‌زنند. DIG تحویل می‌دهد.',
    sub: 'یک چت‌بات به شما یک جواب می‌دهد. DIG به شما یک تحلیلگر می‌دهد: با روش کار شما جور می‌شود، گفت‌وگو را ادامه می‌دهد، تیمتان را وارد کار می‌کند و هر عدد را ثابت می‌کند. هر کدام را بزنید.',
    example: 'نمونه',
    powers: [
      { tab: 'با شما جور می‌شود', title: 'همان‌طور که می‌خواهید کار می‌کند.', body: 'به DIG بگویید چه کسی گزارش را می‌خواند و چه چیزی مهم است؛ کل گزارش تغییر می‌کند: واژه‌ها، عمق و لحنش. یک یافته برای صاحب یک کافه یک‌جور خوانده می‌شود و برای هیئت‌مدیره جور دیگر.', pro: 'با Pro، پیش از شروع، تمرکز، فرض‌ها، پرسش‌های خودتان، زبان و لحن را تعیین کنید.' },
      { tab: 'گفت‌وگو ادامه دارد', title: 'گفت‌وگویی که تمام نمی‌شود.', body: 'گزارش شما هیچ‌وقت ثابت نمی‌ماند. سؤال بپرسید، تغییر بخواهید، نظرتان را عوض کنید. DIG از فایل شما جواب می‌دهد، پیشنهاد می‌کند یافته‌اش را به گزارش اضافه کند و هر نسخه را نگه می‌دارد، پس برگرداندن همیشه یک کلیک فاصله دارد.' },
      { tab: 'تیمتان را می‌آورد', title: 'کل تیم، یک گزارش زنده.', body: 'تیمتان را دعوت کنید و هم‌زمان روی یک گزارش کار کنید. همه تغییرها را همان لحظه می‌بینند، نظر می‌گذارند و با هم از DIG می‌پرسند، با نقش‌هایی که هر کس را در جای درستش نگه می‌دارد.', pro: 'تا پنج نفر با Pro.' },
      { tab: 'عددهایش را ثابت می‌کند', title: 'هر عدد، بررسی‌شده.', body: 'یک چت‌بات ممکن است با اطمینان عددی ساختگی به شما بدهد. DIG هر عدد را از فایل شما محاسبه می‌کند و پیش از رسیدن به شما دوباره بررسی‌اش می‌کند. یک عدد را بزنید و ببینید.' },
      { tab: 'به زبان آن‌ها حرف می‌زند', title: 'به زبان خوانندهٔ شما نوشته می‌شود.', body: 'زبان را انتخاب کنید تا کل گزارش به همان زبان نوشته شود: انگلیسی، فرانسوی، اسپانیایی، آلمانی، چینی، عربی، پرتغالی یا فارسی.', pro: 'گزارش به ۸ زبان با Pro.' },
    ],
    readers: [
      { who: 'صاحب کافه', text: `Downtown با فاصلهٔ زیاد پرفروش‌ترین شعبهٔ شماست. امسال ${money('fa', busiest.total)} فروخت، تقریباً دو برابر Midtown.` },
      { who: 'هیئت‌مدیره', text: `Downtown یک‌سوم درآمد را می‌آورد (${money('fa', busiest.total)})، ${dec('fa', STORE_RATIO, 2)} برابر Midtown. قیمت‌ها همه‌جا یکی است، پس فاصله از میزان خرید مردم است.` },
      { who: 'پژوهشگر', text: `درآمد بسته به شعبه فرق می‌کند: Downtown ${money('fa', busiest.total, 2)} در برابر Midtown ${money('fa', quietest.total, 2)}، با نسبت ${dec('fa', STORE_RATIO, 2)}. قیمت واحد در همهٔ شعبه‌ها یکسان است، پس تفاوت از تعداد فروش می‌آید.` },
    ],
    readersNote: 'یک یافته، برای سه خواننده',
    chat: {
      ask: HERO.fa.answers[1].q, answer: HERO.fa.answers[1].a,
      offer: 'به گزارش اضافه شود؟', add: 'اضافه کن', added: 'زیر یافتهٔ ۴ اضافه شد',
      version: n => `نسخهٔ ${n.toLocaleString('fa-IR')} ذخیره شد`, undo: 'برگرداندن', finding: HERO.fa.findings[3].title,
    },
    team: {
      people: [
        { id: 'you', name: 'شما', role: 'مالک', can: 'تیم را اداره می‌کند: افراد را دعوت می‌کند، نقششان را تغییر می‌دهد و حذفشان می‌کند.' },
        { id: 'sam', name: 'Sam', role: 'ویرایشگر', can: 'گزارش را ویرایش می‌کند، تحلیل‌ها را با تیم به اشتراک می‌گذارد و افراد را دعوت می‌کند.' },
        { id: 'priya', name: 'Priya', role: 'ویرایشگر', can: 'گزارش را ویرایش می‌کند، تحلیل‌ها را با تیم به اشتراک می‌گذارد و افراد را دعوت می‌کند.' },
        { id: 'leo', name: 'Leo', role: 'بیننده', can: 'گزارش را می‌خواند و دربارهٔ آن نظر می‌دهد.' },
      ],
      editing: 'Sam در حال ویرایش یافتهٔ ۲',
      comment: 'آیا Downtown آخر هفته‌ها هم جلوتر است؟',
      reply: 'سؤال خوبی است. بیایید در چت از DIG بپرسیم.',
      pick: 'روی یک نفر بزنید تا ببینید چه کاری می‌تواند بکند.',
    },
    proof: {
      before: 'Downtown امسال ', n1: money('fa', busiest.total), mid: ' فروخت؛ ', n2: `${dec('fa', STORE_RATIO, 2)} برابر`, after: ' Midtown.',
      hint: 'یک عدد را بزنید.',
      check1: `جمع همهٔ فروش‌های Downtown در فایل: ${money('fa', busiest.total, 2)}`,
      check2: `${money('fa', busiest.total, 2)} ÷ ${money('fa', quietest.total, 2)} = ${dec('fa', STORE_RATIO, 2)}`,
      ok: 'با فایل بررسی شد',
    },
    langs: { names: REPORT_LANGUAGES.fa, note: 'یافتهٔ ۱، به هر زبان' },
  },
};
