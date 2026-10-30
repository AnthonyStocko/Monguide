import { stepDurations } from './activity.js';
import { scheduleDay } from './scheduleDay.js';
import { fromMinutes, toMinutes } from './time.js';
import { travelMinutes } from './travel.js';

/**
 * Compaction d'une journée (fonction pure, generateTrip.js) : aucun écart
 * sans étape ni trajet de plus de rules.day.maxGapMin, hors temps libre
 * volontaire. Étapes « ancrées » : la première, les repas (déjeuner, dîner)
 * et la visite du soir (relax) ; les autres visites s'enchaînent au plus tôt
 * (follow). Pour chaque écart trop long avant une étape ancrée, dans cet
 * ordre :
 *  1. une visite de plus (ctx.candidates, dans l'ordre de préférence) qui
 *     tient dans l'écart sans retarder l'étape suivante, ouverte et
 *     acceptée par ctx.fits (coucher du soleil, horaires) ; au plus
 *     rules.day.maxFillers par jour ;
 *  2. la visite précédente allongée, jusqu'à sa durée maximale ;
 *  3. l'étape suivante avancée : visite du soir au plus tôt ; déjeuner jamais
 *     avant le début de sa plage (ctx.lunchFrom), dîner jamais avant l'heure
 *     du pays (ctx.dinnerFrom), et seulement si ctx.fits accepte le repas sur
 *     le nouveau créneau (restaurant ouvert) ;
 * Aucune visite ajoutée ou allongée ne finit après rules.day.lastVisitEnd.
 *  4. un temps libre (ctx.freeTime), seulement s'il est voulu, avant la
 *     visite du soir ou le dîner.
 * Un écart qui reste (aucune solution) est laissé tel quel.
 *
 * @param {object[]} raw étapes avec slotStart (et follow pour les étapes insérées)
 * @param {{
 *   from: object | null, to: object | null, mode: string,
 *   candidates: object[],
 *   fits: (place: object, start: number, end: number) => boolean,
 *   makeStep: (place: object) => object,
 *   lunchFrom: string, dinnerFrom: string,
 *   freeTime?: (() => object) | null
 * }} ctx minutes depuis minuit pour fits ; makeStep crée l'étape d'une visite ajoutée ; freeTime crée le
 *   temps libre (avec son lieu) quand il est voulu
 * @returns {{ steps: object[], added: object[] }} added : lieux des visites ajoutées
 */
