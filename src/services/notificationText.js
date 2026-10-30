import { formatDate } from '../i18n/format.js';
import { freeLabelKey } from '../utils/freeLabel.js';

/**
 * Texte d'une notification de séjour (résumé de la veille, rappel avant
 * une étape, ou rappel de réservation d'un dîner de groupe), dans la langue
 * de l'interface.
 *
 * confidential : texte destiné à quitter l'appareil (rappels de la version
 * web, envoyés par le serveur). Il ne contient alors ni adresse ni titre
 * d'étape personnelle : « votre étape personnelle » remplace le titre, et le
 * départ conseillé ne nomme pas l'hébergement. Sur Android, les
 * notifications restent sur le téléphone : texte complet.
 *
 * @param {import('@domain/notificationPlan.js').PlannedNotification} n
 * @param {{ t: (key: string, values?: object) => string, locale: string, confidential?: boolean }} options
 * @returns {{ title: string, body: string }}
 */
export function renderNotification(n, { t, locale, confidential = false }) {
  const hidden = (step) => confidential && step.type === 'personal';
  if (n.kind === 'summary') {
    const day = formatDate(`${n.date}T12:00:00Z`, locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const lines = n.data.steps.map((s) => {
      // Dîner mis en avant : « 19:30 Dîner : … », ou « 19:30 Soirée libre ».
      if (s.type === 'dinner') return s.name ? t('notifications.summary.dinner', { start: s.start, name: s.name }) : t('notifications.summary.freeEvening', { start: s.start });
      if (hidden(s)) return `${s.start} ${t('notifications.confidential.personalStep')}`;
      return `${s.start} ${s.name ?? t(freeLabelKey(s))}`;
    });
    if (n.data.departure) {
      lines.unshift(confidential ? t('notifications.confidential.departure', { time: n.data.departure.time }) : t('notifications.summary.departure', n.data.departure));
    }
    return { title: t('notifications.summary.title', { date: day }), body: lines.join('\n') };
  }
  if (n.kind === 'booking') {
    return { title: t('notifications.booking.title', { count: n.data.travelers }), body: t('notifications.booking.body', { name: n.data.name, start: n.data.start, trip: n.data.tripTitle }) };
  }
  const body = t('notifications.reminder.body', { start: n.data.start, end: n.data.end, trip: n.data.tripTitle });
  if (hidden(n.data)) return { title: t('notifications.confidential.personalTitle'), body };
  return {
    title: t(n.data.type === 'dinner' ? 'notifications.reminder.dinnerTitle' : 'notifications.reminder.title', { name: n.data.name ?? t(freeLabelKey(n.data)) }),
    body
  };
}

/**
 * Empreinte courte de la liste des rappels d'un séjour (FNV-1a) : sert à ne
 * renvoyer la liste au serveur que si elle a changé.
 * @param {{ key: number, sendAt: string, title: string, body: string, url: string }[]} reminders
 * @returns {string} "" pour une liste vide
 */
export function remindersSignature(reminders) {
  if (!reminders.length) return '';
  const text = reminders.map((r) => `${r.key}@${r.sendAt}|${r.title}|${r.body}|${r.url}`).join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${reminders.length}:${(hash >>> 0).toString(36)}`;
}
