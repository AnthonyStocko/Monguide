import { describe, expect, it } from 'vitest';
import { dedupePlaces } from './dedupePlaces.js';

const place = (id, name, lat, lon, certified = false) => ({ id, name, lat, lon, certified });

describe('dedupePlaces', () => {
  it('supprime un même nom à moins de 50 m et garde le lieu certifié', () => {
    const osm = place('osm:way/1', 'Église Notre-Dame', 45.98800, 4.71800);
    const mh = place('merimee:PA1', 'Eglise notre-dame', 45.98820, 4.71810, true);
    expect(dedupePlaces([osm, mh], 50)).toEqual([mh]);
  });

  it('garde deux lieux de même nom éloignés', () => {
    const a = place('osm:node/1', 'Lavoir', 45.98, 4.71);
    const b = place('osm:node/2', 'Lavoir', 45.99, 4.72);
    expect(dedupePlaces([a, b], 50)).toEqual([a, b]);
  });

  it('garde deux lieux proches de noms différents', () => {
    const a = place('osm:node/1', 'Le Bouchon', 45.98, 4.71);
    const b = place('osm:node/2', 'La Table', 45.98001, 4.71001);
    expect(dedupePlaces([a, b], 50)).toHaveLength(2);
  });

  it('supprime les identifiants répétés et conserve l\'ordre', () => {
    const a = place('osm:node/1', 'A', 45, 4);
    const b = place('osm:node/2', 'B', 46, 5);
    expect(dedupePlaces([b, a, { ...a }], 50)).toEqual([b, a]);
  });
});
