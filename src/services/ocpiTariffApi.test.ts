import { describe, expect, it } from 'vitest';
import { evaluateOcpiRawTariff, OcpiRawTariff } from './ocpiTariffApi';

describe('evaluateOcpiRawTariff', () => {
  const teslaSample: OcpiRawTariff = {
    id: 'tesla-1',
    party_id: 'TSL',
    currency: 'EUR',
    tax_included: 'YES',
    tariff_alt_url: 'https://www.tesla.com/support/charging/supercharger/fees',
    elements: [
      {
        restrictions: { max_duration: 300, min_duration: 0 },
        price_components: [{ type: 'CONGESTION_TIME', price: 0.0 }],
      },
      {
        restrictions: {
          start_time: '00:00:00',
          end_time: '04:00:00',
          day_of_week: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
        },
        price_components: [{ type: 'ENERGY', price: 0.22 }],
      },
      {
        restrictions: {
          start_time: '08:00:00',
          end_time: '21:00:00',
          day_of_week: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
        },
        price_components: [{ type: 'ENERGY', price: 0.53 }],
      },
      {
        restrictions: {
          start_time: '21:00:00',
          end_time: '00:00:00',
          day_of_week: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
        },
        price_components: [{ type: 'ENERGY', price: 0.22 }],
      },
      {
        price_components: [{ type: 'ENERGY', price: 0.47 }],
      },
    ],
  };

  it('selects off-peak vs peak time-of-day pricing including midnight 00:00:00 end_time', () => {
    const offPeakNight = evaluateOcpiRawTariff(teslaSample, new Date(2026, 10, 23, 2, 30));
    expect(offPeakNight?.currentPricePerKwh).toBe(0.22);
    expect(offPeakNight?.hasTimeOfDay).toBe(true);
    expect(offPeakNight?.minPricePerKwh).toBe(0.22);
    expect(offPeakNight?.maxPricePerKwh).toBe(0.53);

    const lateEvening = evaluateOcpiRawTariff(teslaSample, new Date(2026, 10, 23, 22, 15));
    expect(lateEvening?.currentPricePerKwh).toBe(0.22);

    const peakAfternoon = evaluateOcpiRawTariff(teslaSample, new Date(2026, 10, 23, 14, 0));
    expect(peakAfternoon?.currentPricePerKwh).toBe(0.53);

    // Fallback when hour falls in gap 04:00-08:00
    const gapFallback = evaluateOcpiRawTariff(teslaSample, new Date(2026, 10, 23, 6, 0));
    expect(gapFallback?.currentPricePerKwh).toBe(0.47);
  });

  it('converts HT price to TTC when tax_included is not YES and extracts FLAT fee', () => {
    const montaSample: OcpiRawTariff = {
      id: 'FRGRET16661',
      party_id: 'MON',
      currency: 'EUR',
      elements: [
        { price_components: [{ type: 'ENERGY', price: 0.42, vat: 20 }] },
        { price_components: [{ type: 'FLAT', price: 0.5, vat: 20 }] },
      ],
    };
    const res = evaluateOcpiRawTariff(montaSample, new Date(2026, 10, 23, 12, 0));
    expect(res?.currentPricePerKwh).toBe(0.504);
    expect(res?.flatFeeEur).toBe(0.6);
    expect(res?.hasTimeOfDay).toBe(false);
  });
});
