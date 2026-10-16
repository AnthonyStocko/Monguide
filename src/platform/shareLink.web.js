export async function shareLink({ url, title, text }) {
  if (typeof navigator.share !== 'function') return { shared: false };
  try {
    await navigator.share({ url, title, text });
  } catch (error) {
    // Partage annulé par l'utilisateur : rien à signaler.
    if (error?.name !== 'AbortError') throw error;
  }
  return { shared: true };
}
