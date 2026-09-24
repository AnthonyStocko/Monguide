import { jsPDF } from 'jspdf';
import regularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import boldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';

/**
 * Mise en page PDF (jsPDF, sans window.print) des blocs de buildTripDocument.
 * Police DejaVu Sans embarquée : les polices standard des PDF ne couvrent
 * que le Latin-1, pas le polonais, le tchèque, le grec (Grèce, Chypre) ni le
 * cyrillique (Bulgarie). Fichier chargé depuis l'application : fonctionne
 * hors ligne.
 */

const PAGE = { width: 210, height: 297, margin: 18 };
const TIME_COLUMN = 30;
const COLORS = { ink: [15, 23, 42], muted: [71, 85, 105], primary: [4, 120, 87] };
const STYLES = {
  title: { size: 20, bold: true, color: 'ink', before: 0, after: 2 },
  subtitle: { size: 11, bold: false, color: 'muted', before: 0, after: 1 },
  heading: { size: 14, bold: true, color: 'primary', before: 6, after: 2 },
  text: { size: 10.5, bold: false, color: 'ink', before: 1, after: 1 },
  muted: { size: 9, bold: false, color: 'muted', before: 1, after: 1 }
};
const lineHeight = (size) => size * 0.3528 * 1.35;

/** Police en base64, à partir de l'URL d'un fichier de l'application. */
async function toBase64(url) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** @returns {Promise<{ regular: string, bold: string }>} polices en base64 */
export async function loadFonts() {
  const [regular, bold] = await Promise.all([toBase64(regularUrl), toBase64(boldUrl)]);
  return { regular, bold };
}

/**
 * @param {{ title: string, blocks: object[] }} document
 * @param {{ fonts: { regular: string, bold: string }, footer: (page: number, total: number) => string, lang: string }} options
 * @returns {jsPDF}
 */
export function renderPdf({ title, blocks }, { fonts, footer, lang }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  doc.setProperties({ title, creator: 'Mon guide', subject: title });
  doc.setLanguage(lang);

  const width = PAGE.width - 2 * PAGE.margin;
  const bottom = PAGE.height - PAGE.margin - 8;
  let y = PAGE.margin;
  const style = (s) => {
    doc.setFont('DejaVu', s.bold ? 'bold' : 'normal');
    doc.setFontSize(s.size);
    doc.setTextColor(...COLORS[s.color]);
  };
  const ensure = (height) => {
    if (y + height > bottom) {
      doc.addPage();
      y = PAGE.margin;
    }
  };
  const write = (lines, x, s) => {
    for (const line of lines) {
      ensure(lineHeight(s.size));
      doc.text(line, x, y, { baseline: 'top' });
      y += lineHeight(s.size);
    }
  };

  for (const block of blocks) {
    if (block.kind === 'step') {
      const time = { ...STYLES.text, bold: true };
      const name = { ...STYLES.text, bold: true };
      style(name);
      const titleLines = doc.splitTextToSize(block.title, width - TIME_COLUMN);
      style(STYLES.muted);
      const detailLines = block.details.flatMap((d) => doc.splitTextToSize(d, width - TIME_COLUMN));
      const height = titleLines.length * lineHeight(name.size) + detailLines.length * lineHeight(STYLES.muted.size) + 2;
      // Une étape n'est pas coupée entre deux pages quand elle tient sur une page.
      ensure(Math.min(height, bottom - PAGE.margin));
      y += 1;
      const top = y;
      style(time);
      doc.text(block.time, PAGE.margin, top, { baseline: 'top' });
      style(name);
      write(titleLines, PAGE.margin + TIME_COLUMN, name);
      style(STYLES.muted);
      write(detailLines, PAGE.margin + TIME_COLUMN, STYLES.muted);
      y += 1.5;
      continue;
    }
    const s = STYLES[block.kind];
    style(s);
    const lines = doc.splitTextToSize(block.text, width);
    if (block.kind === 'heading') ensure(lineHeight(s.size) * 3);
    y += s.before;
    write(lines, PAGE.margin, s);
    y += s.after;
  }

  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    style(STYLES.muted);
    doc.text(footer(page, total), PAGE.width / 2, PAGE.height - PAGE.margin + 2, { align: 'center', baseline: 'top' });
  }
  return doc;
}
