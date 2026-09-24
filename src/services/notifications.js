import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import i18n from 'i18next';
import { planTripNotifications, reconcilePlan } from '@domain/notificationPlan.js';
import { formatDate } from '../i18n/format.js';
import { getRules } from './rules.js';
import * as settings from './settings.js';
import { getTrip, listTrips, onTripsChanged } from './tripsStore.js';

/**
 * Notifications locales des séjours (@capacitor/local-notifications) :
 * résumé de la veille et rappel une heure avant chaque étape (voir
 * domain/notificationPlan.js). Identifiants stables : reprogrammer un
 * séjour ne crée jamais de doublon. Aucune erreur n'est bloquante : sans
 * permission, rien n'est programmé et les réglages l'expliquent.
 *
 * Réconciliation (reconcileNotifications) : Android efface les alarmes au
 * redémarrage du téléphone ; le plugin les réinscrit (récepteur
 * LocalNotificationRestoreReceiver sur BOOT_COMPLETED, vérifié dans son
 * manifeste), mais pas après un arrêt forcé, un démarrage automatique
 * bloqué par le fabricant ou le retrait de l'autorisation des alarmes
 * exactes. La liste attendue est donc comparée à getPending au lancement
 * à froid et à chaque retour au premier plan.
 */

const PREFS_KEY = 'notifications.prefs';
const IDS_KEY = 'notifications.ids';
const ASKED_KEY = 'notifications.asked';
const CHANNEL_ID = 'monguide-reminders';

/**
 * @typedef {{ device: boolean, summaries: boolean, reminders: boolean, summaryTime: string | null }} NotificationPrefs
 * device : "Recevoir les rappels sur cet appareil" (plusieurs téléphones sur un même compte) ;
 * summaryTime null : heure par défaut (rules.notifications.eveningSummaryTime).
 */
const DEFAULT_PREFS = { device: true, summaries: true, reminders: true, summaryTime: null };

const isAndroid = () => Capacitor.getPlatform() === 'android';

/** Une seule opération de programmation à la fois (évite les courses entre événements). */
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

/** @returns {Promise<NotificationPrefs>} */
export async function getNotificationPrefs() {
  return { ...DEFAULT_PREFS, ...((await settings.get(PREFS_KEY).catch(() => null)) ?? {}) };
}

/** Enregistre les réglages puis réconcilie les notifications programmées. */
export async function setNotificationPrefs(patch) {
  const next = { ...(await getNotificationPrefs()), ...patch };
  await settings.set(PREFS_KEY, next);
  await rescheduleAll();
  return next;
}

/** @returns {Promise<'granted' | 'denied' | 'prompt' | 'unavailable'>} */
export async function permissionState() {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    return display === 'prompt-with-rationale' ? 'prompt' : display;
  } catch {
    return 'unavailable';
  }
}

/** Demande l'autorisation d'afficher des notifications (Android 13 et plus). */
export async function requestPermission() {
  await settings.set(ASKED_KEY, true).catch(() => {});
  try {
    const { display } = await LocalNotifications.requestPermissions();
    if (display === 'granted') await reconcileNotifications();
    return display;
  } catch {
    return 'unavailable';
  }
}

/** L'écran d'explication a-t-il déjà été présenté ? */
export async function wasPermissionAsked() {
  return Boolean(await settings.get(ASKED_KEY).catch(() => false));
}

export async function markPermissionAsked() {
  await settings.set(ASKED_KEY, true).catch(() => {});
}

/**
 * Alarmes exactes (Android 12 et plus ; refusées par défaut sur Android 14) :
 * sans elles, les rappels restent programmés mais peuvent arriver avec
 * quelques minutes de retard.
 * @returns {Promise<'granted' | 'denied' | 'unavailable'>}
 */
export async function exactAlarmState() {
  if (!isAndroid()) return 'unavailable';
  try {
    const { exact_alarm: state } = await LocalNotifications.checkExactNotificationSetting();
    return state === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/** Ouvre le réglage système des alarmes exactes. */
export async function openExactAlarmSetting() {
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    // Réglage indisponible sur cette version d'Android : rien à ouvrir.
  }
  return exactAlarmState();
}

/** Texte d'une notification, dans la langue choisie dans l'application. */
function render(n) {
  const t = i18n.t.bind(i18n);
  const locale = i18n.resolvedLanguage;
  const day = formatDate(`${n.date}T12:00:00Z`, locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  if (n.kind === 'summary') {
    const lines = n.data.steps.map((s) => `${s.start} ${s.name ?? t('generation.freeTime')}`);
    if (n.data.departure) lines.unshift(t('notifications.summary.departure', n.data.departure));
    return { title: t('notifications.summary.title', { date: day }), body: lines.join('\n') };
  }
  return {
    title: t('notifications.reminder.title', { name: n.data.name ?? t('generation.freeTime') }),
    body: t('notifications.reminder.body', { start: n.data.start, end: n.data.end, trip: n.data.tripTitle })
  };
}

/** Lien ouvert par un appui sur la notification : onglet Planning, bon jour, bon créneau. */
export function notificationUrl(n) {
  const params = new URLSearchParams({ day: n.date, ...(n.stepId ? { step: n.stepId } : {}) });
  return `/planning/${n.tripId}?${params}`;
}

async function ensureChannel() {
  if (!isAndroid()) return;
  try {
    await LocalNotifications.createChannel({ id: CHANNEL_ID, name: i18n.t('notifications.channel'), importance: 4, visibility: 1 });
  } catch {
    // Canal déjà créé, ou indisponible : le canal par défaut sera utilisé.
  }
}

async function schedule(list) {
  if (!list.length) return;
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: list.map((n) => ({
      id: n.id,
      ...render(n),
      // allowWhileIdle : déclenchement même en veille (Doze), mode avion compris.
      schedule: { at: n.at, allowWhileIdle: true },
      extra: { url: notificationUrl(n), tripId: n.tripId },
      ...(isAndroid() ? { channelId: CHANNEL_ID } : {})
    }))
  });
}

