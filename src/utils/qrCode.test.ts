import { describe, expect, it } from 'vitest';
import { buildQrSvgModel, getAppShareUrl, PUBLIC_APP_URL } from './qrCode';

describe('qrCode utilities', () => {
  it('builds a valid SVG matrix path with quiet-zone margin for the public app URL', () => {
    const model = buildQrSvgModel(PUBLIC_APP_URL);
    expect(model.size).toBeGreaterThanOrEqual(29);
    expect(model.viewBoxSize).toBe(model.size + 6);
    expect(model.pathData.length).toBeGreaterThan(0);
    // Top-left finder pattern starts at module (0, 0) -> offset by margin 3 -> (3, 3)
    expect(model.pathData).toContain('M3 3h1v1h-1z');
  });

  it('returns the canonical public URL in the default non-HTTPS test environment', () => {
    expect(getAppShareUrl()).toBe(PUBLIC_APP_URL);
  });
});
