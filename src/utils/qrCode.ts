import * as QRCode from 'qrcode';

export const PUBLIC_APP_URL = 'https://nicolasker.github.io/voltpulse/';

export interface QrSvgModel {
  size: number;
  margin: number;
  viewBoxSize: number;
  pathData: string;
}

/**
 * Returns the canonical HTTPS URL to encode in the share QR code.
 * Uses the deployed origin/path in production HTTPS contexts, and falls back
 * to `PUBLIC_APP_URL` during local development or non-HTTPS previews.
 */
export function getAppShareUrl(): string {
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname)
  ) {
    return `${window.location.origin}${window.location.pathname}`;
  }
  return PUBLIC_APP_URL;
}

/**
 * Builds an SVG `<path>` string representing a QR code matrix with uniform quiet-zone margin.
 */
export function buildQrSvgModel(text: string, margin = 3): QrSvgModel {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const segments: string[] = [];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col)) {
        segments.push(`M${col + margin} ${row + margin}h1v1h-1z`);
      }
    }
  }

  return {
    size,
    margin,
    viewBoxSize: size + margin * 2,
    pathData: segments.join(''),
  };
}

/**
 * Generates a high-contrast 512px PNG data URL suitable for downloading and phone camera scanning.
 */
export async function generateQrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 512,
    margin: 3,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0a0f18',
      light: '#ffffff',
    },
  });
}