async function cancel(ids) {
  if (ids.length) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
}

/** Notifications attendues pour un séjour, selon les réglages et la permission. */
async function expectedFor(trips) {
  const prefs = await getNotificationPrefs();
  if (!prefs.device || (await permissionState()) !== 'granted') return [];
  const options = { now: Date.now(), summaries: prefs.summaries, reminders: prefs.reminders, summaryTime: prefs.summaryTime ?? undefined };
  return trips.flatMap((trip) => planTripNotifications(trip, options, getRules()));
}

async function saveIds(expected) {
  const byTrip = {};
  for (const n of expected) (byTrip[n.tripId] ??= []).push(n.id);
  await settings.set(IDS_KEY, byTrip);
}

/** Notifications en attente sur l'appareil (diagnostic et tests). */
export async function listPendingNotifications() {
  const { notifications } = await LocalNotifications.getPending();
  return notifications;
}

async function pendingIds() {
  const { notifications } = await LocalNotifications.getPending();
  return notifications.map((n) => Number(n.id));
}

/**
 * Réconciliation : programme les rappels manquants et annule les orphelins
 * (identifiants stables : aucun doublon possible).
 * @returns {Promise<{ scheduled: number, cancelled: number, pending: number }>}
 */
export function reconcileNotifications() {
  return serial(async () => {
    try {
      const expected = await expectedFor(await listTrips());
      const { toSchedule, toCancel } = reconcilePlan(expected, await pendingIds());
      await cancel(toCancel);
      await schedule(toSchedule);
      await saveIds(expected);
      return { scheduled: toSchedule.length, cancelled: toCancel.length, pending: expected.length };
    } catch (error) {
      // Jamais bloquant (plugin indisponible, permission retirée…).
      return { scheduled: 0, cancelled: 0, pending: 0, error };
    }
  });
}

/**
 * Reprogrammation complète d'un séjour : annulation de ses identifiants,
 * puis nouvelle programmation (textes et horaires à jour). Un séjour
 * supprimé ou terminé n'a plus de notification.
 */
export function rescheduleTrip(tripId) {
  return serial(async () => {
    try {
      const byTrip = (await settings.get(IDS_KEY).catch(() => null)) ?? {};
      const trip = await getTrip(tripId).catch(() => null);
      const expected = trip ? await expectedFor([trip]) : [];
      await cancel([...new Set([...(byTrip[tripId] ?? []), ...expected.map((n) => n.id)])]);
      await schedule(expected);
      if (expected.length) byTrip[tripId] = expected.map((n) => n.id);
      else delete byTrip[tripId];
      await settings.set(IDS_KEY, byTrip);
    } catch {
      // Jamais bloquant.
    }
  });
}

/** Annule toutes les notifications (effacement des séjours locaux, suppression du compte). */
export function cancelAllNotifications() {
  return serial(async () => {
    try {
      await cancel(await pendingIds());
      await settings.set(IDS_KEY, {});
    } catch {
      // Jamais bloquant.
    }
  });
}

/** Tout reprogrammer (réglages ou langue modifiés : textes et heures à jour). */
async function rescheduleAll() {
  await cancelAllNotifications();
  await reconcileNotifications();
}

let started = false;

/**
 * Branche les notifications sur le cycle de vie de l'application :
 * modification, synchronisation ou suppression d'un séjour ; retour au
 * premier plan ; changement de langue ; appui sur une notification.
 * La réconciliation du lancement à froid est faite par main.jsx, avant le
 * premier affichage (App.addListener ne se déclenche pas au lancement).
 * @param {{ onOpen: (url: string) => void }} handlers
 * @returns {() => void}
 */
export function initNotifications({ onOpen }) {
  const handles = [];
  handles.push(LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const url = notification?.extra?.url;
    if (url) onOpen(url);
  }));
  if (started) return () => handles.forEach((h) => h.then((x) => x.remove()).catch(() => {}));
  started = true;

  const timers = new Map();
  onTripsChanged((id) => {
    if (id === null) {
      cancelAllNotifications();
      return;
    }
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => rescheduleTrip(id), 300));
  });
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) reconcileNotifications();
  }).catch(() => {});
  i18n.on('languageChanged', () => rescheduleAll());
  return () => handles.forEach((h) => h.then((x) => x.remove()).catch(() => {}));
}
