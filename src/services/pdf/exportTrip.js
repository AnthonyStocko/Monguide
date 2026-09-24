import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import i18n from 'i18next';
import { buildTripDocument, exportFileName } from './tripDocument.js';

/**
 * Export PDF d'un séjour, dans la langue de l'interface. Sur mobile :
 * fichier enregistré dans le cache de l'application (@capacitor/filesystem)
 * puis partagé (@capacitor/share) ; sur le web : téléchargement direct.
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

  if (!Capacitor.isNativePlatform()) {
    doc.save(fileName);
    return { fileName, shared: false };
  }
  const data = doc.output('datauristring').split(',')[1];
  const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  try {
    await Share.share({ title: trip.title, dialogTitle: t('export.shareTitle'), files: [uri] });
  } catch (error) {
    // Partage annulé par l'utilisateur : le fichier reste disponible, rien à signaler.
    if (!/cancel/i.test(String(error?.message ?? error))) throw error;
  }
  return { fileName, shared: true };
}
