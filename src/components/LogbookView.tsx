import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Coins,
  Download,
  Heart,
  Navigation,
  Plus,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import {
  ChargeLogEntry,
  FavoriteStation,
  UserPriceOverride,
  VehicleProfile,
} from '../types/charging';
import { formatPriceKwh, getPriceTier } from '../utils/tariffParser';

interface LogbookViewProps {
  logs: ChargeLogEntry[];
  favorites: FavoriteStation[];
  overrides: Record<string, UserPriceOverride>;
  vehicle: VehicleProfile;
  onAddLog: () => void;
  onDeleteLog: (id: string) => void;
  onRemoveFavorite: (stationId: string) => void;
  onLogFromFavorite: (fav: FavoriteStation) => void;
  onDeleteOverride: (stationId: string) => void;
  onUpdateOverride: (stationId: string, newPrice: number) => void;
  onExportJson: () => void;
  onImportJson: (jsonText: string) => void;
}

export const LogbookView: React.FC<LogbookViewProps> = ({
  logs,
  favorites,
  overrides,
  vehicle,
  onAddLog,
  onDeleteLog,
  onRemoveFavorite,
  onLogFromFavorite,
  onDeleteOverride,
  onUpdateOverride,
  onExportJson,
  onImportJson,
}) => {
  const [subTab, setSubTab] = useState<'history' | 'favorites' | 'prices'>('history');
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceVal, setEditingPriceVal] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const overrideList = useMemo(
    () =>
      Object.values(overrides).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      ),
    [overrides]
  );

  const kpis = useMemo(() => {
    const totalEur = logs.reduce((s, l) => s + l.totalEur, 0);
    const totalKwh = logs.reduce((s, l) => s + l.kwh, 0);
    const avgPrice = totalKwh > 0 ? totalEur / totalKwh : 0;
    const costPer100 = avgPrice * vehicle.consumptionKwhPer100;
    return {
      count: logs.length,
      totalEur: Math.round(totalEur * 100) / 100,
      totalKwh: Math.round(totalKwh * 10) / 10,
      avgPrice: Math.round(avgPrice * 1000) / 1000,
      costPer100: Math.round(costPer100 * 100) / 100,
    };
  }, [logs, vehicle.consumptionKwhPer100]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onImportJson(text);
    e.target.value = '';
  };

  return (
    <div className="logbook-view">
      {/* Sub-navigation pills */}
      <div className="segmented-tabs" role="tablist" aria-label="Sections du carnet">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'history'}
          className={`segmented-tab${subTab === 'history' ? ' active' : ''}`}
          onClick={() => setSubTab('history')}
        >
          Historique ({logs.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'favorites'}
          className={`segmented-tab${subTab === 'favorites' ? ' active' : ''}`}
          onClick={() => setSubTab('favorites')}
        >
          Favoris ({favorites.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'prices'}
          className={`segmented-tab${subTab === 'prices' ? ' active' : ''}`}
          onClick={() => setSubTab('prices')}
        >
          Mes Prix ({overrideList.length})
        </button>
      </div>

      {subTab === 'history' && (
        <section className="history-view">
          {/* 4 KPI Stat Tiles */}
          <div className="pr-grid">
            <div className="pr-card">
              <span className="pr-ex-name">Total dépensé</span>
              <div className="pr-main-row">
                <span className="pr-weight">
                  {kpis.totalEur.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span>€</span>
                </span>
              </div>
              <div className="pr-footer-row">
                <span className="pr-date-tag">
                  {kpis.count} recharge{kpis.count > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="pr-card">
              <span className="pr-ex-name">Énergie chargée</span>
              <div className="pr-main-row">
                <span className="pr-weight">
                  {kpis.totalKwh.toLocaleString('fr-FR', {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{' '}
                  <span>kWh</span>
                </span>
              </div>
              <div className="pr-footer-row">
                <span className="pr-date-tag">Cumul local</span>
              </div>
            </div>

            <div className="pr-card">
              <span className="pr-ex-name">Prix moyen réel</span>
              <div className="pr-main-row">
                <span className="pr-weight">
                  {kpis.totalKwh > 0 ? formatPriceKwh(kpis.avgPrice) : '—'}
                </span>
                {kpis.totalKwh > 0 && <span className="pr-reps-tag">/kWh</span>}
              </div>
              <div className="pr-footer-row">
                <span className="e1rm-pill">
                  Maison : {formatPriceKwh(vehicle.homeTariffPerKwh)}
                </span>
              </div>
            </div>

            <div className="pr-card">
              <span className="pr-ex-name">Coût aux 100 km</span>
              <div className="pr-main-row">
                <span className="pr-weight">
                  {kpis.totalKwh > 0
                    ? `${kpis.costPer100.toLocaleString('fr-FR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} `
                    : '—'}
                  {kpis.totalKwh > 0 && <span>€</span>}
                </span>
              </div>
              <div className="pr-footer-row">
                <span className="pr-date-tag">
                  Base {vehicle.consumptionKwhPer100} kWh/100
                </span>
              </div>
            </div>
          </div>

          <div className="logbook-cta-row">
            <button
              type="button"
              className="primary-validate-btn"
              style={{ marginTop: 0 }}
              onClick={onAddLog}
            >
              <Plus size={18} aria-hidden="true" />
              <span>Nouvelle recharge</span>
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="empty-state-card">
              <Coins size={28} aria-hidden="true" />
              <h3>Aucune recharge enregistrée</h3>
              <p>
                Notez vos recharges pour suivre votre prix moyen réel au kWh et votre coût aux 100 km.
              </p>
            </div>
          ) : (
            <div className="session-history-list">
              {logs.map((entry) => {
                const tier = getPriceTier(entry.pricePerKwh);
                return (
                  <article key={entry.id} className="history-session-card">
                    {confirmDeleteLogId === entry.id && (
                      <div className="delete-confirm-strip">
                        <span>Supprimer cette recharge ?</span>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            className="confirm-del-btn"
                            onClick={() => {
                              onDeleteLog(entry.id);
                              setConfirmDeleteLogId(null);
                            }}
                          >
                            Supprimer
                          </button>
                          <button
                            type="button"
                            className="cancel-del-btn"
                            onClick={() => setConfirmDeleteLogId(null)}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="history-session-header">
                      <div>
                        <span className="history-date">📅 {entry.date}</span>
                        <h3>{entry.stationName}</h3>
                        <span className="tier-meta">{entry.operator}</span>
                      </div>

                      <div className="history-header-actions">
                        <span className={`tier-price-pill tier-${tier}`}>
                          {formatPriceKwh(entry.pricePerKwh, true)}
                        </span>
                        <button
                          type="button"
                          className="history-action-btn danger"
                          aria-label="Supprimer cette recharge"
                          onClick={() => setConfirmDeleteLogId(entry.id)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="log-metrics-strip">
                      <span>
                        <Zap size={13} aria-hidden="true" />{' '}
                        <strong>{entry.kwh} kWh</strong>
                      </span>
                      <span>
                        Total :{' '}
                        <strong>
                          {entry.totalEur.toLocaleString('fr-FR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          €
                        </strong>
                      </span>
                      {entry.powerKw ? <span>{entry.powerKw} kW</span> : null}
                    </div>
                    {entry.notes && <p className="log-note-line">{entry.notes}</p>}
                  </article>
                );
              })}
            </div>
          )}

          <div className="backup-bar">
            <button type="button" className="secondary-btn" onClick={onExportJson}>
              <Download size={15} aria-hidden="true" />
              <span>Exporter JSON</span>
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={15} aria-hidden="true" />
              <span>Importer JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="visually-hidden"
              onChange={handleImportFile}
            />
          </div>
        </section>
      )}

      {subTab === 'favorites' && (
        <section className="favorites-list">
          {favorites.length === 0 ? (
            <div className="empty-state-card">
              <Heart size={28} aria-hidden="true" />
              <h3>Aucun favori enregistré</h3>
              <p>
                Appuyez sur le cœur d’une station pour la retrouver ici instantanément, même hors-ligne.
              </p>
            </div>
          ) : (
            favorites.map((fav) => {
              const ov = overrides[fav.id];
              const displayPrice = ov ? ov.pricePerKwh : fav.lastKnownPricePerKwh;
              const tier = getPriceTier(displayPrice);
              const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${fav.lat},${fav.lon}`;

              return (
                <article key={fav.id} className="history-session-card">
                  <div className="history-session-header">
                    <div>
                      <span className="station-brand-pill">{fav.brand}</span>
                      <h3>{fav.name}</h3>
                      <p className="station-addr">{fav.address || fav.city}</p>
                    </div>
                    <span className={`tier-price-pill tier-${tier}`}>
                      {formatPriceKwh(displayPrice, true)}
                    </span>
                  </div>

                  <div className="station-chips-row" style={{ marginBottom: '0.7rem' }}>
                    {fav.maxPowerKw > 0 && (
                      <span className="spec-chip power-chip">
                        <Zap size={12} aria-hidden="true" /> {Math.round(fav.maxPowerKw)} kW
                      </span>
                    )}
                    {fav.connectors.map((c) => (
                      <span key={c} className="spec-chip">
                        {c}
                      </span>
                    ))}
                    {ov && (
                      <span className="spec-chip cb-chip">
                        <CheckCircle2 size={11} aria-hidden="true" /> Vérifié par toi
                      </span>
                    )}
                  </div>

                  <div className="detail-actions-footer">
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="secondary-btn"
                      style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
                    >
                      <Navigation size={14} aria-hidden="true" />
                      <span>Itinéraire</span>
                    </a>
                    <button
                      type="button"
                      className="primary-btn-sm"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => onLogFromFavorite(fav)}
                    >
                      <Plus size={14} aria-hidden="true" />
                      <span>Recharger</span>
                    </button>
                    <button
                      type="button"
                      className="history-action-btn danger"
                      aria-label="Retirer des favoris"
                      onClick={() => onRemoveFavorite(fav.id)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}

      {subTab === 'prices' && (
        <section className="overrides-list">
          {overrideList.length === 0 ? (
            <div className="empty-state-card">
              <CheckCircle2 size={28} aria-hidden="true" />
              <h3>Aucun tarif corrigé</h3>
              <p>
                Quand vous notez le prix réel vu sur une borne, il remplace l’estimation automatiquement.
              </p>
            </div>
          ) : (
            overrideList.map((ov) => {
              const tier = getPriceTier(ov.pricePerKwh, ov.pricePerKwh === 0);
              const isEditing = editingPriceId === ov.stationId;
              return (
                <article key={ov.stationId} className="history-session-card">
                  <div className="history-session-header">
                    <div>
                      <span className="history-date">
                        Vérifié le {ov.updatedAt.slice(0, 10)}
                      </span>
                      <h3>{ov.stationName}</h3>
                      {ov.note && <p className="station-addr">{ov.note}</p>}
                    </div>
                    <div className="history-header-actions">
                      <span className={`tier-price-pill tier-${tier}`}>
                        {formatPriceKwh(ov.pricePerKwh, true)}
                      </span>
                      <button
                        type="button"
                        className="secondary-btn"
                        style={{ padding: '0.35rem 0.6rem' }}
                        onClick={() => {
                          setEditingPriceId(isEditing ? null : ov.stationId);
                          setEditingPriceVal(String(ov.pricePerKwh));
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="history-action-btn danger"
                        aria-label="Supprimer ce tarif vérifié"
                        onClick={() => onDeleteOverride(ov.stationId)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {isEditing && (
                    <form
                      className="inline-edit-override"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = Number.parseFloat(editingPriceVal.replace(',', '.'));
                        if (Number.isFinite(val) && val >= 0 && val <= 3) {
                          onUpdateOverride(ov.stationId, Math.round(val * 1000) / 1000);
                          setEditingPriceId(null);
                        }
                      }}
                    >
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        max="3"
                        value={editingPriceVal}
                        onChange={(e) => setEditingPriceVal(e.target.value)}
                        aria-label="Nouveau tarif €/kWh"
                      />
                      <button type="submit" className="primary-btn-sm">
                        Valider
                      </button>
                    </form>
                  )}
                </article>
              );
            })
          )}
        </section>
      )}
    </div>
  );
};
