import { describe, expect, it } from 'vitest';
import {
  computeSubscriptionBreakeven,
  estimateChargeSession,
  estimateTotalCostWithDetour,
  getPriceTier,
  isTruthyIrve,
  normalizePowerKw,
  parseIrveTariff,
} from './tariffParser';
import { DEFAULT_VEHICLE_PROFILE, SUBSCRIPTION_PLANS } from '../data/networkTariffs';

describe('isTruthyIrve', () => {
  it('normalizes mixed-case ODRÉ boolean strings and booleans', () => {
    expect(isTruthyIrve('true')).toBe(true);
    expect(isTruthyIrve('True')).toBe(true);
    expect(isTruthyIrve('TRUE')).toBe(true);
    expect(isTruthyIrve('1')).toBe(true);
    expect(isTruthyIrve(true)).toBe(true);
    expect(isTruthyIrve('false')).toBe(false);
    expect(isTruthyIrve('False')).toBe(false);
    expect(isTruthyIrve('0')).toBe(false);
    expect(isTruthyIrve(null)).toBe(false);
  });
});

describe('normalizePowerKw', () => {
  it('converts rare Watt values to kW and preserves normal kW values', () => {
    expect(normalizePowerKw(150)).toBe(150);
    expect(normalizePowerKw(22)).toBe(22);
    expect(normalizePowerKw(22000)).toBe(22);
    expect(normalizePowerKw(160000)).toBe(160);
    expect(normalizePowerKw(null)).toBe(0);
  });
});

describe('parseIrveTariff', () => {
  it('parses gratuit flag as 0 € free tier', () => {
    const res = parseIrveTariff(null, 'True', 50, 'Mairie', 'Mairie');
    expect(res.pricePerKwh).toBe(0);
    expect(res.source).toBe('irve');
    expect(res.tier).toBe('free');
  });

  it('parses ODRÉ JSON tarification object', () => {
    const json =
      '{"fixedPrice":0,"energyPrice":0.51,"minimumBilling":0,"matrix":[],"matrixOSF":[{"duration":0,"interval":1,"price":0.2,"gracePeriodBeforeOSF":900}]}';
    const res = parseIrveTariff(json, 'false', 150, 'Power Dot France', 'Power Dot France');
    expect(res.pricePerKwh).toBe(0.51);
    expect(res.source).toBe('irve');
    expect(res.tier).toBe('medium');
    expect(res.detailNote).toContain('occupation');
  });

  it('parses ODRÉ French euro/kWh strings and mojibake strings without confusing hourly occupancy fee', () => {
    const r1 = parseIrveTariff('0,38 €/kWh', 'false', 22, 'SOLVEO', 'SOLVEO');
    expect(r1.pricePerKwh).toBe(0.38);
    expect(r1.source).toBe('irve');

    const mojibake =
      "entre 07:00 et 22:00 : 0.3333Ć par kwh de charge, entre 07:00 et 22:00 : 5.0Ć par heure d'occupation hors charge, par dķfaut : 0.3333Ć par kwh de charge";
    const r2 = parseIrveTariff(mojibake, 'false', 22, 'Freshmile', 'Freshmile');
    expect(r2.pricePerKwh).toBe(0.333);
    expect(r2.source).toBe('irve');
    expect(r2.tier).toBe('cheap');
  });

  it('parses centimes/kWh strings and selects AC vs HPC tier by station power', () => {
    const r1 = parseIrveTariff('59 cts/kWh', 'false', 150, 'Autre', 'Autre');
    expect(r1.pricePerKwh).toBe(0.59);
    expect(r1.tier).toBe('expensive');

    const multi = 'AC 36cts/KWh - HPC 49cts/Kwh';
    expect(parseIrveTariff(multi, 'false', 22, 'Autre', 'Autre').pricePerKwh).toBe(0.36);
    expect(parseIrveTariff(multi, 'false', 150, 'Autre', 'Autre').pricePerKwh).toBe(0.49);
  });

  it('estimates €/kWh from per-minute pricing', () => {
    const res = parseIrveTariff('Charge normale : 0,025€ / min', 'false', 22, 'Autre', 'Autre');
    expect(res.source).toBe('irve');
    expect(res.pricePerMin).toBe(0.025);
    expect(res.pricePerKwh).toBeCloseTo((0.025 * 60) / 11, 2);
  });

  it('ignores generic ODRÉ disclaimers and matches brand BEFORE operator', () => {
    const disclaimer =
      'Les tarifs de recharge peuvent varier en fonction de plusieurs facteurs, y compris le fournisseur de services...';
    const carrefour = parseIrveTariff(
      disclaimer,
      'false',
      150,
      'Allego',
      'Carrefour Energies'
    );
    expect(carrefour.source).toBe('network');
    expect(carrefour.sourceLabel).toBe('Réf. Carrefour Énergies');
    expect(carrefour.pricePerKwh).toBe(0.54);

    const engie = parseIrveTariff(null, 'false', 150, 'Greenflux', 'ENGIE Vianeo');
    expect(engie.source).toBe('network');
    expect(engie.sourceLabel).toBe('Réf. ENGIE Vianeo');
    expect(engie.pricePerKwh).toBe(0.62);
  });

  it('resolves major French DC operators when tarification is null', () => {
    expect(parseIrveTariff(null, 'false', 160, 'NW', 'IECharge').pricePerKwh).toBe(0.25);
    expect(parseIrveTariff(null, 'false', 120, 'LIDL France', 'LIDL').pricePerKwh).toBe(0.39);
    expect(
      parseIrveTariff(null, 'false', 250, 'TESLA France SARL', 'TESLA SUPERCHARGER').pricePerKwh
    ).toBe(0.45);
    expect(parseIrveTariff(null, 'false', 300, 'ELECTRA', 'ELECTRA').pricePerKwh).toBe(0.54);
    expect(parseIrveTariff(null, 'false', 350, 'IONITY', 'IONITY GMBH').pricePerKwh).toBe(0.59);
  });

  it('returns unknown with extracted URL when operator is unrecognized and only a URL is given', () => {
    const res = parseIrveTariff('https://exemple-local.fr/tarifs', 'false', 50, 'Syndicat X', 'Borne X');
    expect(res.source).toBe('unknown');
    expect(res.pricePerKwh).toBeNull();
    expect(res.tariffUrl).toBe('https://exemple-local.fr/tarifs');
    expect(getPriceTier(res.pricePerKwh)).toBe('unknown');
  });
});

