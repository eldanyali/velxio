import { describe, it, expect } from 'vitest';
import metadata from '../../public/components-metadata.json';

describe('component metadata — BMP280 entry', () => {
  it('is registered with id "bmp280" and tagName "velxio-bmp280"', () => {
    const entry = (metadata as Array<Record<string, unknown>>).find(
      (c) => c.id === 'bmp280',
    );
    expect(entry, 'BMP280 missing from components-metadata.json').toBeDefined();
    expect(entry!.tagName).toBe('velxio-bmp280');
    expect(entry!.category).toBe('sensor');
    expect(entry!.pinCount).toBe(4);
  });
});
