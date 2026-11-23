import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Search } from 'lucide-react';
import { ChargingStation, DrivingRoute, GeoLocation } from '../types/charging';
import { formatPriceKwh } from '../utils/tariffParser';
import { clusterStationsByGrid } from '../utils/mapCluster';
import { haversineKm } from '../services/irveApi';

interface StationMapProps {
  center: GeoLocation;
  userGpsPos?: { lat: number; lon: number; accuracy?: number } | null;
  route?: DrivingRoute | null;
  stations: ChargingStation[];
  cheapestPrice: number | null;
  selectedStationId: string | null;
  onSelectStation: (station: ChargingStation) => void;
  onSearchArea: (lat: number, lon: number) => void;
  onRequestGps: () => void;
  isFullHeight?: boolean;
}

export const StationMap: React.FC<StationMapProps> = ({
  center,
  userGpsPos = null,
  route = null,
  stations,
  cheapestPrice,
  selectedStationId,
  onSelectStation,
  onSearchArea,
  onRequestGps,
  isFullHeight = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const gpsLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const centerMarkerRef = useRef<L.CircleMarker | null>(null);
  const onSelectRef = useRef(onSelectStation);
  onSelectRef.current = onSelectStation;

  const queriedCenterRef = useRef<{ lat: number; lon: number }>({
    lat: center.lat,
    lon: center.lon,
  });
  const [movedCenter, setMovedCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [zoom, setZoom] = useState<number>(12);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [center.lat, center.lon],
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    const gpsLayer = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);
    const centerDot = L.circleMarker([center.lat, center.lon], {
      radius: 7,
      color: '#f8fafc',
      weight: 2.5,
      fillColor: '#06b6d4',
      fillOpacity: 1,
    }).addTo(map);

    map.on('zoomend', () => {
      setZoom(Math.round(map.getZoom()));
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      const dist = haversineKm(
        queriedCenterRef.current.lat,
        queriedCenterRef.current.lon,
        c.lat,
        c.lng
      );
      if (dist >= 2.2) {
        setMovedCenter({ lat: c.lat, lon: c.lng });
      } else {
        setMovedCenter(null);
      }
    });

    mapRef.current = map;
    markersLayerRef.current = markersLayer;
    gpsLayerRef.current = gpsLayer;
    routeLayerRef.current = routeLayer;
    centerMarkerRef.current = centerDot;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      gpsLayerRef.current = null;
      routeLayerRef.current = null;
      centerMarkerRef.current = null;
    };
    // Initialize map once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const centerDot = centerMarkerRef.current;
    if (!map || !centerDot) return;

    queriedCenterRef.current = { lat: center.lat, lon: center.lon };
    setMovedCenter(null);
    centerDot.setLatLng([center.lat, center.lon]);
    const hideCenterDot =
      Boolean(route) ||
      (userGpsPos !== null &&
        haversineKm(userGpsPos.lat, userGpsPos.lon, center.lat, center.lon) < 0.2);
    centerDot.setStyle({
      opacity: hideCenterDot ? 0 : 1,
      fillOpacity: hideCenterDot ? 0 : 1,
    });
    if (!route) {
      map.setView([center.lat, center.lon], map.getZoom(), { animate: true });
    }
  }, [center.lat, center.lon, userGpsPos, route]);

  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;

    routeLayer.clearLayers();
    if (!route || route.polyline.length < 2) return;

    L.polyline(route.polyline, {
      color: '#083344',
      weight: 8,
      opacity: 0.72,
    }).addTo(routeLayer);

    L.polyline(route.polyline, {
      color: '#22d3ee',
      weight: 4,
      opacity: 0.95,
    }).addTo(routeLayer);

    L.circleMarker([route.start.lat, route.start.lon], {
      radius: 7,
      color: '#f8fafc',
      weight: 2,
      fillColor: '#10b981',
      fillOpacity: 1,
    })
      .bindTooltip(`Départ : ${route.start.label}`)
      .addTo(routeLayer);

    L.circleMarker([route.end.lat, route.end.lon], {
      radius: 7,
      color: '#f8fafc',
      weight: 2,
      fillColor: '#f43f5e',
      fillOpacity: 1,
    })
      .bindTooltip(`Arrivée : ${route.end.label}`)
      .addTo(routeLayer);

    map.fitBounds(L.latLngBounds(route.polyline), { padding: [36, 36] });
  }, [route]);

  useEffect(() => {
    const gpsLayer = gpsLayerRef.current;
    if (!gpsLayer) return;
    gpsLayer.clearLayers();
    if (!userGpsPos) return;

    const radiusMeters = Math.min(Math.max(userGpsPos.accuracy || 45, 25), 1500);
    L.circle([userGpsPos.lat, userGpsPos.lon], {
      radius: radiusMeters,
      color: '#06b6d4',
      weight: 1,
      opacity: 0.35,
      fillColor: '#06b6d4',
      fillOpacity: 0.1,
      interactive: false,
    }).addTo(gpsLayer);

    const gpsIcon = L.divIcon({
      className: 'gps-user-wrapper',
      html: '<div class="gps-user-dot" aria-hidden="true"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    L.marker([userGpsPos.lat, userGpsPos.lon], {
      icon: gpsIcon,
      zIndexOffset: 900,
      interactive: false,
    }).addTo(gpsLayer);
  }, [userGpsPos]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      const id = window.setTimeout(() => map.invalidateSize(), 60);
      return () => window.clearTimeout(id);
    }
  }, [isFullHeight]);

  useEffect(() => {
    const layer = markersLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    const clusteredItems = clusterStationsByGrid(
      stations.slice(0, 260),
      zoom,
      cheapestPrice,
      selectedStationId,
      58
    );

    // Render expensive/unknown first and cheapest/clusters last so cheapest pills sit on top
    const ordered = [...clusteredItems].sort((a, b) => {
      const pa =
        a.type === 'cluster'
          ? a.minPrice ?? 999
          : a.station.resolvedPrice.pricePerKwh ?? 999;
      const pb =
        b.type === 'cluster'
          ? b.minPrice ?? 999
          : b.station.resolvedPrice.pricePerKwh ?? 999;
      return pb - pa;
    });

    for (const item of ordered) {
      if (item.type === 'cluster') {
        const minText =
          item.minPrice !== null ? `dès ${formatPriceKwh(item.minPrice)}` : `${item.count} bornes`;
        const html = `
          <div class="vp-cluster-pin tier-${item.minPriceTier}${
            item.isCheapest ? ' is-cheapest' : ''
          }">
            ${item.hasAvailable ? '<span class="vp-pin-avail-dot" aria-hidden="true"></span>' : ''}
            <span class="vp-cluster-price">${minText}</span>
            <span class="vp-cluster-count">${item.count}</span>
          </div>
        `;
        const icon = L.divIcon({
          className: 'vp-pin-wrapper',
          html,
          iconSize: [0, 0],
          iconAnchor: [38, 16],
        });
        const marker = L.marker([item.lat, item.lon], {
          icon,
          zIndexOffset: item.isCheapest ? 650 : 200,
          title: `${item.count} stations (${minText}) — cliquer pour zoomer`,
        });
        marker.on('click', () => {
          map.flyTo([item.lat, item.lon], Math.min(15, Math.max(13, zoom + 2)), {
            duration: 0.45,
          });
        });
        marker.addTo(layer);
        continue;
      }

      const { station } = item;
      const price = station.resolvedPrice.pricePerKwh;
      const isCheapest =
        cheapestPrice !== null &&
        price !== null &&
        Math.abs(price - cheapestPrice) < 0.001;
      const isSelected = station.id === selectedStationId;
      const isUserVerified = station.resolvedPrice.source === 'user';
      const showCompact = zoom < 13 && !isSelected;

      const priceText = formatPriceKwh(price);
      const kwText =
        !showCompact && station.maxPowerKw > 0 ? `${Math.round(station.maxPowerKw)}kW` : '';
      const avail = station.availability;
      const availStatus = avail?.status || 'unknown';
      const availText =
        avail && avail.knownCount > 0
          ? avail.status === 'available'
            ? `${avail.availableCount}/${avail.totalCount} libres`
            : avail.status === 'occupied'
            ? 'Complet'
            : 'Hors service'
          : '';

      const html = `
        <div class="vp-pin tier-${station.resolvedPrice.tier} avail-${availStatus}${
          isCheapest ? ' is-cheapest' : ''
        }${isSelected ? ' is-selected' : ''}">
          ${availStatus !== 'unknown' ? '<span class="vp-pin-avail-dot" aria-hidden="true"></span>' : ''}
          <span class="vp-pin-price">${isCheapest ? '★ ' : ''}${priceText}${
            isUserVerified ? ' ✓' : ''
          }</span>
          ${kwText ? `<span class="vp-pin-kw">${kwText}</span>` : ''}
        </div>
      `;

      const icon = L.divIcon({
        className: 'vp-pin-wrapper',
        html,
        iconSize: [0, 0],
        iconAnchor: [34, 16],
      });

      const marker = L.marker([station.lat, station.lon], {
        icon,
        zIndexOffset: isSelected ? 1000 : isCheapest ? 600 : 0,
        title: `${station.name} — ${formatPriceKwh(price, true)}${
          availText ? ` (${availText})` : ''
        }`,
      });

      marker.on('click', () => {
        onSelectRef.current(station);
      });

      marker.addTo(layer);
    }
  }, [stations, cheapestPrice, selectedStationId, zoom]);

  return (
    <div
      className={`map-region${isFullHeight ? ' full-height' : ''}`}
      role="region"
      aria-label="Carte interactive des bornes de recharge et tarifs au kWh"
      tabIndex={0}
    >
      <div ref={containerRef} className="leaflet-host" />

      {movedCenter && !route && (
        <button
          type="button"
          className="map-search-here-btn"
          onClick={() => {
            onSearchArea(movedCenter.lat, movedCenter.lon);
            setMovedCenter(null);
          }}
        >
          <Search size={14} aria-hidden="true" />
          <span>Rechercher ici</span>
        </button>
      )}

      <button
        type="button"
        className="map-gps-fab"
        onClick={onRequestGps}
        aria-label="Recentrer sur ma position GPS"
        title="Ma position GPS"
      >
        <Crosshair size={18} aria-hidden="true" />
      </button>
    </div>
  );
};
