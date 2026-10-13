import i18n from 'i18next';
import { shareFile } from '../../platform/shareFile.js';
import { buildTripDocument, exportFileName } from './tripDocument.js';

/**
 * Export PDF d'un séjour, dans la langue de l'interface, remis par
 * platform/shareFile.js : feuille de partage sur Android et sur iPhone,
 * téléchargement sur ordinateur.
 * jsPDF et les polices sont chargés seulement au moment de l'export.
 * @param {import('@domain/model.js').Trip} trip
 * @param {{ includeAddresses: boolean }} options
 * @returns {Promise<{ fileName: string, shared: boolean }>}
 */
export async function exportTripPdf(trip, { includeAddresses }) {
  const t = i18n.t.bind(i18n);
  const locale = i18n.resolvedLanguage;
  const content = buildTripDocument(trip, { t, locale, includeAddresses, generatedAt: new Date() });
  const { loadFonts, renderPdf } = await import('./renderPdf.js');
  const doc = renderPdf(content, { fonts: await loadFonts(), lang: locale, footer: (page, total) => t('export.footer', { page, total }) });
  const fileName = exportFileName(trip);

  const { shared } = await shareFile({
    fileName,
    mimeType: 'application/pdf',
    title: trip.title,
    dialogTitle: t('export.shareTitle'),
    toBase64: () => doc.output('datauristring').split(',')[1],
    toBlob: () => doc.output('blob')
  });
  return { fileName, shared };
}
