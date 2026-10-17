/**
 * Capacitor intercepte toute navigation vers un autre hôte que celui de
 * l'application (Bridge.launchIntent) : il lance un intent ACTION_VIEW sur
 * l'adresse et la WebView reste sur Mon guide. Aucun plugin nécessaire.
 */
export function openExternalUrl(url) {
  window.location.assign(url);
}
