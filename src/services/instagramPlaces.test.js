import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api.js', () => ({ callFunction: vi.fn() }));
const { callFunction } = await import('./api.js');
const { getInstagramPlaces } = await import('./dataApi.js');

describe('getInstagramPlaces', () => {
  beforeEach(() => {
    callFunction.mockReset();
  });

  it('renvoie les lieux valides', async () => {
    callFunction.mockResolvedValue({ data: { places: [{ url: 'https://www.instagram.com/p/AAA111/', name: 'Abbaye' }] } });
    expect(await getInstagramPlaces()).toEqual([{ url: 'https://www.instagram.com/p/AAA111/', name: 'Abbaye' }]);
    expect(callFunction).toHaveBeenCalledWith('instagram-places', expect.objectContaining({ method: 'GET' }));
  });

  it("renvoie une liste vide, sans erreur, quand l'appel échoue", async () => {
    callFunction.mockImplementation(async () => {
      throw new Error('server');
    });
    expect(await getInstagramPlaces()).toEqual([]);
  });

  it('renvoie une liste vide pour une réponse inattendue', async () => {
    callFunction.mockResolvedValue({ data: 'nope' });
    expect(await getInstagramPlaces()).toEqual([]);
  });
});
