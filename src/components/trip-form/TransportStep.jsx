import { Bike, Bus, Car, Footprints } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FUEL_TYPES } from '@domain/model.js';
import ChoiceGroup from '../ui/ChoiceGroup.jsx';

const MODE_ICONS = { walk: Footprints, transit: Bus, bike: Bike, car: Car };

/**
 * Étape 4 : mode de déplacement sur place ; carburant si voiture.
 * @param {{ draft: object, update: (patch: object) => void, errors: Record<string, string> }} props
 */
export default function TransportStep({ draft, update, errors }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <ChoiceGroup
        name="mode"
        legend={t('tripForm.transport.question')}
        hint={t('tripForm.transport.estimates')}
        options={Object.entries(MODE_ICONS).map(([mode, icon]) => ({ value: mode, label: t(`modes.${mode}`), icon }))}
        value={draft.mode}
        onChange={(mode) => update({ mode, fuelType: mode === 'car' ? draft.fuelType : null })}
        error={errors.mode && t(`tripForm.errors.${errors.mode}`)}
      />
      {draft.mode === 'car' && (
        <ChoiceGroup
          name="fuelType"
          legend={t('tripForm.transport.fuel')}
          options={FUEL_TYPES.map((f) => ({ value: f, label: t(`fuels.${f}`) }))}
          value={draft.fuelType}
          onChange={(fuelType) => update({ fuelType })}
          error={errors.fuelType && t(`tripForm.errors.${errors.fuelType}`)}
        />
      )}
    </div>
  );
}
