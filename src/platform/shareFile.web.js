/** Appareil tactile (téléphone, tablette) : la feuille de partage y est attendue ; sur ordinateur, on télécharge. */
const isTouchDevice = () => globalThis.matchMedia?.('(pointer: coarse)').matches === true;

function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Libéré après le démarrage du téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function shareFile({ fileName, mimeType, title, toBlob }) {
  const blob = toBlob();
  if (isTouchDevice() && typeof File === 'function' && typeof navigator.share === 'function') {
    const file = new File([blob], fileName, { type: mimeType });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return { shared: true };
      } catch (error) {
        // Partage annulé par l'utilisateur : rien à signaler.
        if (error?.name === 'AbortError') return { shared: true };
        // Partage refusé par le navigateur (geste de l'utilisateur expiré…) : téléchargement.
      }
    }
  }
  download(blob, fileName);
  return { shared: false };
}
