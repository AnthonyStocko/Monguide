import { useState } from 'react';
import { BedDouble, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { tripNights } from '@domain/tripDraft.js';
import { useFormat } from '../../i18n/useFormat.js';
import LodgingPicker from '../trip-form/LodgingPicker.jsx';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import FieldError from '../ui/FieldError.jsx';

/**
 * Hébergements d'un séjour : ajout, modification des nuits, suppression.
 * Une nuit appartient à un seul hébergement ; un hébergement sans nuit est
 * refusé. L'enregistrement déclenche le recalcul des journées concernées
 * (panneau "Planning réajusté").
 * @param {{ trip: object, onSave: (lodgings: object[]) => void, onClose: () => void }} props
 */
export default function LodgingEditor({ trip, onSave, onClose }) {
  const { t } = useTranslation();
  const format = useFormat();
  const nights = tripNights(trip.startDate, trip.endDate);
  const [lodgings, setLodgings] = useState(trip.lodgings);
  const [adding, setAdding] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const night = (date) => format.date(`${date}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  const toggleNight = (id, date) =>
    setLodgings((list) =>
      list.map((l) => {
        if (l.id === id) return { ...l, nights: l.nights.includes(date) ? l.nights.filter((n) => n !== date) : [...l.nights, date].sort() };
        // Une nuit n'appartient qu'à un hébergement.
        return { ...l, nights: l.nights.filter((n) => n !== date) };
      })
    );
  const withoutNights = lodgings.filter((l) => !l.nights.length);

  const addLodging = () => {
    if (!adding) return;
    // Nuits encore libres ; sinon aucune : cocher une nuit la retire à l'autre hébergement.
    const free = nights.filter((n) => !lodgings.some((l) => l.nights.includes(n)));
    setLodgings((list) => [...list, { id: crypto.randomUUID(), ...adding, nights: free }]);
    setAdding(null);
  };

  const save = () => {
    if (withoutNights.length) {
      setShowErrors(true);
      return;
    }
    onSave(lodgings);
  };

  return (
    <Dialog
      fullScreen
      title={t('lodgings.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save}>{t('lodgings.save')}</Button>
        </>
      }
    >
      {!nights.length && <p>{t('tripForm.lodging.dayTrip')}</p>}
      {lodgings.length === 0 && nights.length > 0 && <p className="text-ink-muted">{t('lodgings.none')}</p>}
      <ul className="space-y-3">
        {lodgings.map((l) => (
          <li key={l.id} className="space-y-2 rounded-xl border border-line p-3">
            <p className="flex items-start gap-2">
              <BedDouble aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-primary-strong" />
              <span>
                {l.name && <span className="block font-semibold">{l.name}</span>}
                <span className={l.name ? '' : 'font-semibold'}>{l.address}</span>
              </span>
            </p>
            <fieldset className="space-y-1">
              <legend className="font-medium">{t('lodgings.nights')}</legend>
              {nights.map((n) => (
                <label key={n} className="flex min-h-12 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={l.nights.includes(n)} onChange={() => toggleNight(l.id, n)} className="size-6 accent-primary-strong" />
                  <span className="first-letter:uppercase">{night(n)}</span>
                </label>
              ))}
            </fieldset>
            <FieldError id={`lodging-${l.id}-error`}>{showErrors && !l.nights.length && t('lodgings.noNight')}</FieldError>
            <Button variant="ghost" icon={Trash2} onClick={() => setLodgings((list) => list.filter((x) => x.id !== l.id))} aria-label={t('lodgings.removeNamed', { name: l.name ?? l.address })}>
              {t('lodgings.remove')}
            </Button>
          </li>
        ))}
      </ul>

      {nights.length > 0 && (
        <section aria-labelledby="lodging-add-title" className="space-y-2 rounded-xl border border-dashed border-line p-3">
          <h3 id="lodging-add-title" className="text-lg font-semibold">
            {t('lodgings.add')}
          </h3>
          <LodgingPicker idPrefix="lodging-new" value={adding} onChange={setAdding} destination={trip.destination} />
          <Button icon={Plus} onClick={addLodging} disabled={!adding} className="w-full">
            {t('lodgings.addConfirm')}
          </Button>
        </section>
      )}
    </Dialog>
  );
}