export function compactDay(raw, ctx, rules) {
  const { maxGapMin, maxFillers } = rules.day;
  const lastVisitEnd = toMinutes(rules.day.lastVisitEnd);
  const route = { from: ctx.from, to: ctx.to, mode: ctx.mode };
  const travel = (a, b) => (a && b ? travelMinutes(a, b, ctx.mode, rules) : 0);
  const anchored = (s, i) => i === 0 || ['lunch', 'dinner', 'relax'].includes(s.type);
  let steps = raw.map((s, i) => (anchored(s, i) ? { ...s, follow: undefined } : { ...s, follow: true }));
  const added = [];
  const tried = new Set();
  const lengthened = new Set();
  let freeTimeAdded = false;

  for (let round = 0; round < 40; round += 1) {
    const schedule = scheduleDay(steps, route, rules).steps;
    if (schedule.length !== steps.length) break;
    const gapAt = schedule.findIndex((s, i) => {
      // Étape sans lieu (soirée libre choisie, temps libre) : jamais avancée ni précédée d'une visite ajoutée.
      if (i === 0 || !schedule[i - 1].place || !s.place) return false;
      const gap = toMinutes(s.start) - (s.travelFromPreviousMin ?? 0) - toMinutes(schedule[i - 1].end);
      return gap > maxGapMin && !tried.has(s.id);
    });
    if (gapAt < 0) break;
    const prev = schedule[gapAt - 1];
    const next = schedule[gapAt];
    const prevEnd = toMinutes(prev.end);
    const gap = toMinutes(next.start) - (next.travelFromPreviousMin ?? 0) - prevEnd;

    // 4 (d'abord, une fois) : temps libre voulu, en fin d'après-midi, avant la visite du soir ou le dîner.
    if (ctx.freeTime && !freeTimeAdded && ['relax', 'dinner'].includes(next.type) && gap >= rules.day.freeTimeMin / 2) {
      const free = ctx.freeTime();
      const travelIn = travel(prev.place, free.place);
      const travelOut = free.place && next.place ? travel(free.place, next.place) : (next.travelFromPreviousMin ?? 0);
      free.targetMin = Math.max(15, Math.min(rules.day.freeTimeMin, gap - travelIn - travelOut + (next.travelFromPreviousMin ?? 0)));
      steps = [...steps.slice(0, gapAt), { ...free, follow: true }, ...steps.slice(gapAt)];
      freeTimeAdded = true;
      continue;
    }

    // 1 : une visite de plus qui tient dans l'écart.
    if (added.length < maxFillers) {
      const inserted = tryFiller(steps, gapAt, schedule, ctx, rules, added);
      if (inserted) {
        steps = inserted;
        continue;
      }
    }

    // 2 : allonger la visite précédente, jusqu'à sa durée maximale.
    const prevRaw = steps[gapAt - 1];
    if (prevRaw.place && !['lunch', 'dinner'].includes(prevRaw.type) && !lengthened.has(prevRaw.id)) {
      const current = toMinutes(prev.end) - toMinutes(prev.start);
      const { maximumMin } = stepDurations(prevRaw, rules);
      const target = Math.min(maximumMin ?? current, current + gap - Math.floor(maxGapMin / 2), lastVisitEnd - toMinutes(prev.start));
      lengthened.add(prevRaw.id);
      if (target > current && ctx.fits(prevRaw.place, toMinutes(prev.start), toMinutes(prev.start) + target)) {
        steps = steps.map((s) => (s.id === prevRaw.id ? { ...s, targetMin: target } : s));
        continue;
      }
    }

    // 3 : avancer l'étape suivante (jamais un repas avant sa plage ou l'heure du pays).
    const earliest = next.type === 'lunch' ? toMinutes(ctx.lunchFrom) : next.type === 'dinner' ? toMinutes(ctx.dinnerFrom) : 0;
    const advanced = Math.max(earliest, prevEnd + (next.travelFromPreviousMin ?? 0));
    const meal = next.type === 'lunch' || next.type === 'dinner';
    const length = toMinutes(next.end) - toMinutes(next.start);
    if (advanced < toMinutes(next.start) && (!meal || ctx.fits(next.place, advanced, advanced + length))) {
      steps = steps.map((s) => (s.id === next.id ? { ...s, slotStart: fromMinutes(advanced) } : s));
      continue;
    }
    tried.add(next.id);
  }
  return { steps, added };
}

/**
 * Visite ajoutée juste avant l'étape gapAt : le premier candidat qui tient
 * dans l'écart sans retarder cette étape, accepté par ctx.fits.
 * @returns {object[] | null}
 */
function tryFiller(steps, gapAt, schedule, ctx, rules, added) {
  const prev = schedule[gapAt - 1];
  const next = schedule[gapAt];
  const nextStart = toMinutes(next.start);
  const nextPlace = next.place ?? ctx.to;
  const maxTravel = rules.travel.maxTravelMin;
  const travel = (a, b) => (a && b ? travelMinutes(a, b, ctx.mode, rules) : 0);
  const room = nextStart - toMinutes(prev.end);
  let tries = 0;
  for (const place of ctx.candidates) {
    if (added.includes(place)) continue;
    const step = ctx.makeStep(place);
    const { minimumMin } = stepDurations(step, rules);
    const legIn = travel(prev.place, place);
    const legOut = travel(place, nextPlace);
    if (legIn > maxTravel || legOut > maxTravel || legIn + minimumMin + legOut > room) continue;
    // Refus évident (nuit tombée, fermé) écarté d'avance, sans compter dans les essais.
    const estimatedStart = toMinutes(prev.end) + legIn;
    if (!ctx.fits(place, estimatedStart, estimatedStart + minimumMin)) continue;
    if ((tries += 1) > 25) break;
    const trial = [...steps.slice(0, gapAt), { ...step, follow: true }, ...steps.slice(gapAt)];
    const scheduled = scheduleDay(trial, { from: ctx.from, to: ctx.to, mode: ctx.mode }, rules).steps;
    if (scheduled.length !== trial.length) continue;
    const mine = scheduled[gapAt];
    if (toMinutes(scheduled[gapAt + 1].start) > nextStart) continue;
    if (toMinutes(mine.end) > toMinutes(rules.day.lastVisitEnd)) continue;
    if (!ctx.fits(place, toMinutes(mine.start), toMinutes(mine.end))) continue;
    added.push(place);
    return trial;
  }
  return null;
}
