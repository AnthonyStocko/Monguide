import { Share } from '@capacitor/share';

export async function shareLink({ url, title, text, dialogTitle }) {
  try {
    await Share.share({ url, title, text, dialogTitle });
  } catch (error) {
    // Partage annulé par l'utilisateur : rien à signaler.
    if (!/cancel/i.test(String(error?.message ?? error))) throw error;
  }
  return { shared: true };
}
