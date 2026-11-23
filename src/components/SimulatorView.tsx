import React, { useMemo, useState } from 'react';
import { BatteryCharging, Car, Coins, Gauge, Sparkles, TrendingDown } from 'lucide-react';
import { EV_PRESETS } from '../data/networkTariffs';
import { ChargingStation, VehicleProfile } from '../types/charging';
import { estimateChargeSession, formatPriceKwh } from '../utils/tariffParser';

interface SimulatorViewProps {
  vehicle: VehicleProfile;
  stations: ChargingStation[];
  locationLabel: string;
  onUpdateVehicle: (next: VehicleProfile) => void;
  onSelectStation: (station: ChargingStation) => void;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  vehicle,
  stations,
  locationLabel,
  onUpdateVehicle,
  onSelectStation,
}) => {
  const [customTariff, setCustomTariff] = useState<string>('0.45');

  const startProgress = `${vehicle.startSoc}%`;
  const targetProgress = `${vehicle.targetSoc}%`;

  const baseEst = estimateChargeSession(
    Number.parseFloat(customTariff.replace(',', '.')) || 0,
    vehicle.maxDcKw,
    vehicle
  );

  const sectorLadder = useMemo(() => {
    const priced = stations
      .filter((s) => s.resolvedPrice.pricePerKwh !== null)
      .sort(
        (a, b) =>
          (a.resolvedPrice.pricePerKwh ?? 999) - (b.resolvedPrice.pricePerKwh ?? 999)
      );

    if (priced.length === 0) return null;

    const cheapest = priced[0];
    const priciest = priced[priced.length - 1];
    const medianStation = priced[Math.floor(priced.length / 2)];

    const cheapestPrice = cheapest.resolvedPrice.pricePerKwh!;
    const medianPrice = medianStation.resolvedPrice.pricePerKwh!;
    const priciestPrice = priciest.resolvedPrice.pricePerKwh!;

    const cheapestEst = estimateChargeSession(cheapestPrice, cheapest.maxPowerKw, vehicle);
    const medianEst = estimateChargeSession(medianPrice, medianStation.maxPowerKw, vehicle);
    const priciestEst = estimateChargeSession(priciestPrice, priciest.maxPowerKw, vehicle);

    const maxSavingsEur =
      priciestEst.estimatedCostEur !== null && cheapestEst.estimatedCostEur !== null
        ? Math.max(
            0,
            Math.round((priciestEst.estimatedCostEur - cheapestEst.estimatedCostEur) * 100) / 100
          )
        : 0;

    return {
      count: priced.length,
      topCheap: priced.slice(0, 4),
      cheapest,
      medianStation,
      priciest,
      cheapestEst,
      medianEst,
      priciestEst,
      maxSavingsEur,
    };
  }, [stations, vehicle]);

  const handleSelectPreset = (presetId: string) => {
    const preset = EV_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onUpdateVehicle({
      ...vehicle,
      name: preset.name,
      batteryKwh: preset.batteryKwh,
      maxDcKw: preset.maxDcKw,
      consumptionKwhPer100: preset.consumptionKwhPer100,
    });
  };

  return (
    <div className="simulator-view">
      {/* Live SoC & Energy Hero */}
      <section className="sim-hero-card">
        <div className="section-heading">
          <BatteryCharging size={18} className="accent-icon" aria-hidden="true" />
          <h2>Simulation de recharge</h2>
        </div>

        <div className="soc-readout-row">
          <div className="soc-pill">
            <span>Départ</span>
            <strong>{vehicle.startSoc}%</strong>
          </div>
          <div className="soc-arrow">→</div>
          <div className="soc-pill target">
            <span>Cible</span>
            <strong>{vehicle.targetSoc}%</strong>
          </div>
          <div className="soc-energy-pill">
            <strong>+{baseEst.energyKwh} kWh</strong>
            <span>~+{baseEst.estimatedRangeKm} km</span>
          </div>
        </div>

        <div className="slider-stack">
          <div className="slider-row">
            <label htmlFor="sim-start-soc">
              Niveau à l’arrivée : <strong>{vehicle.startSoc}%</strong>
            </label>
            <input
              id="sim-start-soc"
              type="range"
              min={0}
              max={90}
              step={5}
              value={vehicle.startSoc}
              style={{ '--progress': startProgress } as React.CSSProperties}
              onChange={(e) => {
                const nextStart = Number(e.target.value);
                onUpdateVehicle({
                  ...vehicle,
                  startSoc: nextStart,
                  targetSoc: Math.max(vehicle.targetSoc, Math.min(100, nextStart + 5)),
                });
              }}
            />
          </div>

          <div className="slider-row">
            <label htmlFor="sim-target-soc">
              Objectif fin de charge : <strong>{vehicle.targetSoc}%</strong>
            </label>
            <input
              id="sim-target-soc"
              type="range"
              min={10}
              max={100}
              step={5}
              value={vehicle.targetSoc}
              style={{ '--progress': targetProgress } as React.CSSProperties}
              onChange={(e) => {
                const nextTarget = Number(e.target.value);
                onUpdateVehicle({
                  ...vehicle,
                  targetSoc: nextTarget,
                  startSoc: Math.min(vehicle.startSoc, Math.max(0, nextTarget - 5)),
                });
              }}
            />
          </div>
        </div>

        <div className="custom-calc-strip">
          <div className="custom-calc-input-wrap">
            <label htmlFor="custom-tariff-input">Tester un tarif (€/kWh)</label>
            <input
              id="custom-tariff-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="3"
              value={customTariff}
              onChange={(e) => setCustomTariff(e.target.value)}
            />
          </div>
          <div className="custom-calc-result">
            <span>Coût du plein partiel</span>
            <strong className="accent-emerald-txt">
              {baseEst.estimatedCostEur !== null
                ? `${baseEst.estimatedCostEur.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} €`
                : '—'}
            </strong>
            <small>
              Domicile ({formatPriceKwh(vehicle.homeTariffPerKwh, true)}) :{' '}
              {baseEst.homeCostEur.toLocaleString('fr-FR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              €
            </small>
          </div>
        </div>
      </section>

      {/* Sector Cost Comparison Ladder */}
      <section className="sim-section-card">
        <div className="section-heading">
          <TrendingDown size={18} style={{ color: 'var(--accent-emerald)' }} aria-hidden="true" />
          <h2>Comparatif autour de {locationLabel}</h2>
        </div>

        {sectorLadder ? (
          <>
            <div className="savings-callout">
              <Sparkles size={16} aria-hidden="true" />
              <span>
                Jusqu’à{' '}
                <strong>
                  {sectorLadder.maxSavingsEur.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  € économisés
                </strong>{' '}
                sur cette recharge ({baseEst.energyKwh} kWh) parmi les {sectorLadder.count} stations
                tarifées !
              </span>
            </div>

            <div className="ladder-grid">
              <div className="ladder-tile cheap">
                <span className="ladder-label">Moins chère</span>
                <strong>
                  {formatPriceKwh(sectorLadder.cheapest.resolvedPrice.pricePerKwh, true)}
                </strong>
                <div className="ladder-cost">
                  {sectorLadder.cheapestEst.estimatedCostEur?.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </div>
                <span className="ladder-brand">{sectorLadder.cheapest.brand}</span>
              </div>

              <div className="ladder-tile mid">
                <span className="ladder-label">Médiane zone</span>
                <strong>
                  {formatPriceKwh(sectorLadder.medianStation.resolvedPrice.pricePerKwh, true)}
                </strong>
                <div className="ladder-cost">
                  {sectorLadder.medianEst.estimatedCostEur?.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </div>
                <span className="ladder-brand">{sectorLadder.medianStation.brand}</span>
              </div>

              <div className="ladder-tile pricey">
                <span className="ladder-label">Plus chère</span>
                <strong>
                  {formatPriceKwh(sectorLadder.priciest.resolvedPrice.pricePerKwh, true)}
                </strong>
                <div className="ladder-cost">
                  {sectorLadder.priciestEst.estimatedCostEur?.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </div>
                <span className="ladder-brand">{sectorLadder.priciest.brand}</span>
              </div>
            </div>

            <div className="top-cheap-list">
              <h3>Meilleurs prix €/kWh à proximité</h3>
              {sectorLadder.topCheap.map((st) => {
                const est = estimateChargeSession(
                  st.resolvedPrice.pricePerKwh,
                  st.maxPowerKw,
                  vehicle
                );
                return (
                  <button
                    key={st.id}
                    type="button"
                    className="top-cheap-row"
                    onClick={() => onSelectStation(st)}
                  >
                    <div className="top-cheap-info">
                      <strong>{st.name}</strong>
                      <span>
                        {st.brand} · {Math.round(st.maxPowerKw)} kW · {st.distanceKm} km
                      </span>
                    </div>
                    <div className="top-cheap-prices">
                      <span className={`tier-price-pill tier-${st.resolvedPrice.tier}`}>
                        {formatPriceKwh(st.resolvedPrice.pricePerKwh, true)}
                      </span>
                      <small>
                        ~
                        {est.estimatedCostEur?.toLocaleString('fr-FR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        € · {est.estimatedMinutes} min
                      </small>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="empty-hint">
            Chargez des stations dans l’onglet Bornes pour comparer les coûts du secteur.
          </p>
        )}
      </section>

      {/* Vehicle Configuration */}
      <section className="sim-section-card">
        <div className="section-heading">
          <Car size={18} style={{ color: 'var(--accent-cyan)' }} aria-hidden="true" />
          <h2>Mon véhicule</h2>
        </div>

        <div className="preset-chips-wrap">
          {EV_PRESETS.map((preset) => {
            const active = vehicle.name === preset.name;
            return (
              <button
                key={preset.id}
                type="button"
                className={`swap-chip-btn${active ? ' active' : ''}`}
                onClick={() => handleSelectPreset(preset.id)}
              >
                {preset.name.split(' (')[0]}
              </button>
            );
          })}
        </div>

        <div className="vehicle-fields-grid">
          <div className="field-group">
            <label htmlFor="veh-battery">Batterie utile (kWh)</label>
            <input
              id="veh-battery"
              type="number"
              min={15}
              max={150}
              step={1}
              value={vehicle.batteryKwh}
              onChange={(e) =>
                onUpdateVehicle({
                  ...vehicle,
                  batteryKwh: Math.max(10, Number(e.target.value) || 60),
                })
              }
            />
          </div>
          <div className="field-group">
            <label htmlFor="veh-max-kw">
              <Gauge size={13} aria-hidden="true" /> Pic DC (kW)
            </label>
            <input
              id="veh-max-kw"
              type="number"
              min={11}
              max={350}
              step={5}
              value={vehicle.maxDcKw}
              onChange={(e) =>
                onUpdateVehicle({
                  ...vehicle,
                  maxDcKw: Math.max(7, Number(e.target.value) || 100),
                })
              }
            />
          </div>
          <div className="field-group">
            <label htmlFor="veh-conso">Conso (kWh/100)</label>
            <input
              id="veh-conso"
              type="number"
              min={8}
              max={35}
              step={0.5}
              value={vehicle.consumptionKwhPer100}
              onChange={(e) =>
                onUpdateVehicle({
                  ...vehicle,
                  consumptionKwhPer100: Math.max(8, Number(e.target.value) || 16),
                })
              }
            />
          </div>
          <div className="field-group">
            <label htmlFor="veh-home">
              <Coins size={13} aria-hidden="true" /> Tarif maison (€/kWh)
            </label>
            <input
              id="veh-home"
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={vehicle.homeTariffPerKwh}
              onChange={(e) =>
                onUpdateVehicle({
                  ...vehicle,
                  homeTariffPerKwh: Math.max(0, Number(e.target.value) || 0.2),
                })
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
};
