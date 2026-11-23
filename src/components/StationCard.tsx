import React from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Heart,
  MapPin,
  Navigation,
  Zap,
} from 'lucide-react';
import { ChargingStation, SortBy, VehicleProfile } from '../types/charging';
import {
  estimateChargeSession,
  estimateTotalCostWithDetour,
  formatPriceKwh,
} from '../utils/tariffParser';

interface StationCardProps {
  station: ChargingStation;
  vehicle: VehicleProfile;
  isFavorite: boolean;
  isCheapest: boolean;
  isLoadingAvailability?: boolean;
  sortBy?: SortBy;
  onSelect: (station: ChargingStation) => void;
  onToggleFavorite: (station: ChargingStation) => void;
}

export const StationCard: React.FC<StationCardProps> = ({
  station,
  vehicle,
  isFavorite,
  isCheapest,
  isLoadingAvailability = false,
  sortBy = 'price',
  onSelect,
  onToggleFavorite,
}) => {
  const { resolvedPrice, availability } = station;
  const sim = estimateChargeSession(
    resolvedPrice.pricePerKwh,
    station.maxPowerKw,
    vehicle
  );
  const detourEst =
    sortBy === 'total_cost' ? estimateTotalCostWithDetour(station, vehicle) : null;

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`;

  return (
    <article
      className={`station-card tier-${resolvedPrice.tier}${
        isCheapest ? ' is-cheapest-card' : ''
      }`}
    >
      <div className="station-card-main" onClick={() => onSelect(station)}>
        <div className={`price-hero-badge tier-${resolvedPrice.tier}`}>
          <div className="price-hero-val">
            {resolvedPrice.pricePerKwh === null
              ? '? €'
              : resolvedPrice.pricePerKwh === 0
              ? '0,00 €'
              : formatPriceKwh(resolvedPrice.pricePerKwh)}
          </div>
          <div className="price-hero-unit">
            {resolvedPrice.pricePerKwh === 0 ? 'GRATUIT' : 'par kWh'}
          </div>
          <div className={`price-source-tag src-${resolvedPrice.source}`}>
            {resolvedPrice.source === 'user' && (
              <CheckCircle2 size={10} aria-hidden="true" />
            )}
            <span>
              {resolvedPrice.source === 'user'
                ? 'Vérifié'
                : resolvedPrice.source === 'subscription'
                ? resolvedPrice.sourceLabel
                : resolvedPrice.source === 'ocpi'
                ? resolvedPrice.sourceLabel
                : resolvedPrice.source === 'irve'
                ? 'IRVE'
                : resolvedPrice.source === 'network'
                ? 'Réf. réseau'
                : 'Inconnu'}
            </span>
          </div>
        </div>

        <div className="station-info-col">
          <div className="station-title-row">
            <span className="station-brand-pill">{station.brand}</span>
            {isCheapest && resolvedPrice.pricePerKwh !== null && (
              <span className="cheapest-pill">★ Moins cher</span>
            )}
            <span className="station-dist">
              <MapPin size={12} aria-hidden="true" />
              {station.routeDetourKm !== undefined ? (
                <>
                  +{station.routeDetourKm.toLocaleString('fr-FR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{' '}
                  km · km {station.alongRouteKm}
                </>
              ) : (
                <>
                  {station.distanceKm.toLocaleString('fr-FR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{' '}
                  km
                </>
              )}
            </span>
          </div>

          <h3 className="station-name">{station.name}</h3>
          {(station.address || station.city) && (
            <p className="station-addr">
              {station.address || station.city}
            </p>
          )}

          <div className="station-chips-row">
            {availability && availability.knownCount > 0 ? (
              <span className={`avail-pill avail-${availability.status}`}>
                <span className="avail-pill-dot" aria-hidden="true" />
                {availability.status === 'available'
                  ? `${availability.availableCount}/${availability.totalCount} libre${
                      availability.availableCount > 1 ? 's' : ''
                    }`
                  : availability.status === 'occupied'
                  ? `Complet (0/${availability.totalCount})`
                  : 'Hors service'}
              </span>
            ) : isLoadingAvailability && station.pdcIds.length > 0 ? (
              <span className="avail-pill avail-loading">Dispo…</span>
            ) : null}
            {station.maxPowerKw > 0 && (
              <span className="spec-chip power-chip">
                <Zap size={12} aria-hidden="true" />
                {Math.round(station.maxPowerKw)} kW
              </span>
            )}
            {station.connectors.map((c) => (
              <span key={c} className="spec-chip">
                {c}
              </span>
            ))}
            <span className="spec-chip">
              {station.pointCount} borne{station.pointCount > 1 ? 's' : ''}
            </span>
            {station.paymentCb && (
              <span className="spec-chip cb-chip">
                <CreditCard size={11} aria-hidden="true" /> CB
              </span>
            )}
            {station.is247 && (
              <span className="spec-chip">
                <Clock size={11} aria-hidden="true" /> 24/7
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="station-sim-strip">
        <button
          type="button"
          className="station-sim-trigger"
          onClick={() => onSelect(station)}
        >
          {detourEst && detourEst.totalEffectiveEur !== null ? (
            <>
              <span className="sim-main-txt">
                Total détour inclus ({detourEst.detourRoundTripKm} km A/R) :{' '}
                <strong>
                  ~
                  {detourEst.totalEffectiveEur.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </strong>
              </span>
              <span className="sim-sub-txt">
                +{detourEst.detourMinutes} min · eff.{' '}
                {formatPriceKwh(detourEst.effectivePricePerKwh)}
              </span>
            </>
          ) : sim.estimatedCostEur !== null ? (
            <>
              <span className="sim-main-txt">
                ⚡ {vehicle.startSoc}%→{vehicle.targetSoc}% ({sim.energyKwh} kWh) :{' '}
                <strong>
                  ~
                  {sim.estimatedCostEur.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  €
                </strong>
              </span>
              <span className="sim-sub-txt">~{sim.estimatedMinutes} min</span>
            </>
          ) : (
            <span className="sim-unknown-txt">
              Prix non publié — appuyez pour noter le tarif vu sur place
            </span>
          )}
        </button>

        <div className="station-quick-actions">
          <button
            type="button"
            className={`icon-action-btn${isFavorite ? ' is-fav' : ''}`}
            onClick={() => onToggleFavorite(station)}
            aria-label={
              isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'
            }
            aria-pressed={isFavorite}
          >
            <Heart
              size={16}
              fill={isFavorite ? 'currentColor' : 'none'}
              aria-hidden="true"
            />
          </button>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-action-btn nav-link-btn"
            aria-label={`Itinéraire GPS vers ${station.name}`}
            title="Ouvrir dans Google Maps"
          >
            <Navigation size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
};
