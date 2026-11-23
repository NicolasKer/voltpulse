import { describe, expect, it } from 'vitest';
import {
  classifyPdcStatus,
  computeStationAvailability,
  formatRelativeTimestamp,
} from './availabilityApi';
import { PdcDynamicStatus } from '../types/charging';

describe('classifyPdcStatus', () => {
  it('prioritizes hors_service even when occupation_pdc is libre', () => {
    expect(classifyPdcStatus('hors_service', 'libre')).toBe('out_of_service');
    expect(classifyPdcStatus('HORS_SERVICE', 'inconnu')).toBe('out_of_service');
  });

  it('classifies libre as available and occupe/reserve as occupied', () => {
    expect(classifyPdcStatus('en_service', 'libre')).toBe('available');
    expect(classifyPdcStatus('en_service', 'occupe')).toBe('occupied');
    expect(classifyPdcStatus('en_service', 'reserve')).toBe('occupied');
    expect(classifyPdcStatus('inconnu', 'inconnu')).toBe('unknown');
    expect(classifyPdcStatus(null, null)).toBe('unknown');
  });
});

describe('computeStationAvailability', () => {
  const mk = (
    idPdc: string,
    etatPdc: string,
    occupationPdc: string,
    horodatage: string
  ): PdcDynamicStatus => ({
    idPdc,
    etatPdc,
    occupationPdc,
    horodatage,
    classified: classifyPdcStatus(etatPdc, occupationPdc),
  });

  it('aggregates mixed available, occupied, and out-of-service points', () => {
    const map: Record<string, PdcDynamicStatus> = {
      P1: mk('P1', 'en_service', 'libre', '2026-11-23T10:00:00+00:00'),
      P2: mk('P2', 'en_service', 'occupe', '2026-11-23T11:30:00+00:00'),
      P3: mk('P3', 'hors_service', 'libre', '2026-11-23T09:00:00+00:00'),
    };
    const res = computeStationAvailability({ pdcIds: ['P1', 'P2', 'P3', 'P4'], pointCount: 4 }, map);
    expect(res.status).toBe('available');
    expect(res.availableCount).toBe(1);
    expect(res.occupiedCount).toBe(1);
    expect(res.outOfServiceCount).toBe(1);
    expect(res.knownCount).toBe(3);
    expect(res.totalCount).toBe(4);
    expect(res.latestTimestamp).toBe('2026-11-23T11:30:00+00:00');
  });

  it('reports occupied when all known points are busy and out_of_service when all are broken', () => {
    const busyMap: Record<string, PdcDynamicStatus> = {
      P1: mk('P1', 'en_service', 'occupe', '2026-11-23T11:00:00+00:00'),
      P2: mk('P2', 'hors_service', 'inconnu', '2026-11-23T11:00:00+00:00'),
    };
    expect(
      computeStationAvailability({ pdcIds: ['P1', 'P2'], pointCount: 2 }, busyMap).status
    ).toBe('occupied');

    const downMap: Record<string, PdcDynamicStatus> = {
      P1: mk('P1', 'hors_service', 'libre', '2026-11-23T11:00:00+00:00'),
    };
    expect(
      computeStationAvailability({ pdcIds: ['P1'], pointCount: 1 }, downMap).status
    ).toBe('out_of_service');

    expect(
      computeStationAvailability({ pdcIds: ['P1'], pointCount: 1 }, {}).status
    ).toBe('unknown');
  });
});

describe('formatRelativeTimestamp', () => {
  it('formats tabular space-separated timestamps reliably', () => {
    const now = Date.parse('2026-11-23T12:45:00+00:00');
    expect(formatRelativeTimestamp('2026-11-23 12:33:00+00:00', now)).toBe('il y a 12 min');
    expect(formatRelativeTimestamp('2026-11-23 10:45:00+00:00', now)).toBe('il y a 2 h');
    expect(formatRelativeTimestamp(null, now)).toBe('Horodatage inconnu');
  });
});
