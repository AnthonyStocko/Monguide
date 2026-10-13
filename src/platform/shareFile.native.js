import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function shareFile({ fileName, title, dialogTitle, toBase64 }) {
  const { uri } = await Filesystem.writeFile({ path: fileName, data: toBase64(), directory: Directory.Cache });
  try {
    await Share.share({ title, dialogTitle, files: [uri] });
  } catch (error) {
    // Partage annulé par l'utilisateur : le fichier reste disponible, rien à signaler.
    if (!/cancel/i.test(String(error?.message ?? error))) throw error;
  }
  return { shared: true };
}
