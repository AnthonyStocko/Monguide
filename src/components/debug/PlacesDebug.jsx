import { useState } from 'react';
import { Landmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPlaces } from '../../services/dataApi.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import SourceStatusList from './SourceStatusList.jsx';

const RADIUS_KM = 20;

function FoodDetails({ food }) {
  const { t } = useTranslation();
  const none = t('debug.notAvailable');
  const yesNo = (v) => (v === undefined ? none : t(v ? 'common.yes' : 'common.no'));
  const rows = [
    [t('food.cuisine'), food.cuisine?.join(', ') ?? none],
    [t('food.regional'), yesNo(food.regional)],
    [t('food.openingHours'), food.openingHours ?? none],
    [t('food.wheelchair'), food.wheelchair ? t(`food.wheelchairValues.${food.wheelchair}`) : none],
    [t('food.vegetarian'), yesNo(food.vegetarian)],
    [t('food.phone'), food.phone ?? none],
    [t('food.website'), food.website ?? none]
  ];
  return (
    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Test de la fonction places : lieux normalisés et état de chaque source
 * autour de la destination choisie (rayon 20 km).
 * @param {{ destination: object | null }} props
 */
export default function PlacesDebug({ destination }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState({ status: 'idle' });

  const run = async () => {
    setState({ status: 'loading' });
    try {
      const result = await getPlaces({
        lat: destination.lat,
        lon: destination.lon,
        radiusKm: RADIUS_KM,
        countryCode: destination.countryCode,
        profile: 'balanced',
        lunch: 'both',
        lang: i18n.resolvedLanguage
      });
      setState({ status: 'ok', result });
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  const data = state.result?.data;
  const counts = {};
  for (const p of data?.places ?? []) counts[p.category] = (counts[p.category] ?? 0) + 1;
  const certified = data?.places.filter((p) => p.certified) ?? [];
  const restaurants = data?.places.filter((p) => p.food) ?? [];

  return (
    <Card as="section" className="space-y-3">
      <h2 className="text-xl font-semibold">{t('debug.places.title')}</h2>
      <p className="text-ink-muted">{t('debug.places.hint', { radius: RADIUS_KM })}</p>
      <Button icon={Landmark} onClick={run} disabled={!destination || state.status === 'loading'} className="w-full">
        {t('debug.places.run')}
      </Button>
      {!destination && <p>{t('debug.chooseDestination')}</p>}
      {state.status === 'loading' && <Skeleton className="h-40 w-full" />}
      {state.status === 'error' && <ErrorState message={t(state.error.messageKey)} onRetry={run} />}
      {state.status === 'ok' && (
        <div className="space-y-4">
          {state.result.fromCache && <Badge tone="warning">{t('debug.fromLocalCache')}</Badge>}

          <section className="space-y-2">
            <h3 className="font-semibold">{t('debug.places.sources')}</h3>
            <SourceStatusList sources={data.sources} />
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">{t('debug.places.count', { count: data.places.length })}</h3>
            <ul className="flex flex-wrap gap-2">
              {Object.entries(counts).map(([category, n]) => (
                <li key={category}>
                  <Badge>{t('debug.places.categoryCount', { category: t(`categories.${category}`), count: n })}</Badge>
                </li>
              ))}
            </ul>
          </section>

          {certified.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold">{t('debug.places.certified', { count: certified.length })}</h3>
              <ul className="divide-y divide-line">
                {certified.slice(0, 15).map((p) => (
                  <li key={p.id} className="py-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="mt-1 flex flex-wrap gap-2">
                      <Badge tone="secondary">{t(`certifications.${p.certification}`)}</Badge>
                      <Badge>{t('debug.places.origin', { source: p.source })}</Badge>
                      <Badge>{t(p.indoor === true ? 'debug.places.indoor' : p.indoor === false ? 'debug.places.outdoor' : 'debug.places.unknown')}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="font-semibold">{t('debug.places.restaurants', { count: restaurants.length })}</h3>
            {restaurants.length === 0 && <p className="text-ink-muted">{t('debug.places.noRestaurants')}</p>}
            <ul className="divide-y divide-line">
              {restaurants.map((p) => (
                <li key={p.id} className="py-2">
                  <span className="font-medium">{p.name}</span>
                  {p.food.regional && <Badge tone="primary" className="ml-2">{t('food.regional')}</Badge>}
                  <FoodDetails food={p.food} />
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">{t('debug.places.appellations', { count: data.appellations.length })}</h3>
            <ul className="flex flex-wrap gap-2">
              {data.appellations.map((a) => (
                <li key={a.name}>
                  <Badge tone={a.local ? 'primary' : 'neutral'}>{a.name}</Badge>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Card>
  );
}