describe('estimateChargeSession', () => {
  it('computes kWh, cost, minutes, range, and delta vs home tariff', () => {
    const est = estimateChargeSession(0.35, 150, DEFAULT_VEHICLE_PROFILE);
    // 60 kWh * (80 - 20)% = 36 kWh
    expect(est.energyKwh).toBe(36);
    expect(est.estimatedCostEur).toBe(12.6);
    expect(est.homeCostEur).toBe(7.2);
    expect(est.deltaVsHomeEur).toBe(5.4);
    expect(est.estimatedMinutes).toBeGreaterThan(15);
    expect(est.estimatedRangeKm).toBeGreaterThan(200);
  });
});

describe('estimateTotalCostWithDetour', () => {
  it('shows closer 0.39 €/kWh station beating far 0.35 €/kWh station on total effective cost', () => {
    const farCheap = estimateTotalCostWithDetour(
      {
        distanceKm: 15,
        maxPowerKw: 150,
        resolvedPrice: {
          pricePerKwh: 0.35,
          pricePerMin: null,
          fixedFeeEur: null,
          source: 'network',
          sourceLabel: 'Izivia Fast',
          tier: 'cheap',
        },
      },
      DEFAULT_VEHICLE_PROFILE
    );
    const nearGood = estimateTotalCostWithDetour(
      {
        distanceKm: 1,
        maxPowerKw: 150,
        resolvedPrice: {
          pricePerKwh: 0.39,
          pricePerMin: null,
          fixedFeeEur: null,
          source: 'network',
          sourceLabel: 'Lidl',
          tier: 'good',
        },
      },
      DEFAULT_VEHICLE_PROFILE
    );
    expect(farCheap.detourRoundTripKm).toBe(30);
    expect(nearGood.detourRoundTripKm).toBe(2);
    expect(nearGood.totalEffectiveEur!).toBeLessThan(farCheap.totalEffectiveEur!);
  });
});

describe('computeSubscriptionBreakeven', () => {
  it('computes exact break-even kWh, charges and km for Ionity, Mobilize and Electra', () => {
    const ionity = SUBSCRIPTION_PLANS.find((p) => p.id === 'ionity')!;
    const ionityRes = computeSubscriptionBreakeven(ionity, null, DEFAULT_VEHICLE_PROFILE);
    // 11.99 / (0.59 - 0.33 = 0.26) = 46.115 -> 47 kWh ; 47 / 36 = 1.3 charges
    expect(ionityRes.isProfitable).toBe(true);
    expect(ionityRes.breakEvenKwh).toBe(47);
    expect(ionityRes.breakEvenCharges).toBe(1.3);
    expect(ionityRes.breakEvenKm).toBe(Math.round((47 / 16.5) * 100));

    const mobilize = SUBSCRIPTION_PLANS.find((p) => p.id === 'mobilize')!;
    const mobRes = computeSubscriptionBreakeven(mobilize, 0.59, DEFAULT_VEHICLE_PROFILE);
    expect(mobRes.breakEvenKwh).toBe(25);

    const electra = SUBSCRIPTION_PLANS.find((p) => p.id === 'electra')!;
    const elecRes = computeSubscriptionBreakeven(electra, 0.54, DEFAULT_VEHICLE_PROFILE);
    expect(elecRes.breakEvenKwh).toBe(80);
  });

  it('returns not profitable when public/OCPI rate is already <= subscription rate', () => {
    const tesla = SUBSCRIPTION_PLANS.find((p) => p.id === 'tesla')!;
    const res = computeSubscriptionBreakeven(tesla, 0.22, DEFAULT_VEHICLE_PROFILE);
    expect(res.isProfitable).toBe(false);
    expect(res.breakEvenKwh).toBeNull();
  });
});
