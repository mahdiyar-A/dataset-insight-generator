import Image from 'next/image';

import { FILES } from '../demo/demoFacts';
import { FILES_COPY, num } from './homeCopy';
import type { Lang } from './homeCopy';

/**
 * The three kinds of report, shown as pages of the sample's own files
 * (public/demo/preview_*.png are renders of the files they link to).
 */

const CARDS = [
  { ext: 'pdf', src: '/demo/preview_pdf.png', width: 720, height: 1018 },
  { ext: 'docx', src: '/demo/preview_docx.png', width: 720, height: 1018 },
  { ext: 'pptx', src: '/demo/preview_pptx.png', width: 960, height: 540 },
] as const;

export default function FilesSection({ lang }: { lang: Lang }) {
  const t = FILES_COPY[lang];
  const csv = FILES.find(f => f.href.includes('cleaned'))!;

  return (
    <section id="files" className="hp-section hp-alt">
      <div className="hp-in">
        <p data-rv="solid" className="hp-eyebrow">{t.eyebrow}</p>
        <h2 data-rv="solid" className="hp-h2">{t.heading}</h2>
        <p data-rv="solid" className="hp-sub">{t.sub}</p>

        <div className="hp-files">
          {CARDS.map(card => {
            const file = FILES.find(f => f.ext === card.ext)!;
            const opens = card.ext === 'pdf';
            return (
              <a
                key={card.ext}
                data-rv
                className={'hp-file hp-file-' + card.ext}
                href={file.href}
                {...(opens ? { target: '_blank', rel: 'noopener' } : { download: true })}
              >
                <span className="hp-shot">
                  <Image
                    src={card.src}
                    alt={`${t.alt} (${t[card.ext]})`}
                    width={card.width}
                    height={card.height}
                    sizes="(max-width: 759px) 92vw, 360px"
                  />
                </span>
                <span className="hp-file-text">
                  <span className="hp-file-head">
                    <strong>{t[card.ext]}</strong>
                    <span className={'hp-tag' + (file.pro ? ' hp-tag-pro' : '')}>{file.pro ? t.pro : t.every}</span>
                  </span>
                  <span>{t[`${card.ext}Note`]}</span>
                  <span className="hp-file-go">
                    {opens ? t.open : t.download} · <bdi>{num(lang, parseInt(file.size, 10))} {t.kb}</bdi>
                  </span>
                </span>
              </a>
            );
          })}
        </div>

        <p data-rv className="hp-csv">
          {t.csv} <a href={csv.href} download>{t.csvLink}</a>
        </p>
      </div>
    </section>
  );
}
