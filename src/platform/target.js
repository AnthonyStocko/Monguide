import { Capacitor } from '@capacitor/core';

/**
 * Plateforme d'exécution. Chaque fonction qui dépend d'un plugin Capacitor
 * passe par un adaptateur de ce dossier, avec deux implémentations :
 * *.native.js (plugins Capacitor, application Android) et *.web.js (API du
 * navigateur, version web installable). Le reste de l'application n'importe
 * jamais @capacitor/* directement.
 *
 * Dans le build web (npm run build:web), import.meta.env.VITE_TARGET vaut
 * "web" à la compilation : les adaptateurs ne chargent que leur fichier
 * *.web.js et aucun plugin natif n'est embarqué.
 */
export const isNative = import.meta.env.VITE_TARGET !== 'web' && Capacitor.isNativePlatform();

export const isAndroid = isNative && Capacitor.getPlatform() === 'android';
