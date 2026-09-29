import { describe, expect, it } from 'vitest';
import { isAllowedImageUrl } from './images.js';

describe('isAllowedImageUrl', () => {
  it('accepte les miniatures Wikimedia Commons et les images embarquées', () => {
    expect(isAllowedImageUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/640px-X.jpg')).toBe(true);
    expect(isAllowedImageUrl('data:image/svg+xml,%3Csvg%3E')).toBe(true);
  });

  it('refuse tout autre domaine, le http et les valeurs absentes', () => {
    expect(isAllowedImageUrl('https://example.org/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('http://upload.wikimedia.org/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://upload.wikimedia.org.evil.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl(undefined)).toBe(false);
  });
});
