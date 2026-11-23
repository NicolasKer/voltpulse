import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  Crosshair,
  List,
  Map as MapIcon,
  RefreshCw,
  Route,
  Search,
  Settings,
  SlidersHorizontal,
  Ticket,
  X,
  Zap,
} from 'lucide-react';
import {
  ChargeLogEntry,
  ChargingStation,
  DrivingRoute,
  FavoriteStation,
  GeoLocation,
  OcpiTariffEvaluation,
  PdcDynamicStatus,
  PowerMode,
  SearchFilters,
  SortBy,
  UserPriceOverride,
  VehicleProfile,
} from './types/charging';
import {
  applyPricingLayers,
  fetchStationsAlongRoute,
  fetchStationsAround,
  haversineKm,
} from './services/irveApi';
import {
  computeStationAvailability,
  fetchDynamicStatusesForPdcIds,
} from './services/availabilityApi';
import { fetchOcpiTariffIndex } from './services/ocpiTariffApi';
import { fetchDrivingRoute } from './services/routeApi';
import {
  GeocodedPlace,
  QUICK_CITIES,
  reverseGeocodeFrenchPlace,
  searchFrenchPlaces,
} from './services/geocoderApi';
import {
  exportAllDataJson,
  hasSavedLocation,
  importAllDataJson,
  loadActiveSubscriptions,
  loadChargeLogs,
  loadFavorites,
  loadLastLocation,
  loadPriceOverrides,
  loadSearchFilters,
  loadVehicleProfile,
  resetAllLocalData,
  saveActiveSubscriptions,
  saveChargeLogs,
  saveFavorites,
  saveLastLocation,
  savePriceOverrides,
  saveSearchFilters,
  saveVehicleProfile,
} from './services/storage';
import {
  estimateTotalCostWithDetour,
  formatPriceKwh,
} from './utils/tariffParser';
import { StationMap } from './components/StationMap';
import { StationCard } from './components/StationCard';
import { StationDetailModal } from './components/StationDetailModal';
import { SimulatorView } from './components/SimulatorView';
import { LogbookView } from './components/LogbookView';
import { ChargeLogModal, ChargeLogPrefill } from './components/ChargeLogModal';
import { SettingsModal } from './components/SettingsModal';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'stations' | 'simulator' | 'logbook'>('stations');
  const [viewMode, setViewMode] = useState<'split' | 'map' | 'list'>('split');

  const [location, setLocation] = useState<GeoLocation>(() => loadLastLocation());
  const [filters, setFilters] = useState<SearchFilters>(() => loadSearchFilters());
  const [vehicle, setVehicle] = useState<VehicleProfile>(() => loadVehicleProfile());
  const [overrides, setOverrides] = useState<Record<string, UserPriceOverride>>(() =>
    loadPriceOverrides()
  );
  const [favorites, setFavorites] = useState<FavoriteStation[]>(() => loadFavorites());
  const [logs, setLogs] = useState<ChargeLogEntry[]>(() => loadChargeLogs());
  const [activeSubscriptions, setActiveSubscriptions] = useState<string[]>(() =>
    loadActiveSubscriptions()
  );

  const [rawStations, setRawStations] = useState<ChargingStation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState<boolean>(false);
  const [dataSourceLabel, setDataSourceLabel] = useState<string>('IRVE Live');

  // QualiCharge live OCPI tariff index
  const [ocpiIndex, setOcpiIndex] = useState<Record<string, OcpiTariffEvaluation>>({});

  // Search mode: around location vs along route
  const [searchMode, setSearchMode] = useState<'around' | 'route'>('around');
  const [destQuery, setDestQuery] = useState<string>('');
  const [destSuggestions, setDestSuggestions] = useState<GeocodedPlace[]>([]);
  const [isSearchingDest, setIsSearchingDest] = useState<boolean>(false);
  const [corridorKm, setCorridorKm] = useState<number>(5);
  const [activeRoute, setActiveRoute] = useState<DrivingRoute | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Search / Geocoding / Live GPS state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<GeocodedPlace[]>([]);
  const [isSearchingPlace, setIsSearchingPlace] = useState<boolean>(false);
  const [userGpsPos, setUserGpsPos] = useState<{
    lat: number;
    lon: number;
    accuracy?: number;
  } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<
    'idle' | 'locating' | 'active' | 'denied' | 'insecure'
  >('idle');
  const locationRef = useRef<GeoLocation>(location);
  locationRef.current = location;

  // Dynamic availability state
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, PdcDynamicStatus>>({});
  const [isLoadingAvailability, setIsLoadingAvailability] = useState<boolean>(false);
  const [availabilityRefreshTick, setAvailabilityRefreshTick] = useState<number>(0);
  const bypassAvailCacheRef = useRef<boolean>(false);

  // Modals & Selection
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [logModalPrefill, setLogModalPrefill] = useState<ChargeLogPrefill | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // PWA install prompt
  const deferredInstallPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstallApp, setCanInstallApp] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredInstallPromptRef.current = e as BeforeInstallPromptEvent;
      setCanInstallApp(true);
    };
    const onInstalled = () => {
      deferredInstallPromptRef.current = null;
      setCanInstallApp(false);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    const promptEvt = deferredInstallPromptRef.current;
    if (!promptEvt) return;
    deferredInstallPromptRef.current = null;
    await promptEvt.prompt();
    const { outcome } = await promptEvt.userChoice;
    if (outcome === 'accepted') {
      showToast('📲 VoltPulse installée sur votre écran d’accueil !');
      setCanInstallApp(false);
    }
  };

  // Load QualiCharge OCPI live hourly tariffs in background (don't abort shared singleton under StrictMode)
  useEffect(() => {
    let active = true;
    fetchOcpiTariffIndex()
      .then((idx) => {
        if (active) setOcpiIndex(idx);
      })
      .catch(() => {
        // Non-blocking enrichment
      });
    return () => {
      active = false;
    };
  }, []);

  // Load IRVE stations (around location OR along active driving route)
  const loadStations = useCallback(
    async (bypassCache = false) => {
      const controller = new AbortController();
      setIsLoading(true);
      setFetchError(null);
      try {
        if (bypassCache) {
          fetchOcpiTariffIndex(controller.signal, true)
            .then((idx) => setOcpiIndex(idx))
            .catch(() => {});
        }
        const res =
          searchMode === 'route' && activeRoute
            ? await fetchStationsAlongRoute(
                activeRoute,
                corridorKm,
                filters.powerMode,
                controller.signal
              )
            : await fetchStationsAround(
                location.lat,
                location.lon,
                filters.radiusKm,
                filters.powerMode,
                controller.signal,
                bypassCache
              );
        setRawStations(res.stations);
        setIsTruncated(res.truncated);
        setDataSourceLabel(res.fromCache ? 'Cache' : 'Live');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFetchError(
          err instanceof Error
            ? err.message
            : 'Impossible de joindre la base nationale IRVE.'
        );
        setDataSourceLabel('Hors-ligne');
      } finally {
        setIsLoading(false);
      }
      return () => controller.abort();
    },
    [
      searchMode,
      activeRoute,
      corridorKm,
      location.lat,
      location.lon,
      filters.radiusKm,
      filters.powerMode,
    ]
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const run = async () => {
      if (searchMode === 'route' && !activeRoute) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setFetchError(null);
      try {
        const res =
          searchMode === 'route' && activeRoute
            ? await fetchStationsAlongRoute(
                activeRoute,
                corridorKm,
                filters.powerMode,
                controller.signal
              )
            : await fetchStationsAround(
                location.lat,
                location.lon,
                filters.radiusKm,
                filters.powerMode,
                controller.signal
              );
        if (!active) return;
        setRawStations(res.stations);
        setIsTruncated(res.truncated);
        setDataSourceLabel(res.fromCache ? 'Cache' : 'Live');
      } catch (err) {
        if (!active || (err instanceof DOMException && err.name === 'AbortError')) return;
        setFetchError(
          err instanceof Error
            ? err.message
            : 'Impossible de charger les bornes IRVE.'
        );
        setDataSourceLabel('Hors-ligne');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    searchMode,
    activeRoute,
    corridorKm,
    location.lat,
    location.lon,
    filters.radiusKm,
    filters.powerMode,
  ]);

  // Debounced IGN destination autocomplete (for "Sur mon trajet" mode)
  useEffect(() => {
    const q = destQuery.trim();
    if (q.length < 2) {
      setDestSuggestions([]);
      setIsSearchingDest(false);
      return;
    }
    const controller = new AbortController();
    setIsSearchingDest(true);
    const timer = window.setTimeout(async () => {
      try {
        const places = await searchFrenchPlaces(q, controller.signal);
        setDestSuggestions(places);
      } catch {
        setDestSuggestions([]);
      } finally {
        setIsSearchingDest(false);
      }
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [destQuery]);

  // Debounced IGN place autocomplete
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setIsSearchingPlace(false);
      return;
    }

    const controller = new AbortController();
    setIsSearchingPlace(true);
    const timer = window.setTimeout(async () => {
      try {
        const places = await searchFrenchPlaces(q, controller.signal);
        setSuggestions(places);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearchingPlace(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Persist user changes
  const updateLocation = useCallback((next: GeoLocation) => {
    setLocation(next);
    saveLastLocation(next);
  }, []);

  const updateFilters = (next: SearchFilters) => {
    setFilters(next);
    saveSearchFilters(next);
  };

  const updateVehicle = (next: VehicleProfile) => {
    setVehicle(next);
    saveVehicleProfile(next);
  };

  const handleToggleSubscription = (planId: string) => {
    setActiveSubscriptions((prev) => {
      const next = prev.includes(planId)
        ? prev.filter((id) => id !== planId)
        : [...prev, planId];
      saveActiveSubscriptions(next);
      return next;
    });
  };

  const handleComputeRoute = async (explicitDest?: GeoLocation) => {
    setRouteError(null);
    let dest = explicitDest || null;
    if (!dest) {
      const trimmed = destQuery.trim();
      if (trimmed.length < 2) {
        setRouteError('Indiquez une ville ou adresse de destination.');
        return;
      }
      if (destSuggestions.length > 0) {
        const top = destSuggestions[0];
        dest = {
          lat: top.lat,
          lon: top.lon,
          label: top.city || top.label,
          source: 'search',
        };
      } else {
        setIsLoadingRoute(true);
        try {
          const found = await searchFrenchPlaces(trimmed);
          if (found.length === 0) {
            setIsLoadingRoute(false);
            setRouteError('Destination introuvable en France.');
            return;
          }
          dest = {
            lat: found[0].lat,
            lon: found[0].lon,
            label: found[0].city || found[0].label,
            source: 'search',
          };
        } catch {
          setIsLoadingRoute(false);
          setRouteError('Erreur lors de la recherche de destination.');
          return;
        }
      }
    }

    setDestSuggestions([]);
    setDestQuery(dest.label);
    setIsLoadingRoute(true);
    try {
      const route = await fetchDrivingRoute(location, dest);
      setActiveRoute(route);
      setSearchMode('route');
      showToast(`🛣️ Trajet tracé : ${route.distanceKm} km (~${route.durationMin} min)`);
    } catch (err) {
      setRouteError(
        err instanceof Error ? err.message : 'Impossible de calculer le trajet.'
      );
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const handleClearRoute = () => {
    setActiveRoute(null);
    setDestQuery('');
    setDestSuggestions([]);
    setRouteError(null);
    setSearchMode('around');
    if (filters.sortBy === 'route_order') {
      updateFilters({ ...filters, sortBy: 'price' });
    }
  };

  const applyGpsCoords = useCallback(
    async (lat: number, lon: number, accuracy: number | undefined, notify: boolean) => {
      setUserGpsPos({ lat, lon, accuracy });
      setGpsStatus('active');
      updateLocation({
        lat,
        lon,
        label: 'Ma position',
        source: 'gps',
      });
      if (notify) {
        showToast('📍 Position GPS détectée');
      }
      const city = await reverseGeocodeFrenchPlace(lat, lon);
      if (city && locationRef.current.source === 'gps') {
        updateLocation({
          lat,
          lon,
          label: `${city} (GPS)`,
          source: 'gps',
        });
      }
    },
    [showToast, updateLocation]
  );

  const requestGps = useCallback(
    (silent = false) => {
      if (!('geolocation' in navigator)) {
        setGpsStatus('denied');
        if (!silent) {
          showToast('Géolocalisation non disponible sur ce navigateur.');
        }
        return;
      }
      if (!window.isSecureContext) {
        setGpsStatus('insecure');
        if (!silent) {
          showToast('GPS bloqué hors HTTPS (utilisez localhost ou HTTPS).');
        }
        return;
      }
      setGpsStatus('locating');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void applyGpsCoords(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy,
            !silent
          );
        },
        (err) => {
          setGpsStatus(err.code === 1 ? 'denied' : 'idle');
          if (!silent) {
            showToast(
              err.code === 1
                ? 'Accès GPS refusé — autorisez la localisation ou choisissez une ville.'
                : 'Position GPS indisponible pour le moment.'
            );
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    },
    [applyGpsCoords, showToast]
  );

  // Auto-geolocate on startup when permitted or on first visit
  useEffect(() => {
    if (!window.isSecureContext || !('geolocation' in navigator)) return;
    const savedAlready = hasSavedLocation();
    const prefersGps = locationRef.current.source === 'gps';

    if ('permissions' in navigator && typeof navigator.permissions.query === 'function') {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((perm) => {
          if (
            perm.state === 'granted' ||
            (!savedAlready && perm.state === 'prompt') ||
            (prefersGps && perm.state === 'prompt')
          ) {
            requestGps(true);
          }
        })
        .catch(() => {
          if (!savedAlready || prefersGps) requestGps(true);
        });
    } else if (!savedAlready || prefersGps) {
      requestGps(true);
    }
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch position continuously while user is in GPS mode
  useEffect(() => {
    if (
      location.source !== 'gps' ||
      gpsStatus !== 'active' ||
      !window.isSecureContext ||
      !('geolocation' in navigator)
    ) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const nextLat = pos.coords.latitude;
        const nextLon = pos.coords.longitude;
        setUserGpsPos({
          lat: nextLat,
          lon: nextLon,
          accuracy: pos.coords.accuracy,
        });
        const movedKm = haversineKm(
          locationRef.current.lat,
          locationRef.current.lon,
          nextLat,
          nextLon
        );
        if (movedKm >= 0.5) {
          void applyGpsCoords(nextLat, nextLon, pos.coords.accuracy, false);
        }
      },
      () => {
        // Ignore transient watch timeouts
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [location.source, gpsStatus, applyGpsCoords]);

  // Progressive dynamic availability fetch for loaded stations
  useEffect(() => {
    if (rawStations.length === 0) {
      setIsLoadingAvailability(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const prioritizedPdcIds = [...rawStations]
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .flatMap((s) => s.pdcIds);

    if (prioritizedPdcIds.length === 0) {
      setIsLoadingAvailability(false);
      return;
    }

    const bypass = bypassAvailCacheRef.current;
    bypassAvailCacheRef.current = false;

    const run = async () => {
      setIsLoadingAvailability(true);
      try {
        const fetched = await fetchDynamicStatusesForPdcIds(
          prioritizedPdcIds,
          controller.signal,
          bypass
        );
        if (!active) return;
        setAvailabilityMap((prev) => ({ ...prev, ...fetched }));
      } catch {
        // Fail silently: station list & pricing remain usable without dynamic feed
      } finally {
        if (active) setIsLoadingAvailability(false);
      }
    };

    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [rawStations, availabilityRefreshTick]);

  const handleRefreshStationAvailability = useCallback(
    async (station: ChargingStation) => {
      if (station.pdcIds.length === 0) return;
      try {
        const fetched = await fetchDynamicStatusesForPdcIds(
          station.pdcIds,
          undefined,
          true
        );
        setAvailabilityMap((prev) => ({ ...prev, ...fetched }));
        showToast('🔄 Disponibilité mise à jour');
      } catch {
        showToast('Impossible d’actualiser la disponibilité pour le moment.');
      }
    },
    [showToast]
  );

  // Apply user price overrides + active subscriptions + OCPI + live dynamic availability + client filters + sorting
  const stationsEnriched = useMemo(() => {
    const withPricing = applyPricingLayers(
      rawStations,
      overrides,
      activeSubscriptions,
      ocpiIndex
    );
    return withPricing.map((st) => ({
      ...st,
      availability: computeStationAvailability(st, availabilityMap),
    }));
  }, [rawStations, overrides, activeSubscriptions, ocpiIndex, availabilityMap]);

  const visibleStations = useMemo(() => {
    const isRouteActive = searchMode === 'route' && Boolean(activeRoute);
    const filtered = stationsEnriched.filter((st) => {
      if (!isRouteActive && st.distanceKm > filters.radiusKm) return false;
      if (
        filters.publicOnly &&
        /r[eé]serv[eé]|priv[eé]/i.test(st.conditionAcces)
      ) {
        return false;
      }
      if (filters.cbOnly && !st.paymentCb) return false;
      if (filters.knownPriceOnly && st.resolvedPrice.pricePerKwh === null) {
        return false;
      }
      if (filters.availableOnly && st.availability?.status !== 'available') {
        return false;
      }
      if (
        filters.maxPricePerKwh !== null &&
        (st.resolvedPrice.pricePerKwh === null ||
          st.resolvedPrice.pricePerKwh > filters.maxPricePerKwh)
      ) {
        return false;
      }
      return true;
    });

    const totalCostCache = new Map<string, number | null>();
    if (filters.sortBy === 'total_cost') {
      for (const st of filtered) {
        totalCostCache.set(st.id, estimateTotalCostWithDetour(st, vehicle).totalEffectiveEur);
      }
    }

    filtered.sort((a, b) => {
      if (filters.sortBy === 'price') {
        const pa = a.resolvedPrice.pricePerKwh;
        const pb = b.resolvedPrice.pricePerKwh;
        if (pa !== null && pb !== null && pa !== pb) return pa - pb;
        if (pa !== null && pb === null) return -1;
        if (pa === null && pb !== null) return 1;
        return (a.routeDetourKm ?? a.distanceKm) - (b.routeDetourKm ?? b.distanceKm);
      }
      if (filters.sortBy === 'total_cost') {
        const ta = totalCostCache.get(a.id) ?? null;
        const tb = totalCostCache.get(b.id) ?? null;
        if (ta !== null && tb !== null && ta !== tb) return ta - tb;
        if (ta !== null && tb === null) return -1;
        if (ta === null && tb !== null) return 1;
        return (a.routeDetourKm ?? a.distanceKm) - (b.routeDetourKm ?? b.distanceKm);
      }
      if (filters.sortBy === 'route_order') {
        return (a.alongRouteKm ?? a.distanceKm) - (b.alongRouteKm ?? b.distanceKm);
      }
      if (filters.sortBy === 'power') {
        if (b.maxPowerKw !== a.maxPowerKw) return b.maxPowerKw - a.maxPowerKw;
        return (a.routeDetourKm ?? a.distanceKm) - (b.routeDetourKm ?? b.distanceKm);
      }
      return (a.routeDetourKm ?? a.distanceKm) - (b.routeDetourKm ?? b.distanceKm);
    });

    return filtered;
  }, [stationsEnriched, filters, searchMode, activeRoute, vehicle]);

  const sectorStats = useMemo(() => {
    const prices = visibleStations
      .map((s) => s.resolvedPrice.pricePerKwh)
      .filter((p): p is number => p !== null);
    const availableStationsCount = visibleStations.filter(
      (s) => s.availability?.status === 'available'
    ).length;
    const knownAvailCount = visibleStations.filter(
      (s) => (s.availability?.knownCount ?? 0) > 0
    ).length;

    if (prices.length === 0) {
      return {
        cheapest: null as number | null,
        average: null as number | null,
        availableStationsCount,
        knownAvailCount,
      };
    }
    const cheapest = Math.min(...prices);
    const average =
      Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 1000) / 1000;
    return { cheapest, average, availableStationsCount, knownAvailCount };
  }, [visibleStations]);

  const selectedStation = useMemo(
    () => stationsEnriched.find((s) => s.id === selectedStationId) || null,
    [stationsEnriched, selectedStationId]
  );

  const favoriteIds = useMemo(
    () => new Set(favorites.map((f) => f.id)),
    [favorites]
  );

  const handleToggleFavorite = (station: ChargingStation) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === station.id);
      const next = exists
        ? prev.filter((f) => f.id !== station.id)
        : [
            {
              id: station.id,
              name: station.name,
              brand: station.brand,
              operator: station.operator,
              address: station.address,
              city: station.city,
              lat: station.lat,
              lon: station.lon,
              maxPowerKw: station.maxPowerKw,
              connectors: station.connectors,
              lastKnownPricePerKwh: station.resolvedPrice.pricePerKwh,
              lastKnownSource: station.resolvedPrice.source,
              savedAt: new Date().toISOString(),
            },
            ...prev,
          ];
      saveFavorites(next);
      showToast(exists ? 'Retirée des favoris' : '❤️ Borne ajoutée aux favoris');
      return next;
    });
  };

  const handleSaveOverride = (
    station: ChargingStation,
    pricePerKwh: number,
    note: string
  ) => {
    const next: Record<string, UserPriceOverride> = {
      ...overrides,
      [station.id]: {
        stationId: station.id,
        stationName: station.name,
        pricePerKwh,
        note: note || undefined,
        updatedAt: new Date().toISOString(),
      },
    };
    setOverrides(next);
    savePriceOverrides(next);
    showToast(`✓ Tarif vérifié enregistré : ${formatPriceKwh(pricePerKwh, true)}`);
  };

  const handleDeleteOverride = (stationId: string) => {
    const next = { ...overrides };
    delete next[stationId];
    setOverrides(next);
    savePriceOverrides(next);
    showToast('Tarif réinitialisé sur la référence IRVE/réseau');
  };

  const handleSaveChargeLog = (
    entryData: Omit<ChargeLogEntry, 'id'>,
    alsoSaveOverride: boolean
  ) => {
    const entry: ChargeLogEntry = {
      ...entryData,
      id: `chg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    const nextLogs = [entry, ...logs];
    setLogs(nextLogs);
    saveChargeLogs(nextLogs);

    if (alsoSaveOverride && entry.stationId) {
      const nextOv: Record<string, UserPriceOverride> = {
        ...overrides,
        [entry.stationId]: {
          stationId: entry.stationId,
          stationName: entry.stationName,
          pricePerKwh: entry.pricePerKwh,
          note: entry.notes || 'Relevé depuis une recharge',
          updatedAt: new Date().toISOString(),
        },
      };
      setOverrides(nextOv);
      savePriceOverrides(nextOv);
    }

    showToast('⚡ Recharge ajoutée à votre carnet');
  };

  const handleDeleteLog = (id: string) => {
    const next = logs.filter((l) => l.id !== id);
    setLogs(next);
    saveChargeLogs(next);
    showToast('Recharge supprimée');
  };

  const handleExportJson = () => {
    const json = exportAllDataJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voltpulse-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('💾 Sauvegarde JSON téléchargée');
  };

  const handleImportJson = (text: string) => {
    try {
      const restored = importAllDataJson(text);
      setVehicle(restored.vehicle);
      setOverrides(restored.overrides);
      setFavorites(restored.favorites);
      setLogs(restored.logs);
      setActiveSubscriptions(restored.subscriptions || []);
      showToast('✅ Sauvegarde importée avec succès');
    } catch {
      showToast('❌ Fichier JSON invalide');
    }
  };

  const handleResetAll = () => {
    resetAllLocalData();
    setVehicle(loadVehicleProfile());
    setOverrides({});
    setFavorites([]);
    setLogs([]);
    setActiveSubscriptions([]);
    setFilters(loadSearchFilters());
    showToast('Données locales réinitialisées');
  };

  const topbarLocationLabel =
    searchMode === 'route' && activeRoute
      ? `${activeRoute.start.label.replace(' (GPS)', '')} → ${activeRoute.end.label}`
      : location.label.replace(' (GPS)', ' · GPS');

  return (
    <div className="app-shell">
      {/* Compact Sticky Top App Bar (<12% height) */}
      <header className="app-topbar">
        <div className="brand-block">
          <div className="brand-logo" aria-hidden="true">
            <Zap size={19} strokeWidth={2.5} />
          </div>
          <div className="brand-text-col">
            <div className="brand-name">VoltPulse</div>
            <div className="brand-sub">{topbarLocationLabel}</div>
          </div>
        </div>

        <div className="topbar-actions">
          <span
            className={`conn-badge${fetchError ? '' : ' live'}`}
            title="Source des données IRVE"
          >
            <span className="status-dot" aria-hidden="true" />
            <span>
              <span className="conn-prefix">IRVE </span>
              {isLoading ? 'Sync…' : dataSourceLabel}
            </span>
          </span>
          <button
            type="button"
            className="icon-ghost-btn"
            onClick={() => {
              bypassAvailCacheRef.current = true;
              setAvailabilityRefreshTick((t) => t + 1);
              void loadStations(true);
            }}
            aria-label="Actualiser les bornes et disponibilités"
            title="Actualiser"
          >
            <RefreshCw
              size={17}
              className={isLoading || isLoadingAvailability ? 'spin' : ''}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="icon-ghost-btn"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Paramètres et sources"
            title="Paramètres"
          >
            <Settings size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="app-content">
        {activeTab === 'stations' && (
          <div className="stations-view">
            {/* Location Search / Route Corridor Mode */}
            <section className="search-panel" aria-label="Recherche de lieu ou trajet">
              <div className="mode-switch-tabs" role="tablist" aria-label="Mode de recherche">
                <button
                  type="button"
                  role="tab"
                  aria-selected={searchMode === 'around'}
                  className={`mode-switch-tab${searchMode === 'around' ? ' active' : ''}`}
                  onClick={() => setSearchMode('around')}
                >
                  Autour d’un lieu
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={searchMode === 'route'}
                  className={`mode-switch-tab${searchMode === 'route' ? ' active' : ''}`}
                  onClick={() => setSearchMode('route')}
                >
                  <Route size={14} aria-hidden="true" />
                  <span>Sur mon trajet</span>
                </button>
              </div>

              {searchMode === 'around' ? (
                <>
                  <div className="search-input-row">
                    <div className="search-field-wrap">
                      <Search size={16} className="search-icon" aria-hidden="true" />
                      <input
                        type="search"
                        placeholder="Ville ou code postal…"
                        aria-label="Rechercher une ville ou adresse en France"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          className="search-clear-btn"
                          onClick={() => {
                            setSearchQuery('');
                            setSuggestions([]);
                          }}
                          aria-label="Effacer la recherche"
                        >
                          <X size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      className={`gps-pill-btn${
                        location.source === 'gps' && gpsStatus === 'active' ? ' active' : ''
                      }`}
                      onClick={() => requestGps(false)}
                      disabled={gpsStatus === 'locating'}
                      aria-label="Me géolocaliser en temps réel"
                      aria-pressed={location.source === 'gps' && gpsStatus === 'active'}
                    >
                      <Crosshair
                        size={16}
                        className={gpsStatus === 'locating' ? 'spin' : ''}
                        aria-hidden="true"
                      />
                      <span>
                        {gpsStatus === 'locating'
                          ? 'GPS…'
                          : location.source === 'gps' && gpsStatus === 'active'
                          ? 'GPS actif'
                          : 'GPS'}
                      </span>
                    </button>
                  </div>

                  {(suggestions.length > 0 || isSearchingPlace) && (
                    <div className="autocomplete-dropdown" role="listbox" aria-label="Suggestions de lieux">
                      {isSearchingPlace && suggestions.length === 0 ? (
                        <div className="autocomplete-loading">Recherche d’adresse…</div>
                      ) : (
                        suggestions.map((place) => (
                          <button
                            key={`${place.label}_${place.lat}_${place.lon}`}
                            type="button"
                            role="option"
                            className="autocomplete-item"
                            onClick={() => {
                              updateLocation({
                                lat: place.lat,
                                lon: place.lon,
                                label: place.city || place.label,
                                source: 'search',
                              });
                              setSearchQuery('');
                              setSuggestions([]);
                            }}
                          >
                            <strong>{place.label}</strong>
                            {place.context && <span>{place.context}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  <div className="quick-cities-rail" aria-label="Villes rapides">
                    {QUICK_CITIES.map((city) => {
                      const active = location.source !== 'gps' && location.label === city.label;
                      return (
                        <button
                          key={city.label}
                          type="button"
                          className={`city-chip${active ? ' active' : ''}`}
                          onClick={() => updateLocation(city)}
                        >
                          {city.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="route-form-card">
                  <div className="route-origin-row">
                    <span>
                      Départ : <strong>{location.label}</strong>
                    </span>
                    <button
                      type="button"
                      className="discard-draft-btn"
                      onClick={() => requestGps(false)}
                    >
                      <Crosshair size={12} aria-hidden="true" /> Ma position
                    </button>
                  </div>

                  <form
                    className="route-dest-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleComputeRoute();
                    }}
                  >
                    <div className="search-field-wrap" style={{ position: 'relative' }}>
                      <Search size={16} className="search-icon" aria-hidden="true" />
                      <input
                        type="search"
                        placeholder="Destination (ex. Nantes, Paris)…"
                        aria-label="Destination du trajet"
                        value={destQuery}
                        onChange={(e) => setDestQuery(e.target.value)}
                      />
                    </div>

                    <select
                      aria-label="Corridor max autour du trajet"
                      className="compact-select"
                      value={corridorKm}
                      onChange={(e) => setCorridorKm(Number(e.target.value))}
                    >
                      <option value={3}>± 3 km</option>
                      <option value={5}>± 5 km</option>
                      <option value={10}>± 10 km</option>
                    </select>

                    <button
                      type="submit"
                      className="primary-btn-sm"
                      disabled={isLoadingRoute}
                    >
                      {isLoadingRoute ? 'Calcul…' : 'Tracer'}
                    </button>
                  </form>

                  {(destSuggestions.length > 0 || isSearchingDest) && (
                    <div
                      className="autocomplete-dropdown"
                      style={{ position: 'static', marginTop: '0.4rem' }}
                      role="listbox"
                      aria-label="Suggestions de destination"
                    >
                      {isSearchingDest && destSuggestions.length === 0 ? (
                        <div className="autocomplete-loading">Recherche destination…</div>
                      ) : (
                        destSuggestions.map((place) => (
                          <button
                            key={`${place.label}_${place.lat}_${place.lon}`}
                            type="button"
                            role="option"
                            className="autocomplete-item"
                            onClick={() => {
                              void handleComputeRoute({
                                lat: place.lat,
                                lon: place.lon,
                                label: place.city || place.label,
                                source: 'search',
                              });
                            }}
                          >
                            <strong>{place.label}</strong>
                            {place.context && <span>{place.context}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {routeError && <p className="field-error-text" style={{ marginTop: '0.45rem', marginBottom: 0 }}>{routeError}</p>}

                  {activeRoute && (
                    <div className="route-summary-bar">
                      <span>
                        🛣️ <strong>{activeRoute.start.label}</strong> →{' '}
                        <strong>{activeRoute.end.label}</strong> · {activeRoute.distanceKm} km (~
                        {Math.floor(activeRoute.durationMin / 60)}h
                        {String(activeRoute.durationMin % 60).padStart(2, '0')})
                      </span>
                      <button
                        type="button"
                        className="discard-draft-btn"
                        onClick={handleClearRoute}
                      >
                        Quitter
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Power & Price Filters */}
            <section className="filters-panel" aria-label="Filtres de puissance et tarifs">
              <div className="power-pills-row">
                {(
                  [
                    { id: 'ccs50', label: 'CCS ≥ 50 kW' },
                    { id: 'ccs150', label: 'Ultra ≥ 150 kW' },
                    { id: 'ac', label: 'Type 2 AC' },
                    { id: 'all', label: 'Toutes' },
                  ] as { id: PowerMode; label: string }[]
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`power-pill${filters.powerMode === mode.id ? ' active' : ''}`}
                    aria-pressed={filters.powerMode === mode.id}
                    onClick={() => updateFilters({ ...filters, powerMode: mode.id })}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="secondary-filters-row">
                {searchMode === 'around' && (
                  <select
                    aria-label="Rayon de recherche"
                    className="compact-select"
                    value={filters.radiusKm}
                    onChange={(e) =>
                      updateFilters({ ...filters, radiusKm: Number(e.target.value) })
                    }
                  >
                    <option value={5}>Rayon 5 km</option>
                    <option value={15}>Rayon 15 km</option>
                    <option value={30}>Rayon 30 km</option>
                    <option value={50}>Rayon 50 km</option>
                  </select>
                )}

                <select
                  aria-label="Trier les bornes"
                  className="compact-select"
                  value={filters.sortBy}
                  onChange={(e) =>
                    updateFilters({ ...filters, sortBy: e.target.value as SortBy })
                  }
                >
                  <option value="price">Tri : Prix €/kWh ↑</option>
                  <option value="total_cost">Tri : Coût total (détour)</option>
                  {searchMode === 'route' && activeRoute && (
                    <option value="route_order">Tri : Ordre du trajet</option>
                  )}
                  <option value="distance">Tri : Distance ↑</option>
                  <option value="power">Tri : Puissance ↓</option>
                </select>

                <button
                  type="button"
                  className={`filter-toggle-chip${filters.maxPricePerKwh === 0.4 ? ' active' : ''}`}
                  aria-pressed={filters.maxPricePerKwh === 0.4}
                  onClick={() =>
                    updateFilters({
                      ...filters,
                      maxPricePerKwh: filters.maxPricePerKwh === 0.4 ? null : 0.4,
                    })
                  }
                >
                  ≤ 0,40 €
                </button>

                <button
                  type="button"
                  className={`filter-toggle-chip${filters.cbOnly ? ' active' : ''}`}
                  aria-pressed={filters.cbOnly}
                  onClick={() => updateFilters({ ...filters, cbOnly: !filters.cbOnly })}
                >
                  CB
                </button>

                <button
                  type="button"
                  className={`filter-toggle-chip${filters.knownPriceOnly ? ' active' : ''}`}
                  aria-pressed={filters.knownPriceOnly}
                  onClick={() =>
                    updateFilters({
                      ...filters,
                      knownPriceOnly: !filters.knownPriceOnly,
                    })
                  }
                >
                  Prix connu
                </button>

                <button
                  type="button"
                  className={`filter-toggle-chip avail-filter-chip${
                    filters.availableOnly ? ' active' : ''
                  }`}
                  aria-pressed={filters.availableOnly}
                  onClick={() =>
                    updateFilters({
                      ...filters,
                      availableOnly: !filters.availableOnly,
                    })
                  }
                >
                  <span className="avail-chip-dot" aria-hidden="true" />
                  <span>Dispo</span>
                </button>

                <button
                  type="button"
                  className={`filter-toggle-chip subs-shortcut-chip${
                    activeSubscriptions.length > 0 ? ' active' : ''
                  }`}
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <Ticket size={13} aria-hidden="true" />
                  <span>
                    Abos{activeSubscriptions.length > 0 ? ` (${activeSubscriptions.length})` : ''}
                  </span>
                </button>
              </div>
            </section>

            {/* Summary & View Mode Switcher */}
            <div className="results-toolbar">
              <div className="results-summary">
                <strong>
                  {visibleStations.length} station{visibleStations.length > 1 ? 's' : ''}
                </strong>
                {sectorStats.cheapest !== null && (
                  <span className="summary-price-highlight">
                    · dès <strong>{formatPriceKwh(sectorStats.cheapest, true)}</strong>
                  </span>
                )}
                {sectorStats.knownAvailCount > 0 ? (
                  <span className="summary-avail-highlight">
                    · <strong>{sectorStats.availableStationsCount} dispo</strong>
                  </span>
                ) : isLoadingAvailability && visibleStations.length > 0 ? (
                  <span className="summary-avg-muted">· Dispo…</span>
                ) : null}
                {sectorStats.average !== null && (
                  <span className="summary-avg-muted">
                    (moy. {formatPriceKwh(sectorStats.average)})
                  </span>
                )}
              </div>

              <div className="view-mode-switch" role="group" aria-label="Mode d'affichage">
                <button
                  type="button"
                  className={`view-mode-btn${viewMode === 'split' ? ' active' : ''}`}
                  onClick={() => setViewMode('split')}
                  title="Carte + Liste"
                >
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  <span>Mix</span>
                </button>
                <button
                  type="button"
                  className={`view-mode-btn${viewMode === 'map' ? ' active' : ''}`}
                  onClick={() => setViewMode('map')}
                  title="Carte uniquement"
                >
                  <MapIcon size={14} aria-hidden="true" />
                  <span>Carte</span>
                </button>
                <button
                  type="button"
                  className={`view-mode-btn${viewMode === 'list' ? ' active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="Liste uniquement"
                >
                  <List size={14} aria-hidden="true" />
                  <span>Liste</span>
                </button>
              </div>
            </div>

            {isTruncated && (
              <p className="truncated-hint">
                Zone très dense : les 800 premiers points de charge du secteur sont affichés. Zoomez ou réduisez le rayon.
              </p>
            )}

            {fetchError && (
              <div className="error-banner" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <div>
                  <strong>Erreur réseau IRVE</strong>
                  <p>{fetchError}</p>
                </div>
                <button
                  type="button"
                  className="primary-btn-sm"
                  onClick={() => loadStations(true)}
                >
                  Réessayer
                </button>
              </div>
            )}

            {/* Map */}
            {viewMode !== 'list' && (
              <StationMap
                center={location}
                userGpsPos={userGpsPos}
                route={searchMode === 'route' ? activeRoute : null}
                stations={visibleStations}
                cheapestPrice={sectorStats.cheapest}
                selectedStationId={selectedStationId}
                onSelectStation={(st) => setSelectedStationId(st.id)}
                onSearchArea={(lat, lon) =>
                  updateLocation({ lat, lon, label: 'Zone carte', source: 'map' })
                }
                onRequestGps={() => requestGps(false)}
                isFullHeight={viewMode === 'map'}
              />
            )}

            {/* Stations List */}
            {viewMode !== 'map' && (
              <section className="station-list" aria-label="Liste des stations triées">
                {isLoading && visibleStations.length === 0 ? (
                  <div className="loading-skeleton-stack">
                    <div className="skeleton-card" />
                    <div className="skeleton-card" />
                    <div className="skeleton-card" />
                  </div>
                ) : visibleStations.length === 0 ? (
                  <div className="empty-state-card">
                    <Zap size={28} aria-hidden="true" />
                    <h3>Aucune station trouvée avec ces filtres</h3>
                    <p>
                      Essayez d’élargir le rayon ou de passer sur « Toutes » pour inclure les bornes AC.
                    </p>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() =>
                        updateFilters({
                          ...filters,
                          radiusKm: Math.max(30, filters.radiusKm),
                          maxPricePerKwh: null,
                          cbOnly: false,
                          knownPriceOnly: false,
                          availableOnly: false,
                        })
                      }
                    >
                      Élargir la recherche
                    </button>
                  </div>
                ) : (
                  visibleStations.map((station) => {
                    const isCheapest =
                      sectorStats.cheapest !== null &&
                      station.resolvedPrice.pricePerKwh !== null &&
                      Math.abs(station.resolvedPrice.pricePerKwh - sectorStats.cheapest) < 0.001;
                    return (
                      <StationCard
                        key={station.id}
                        station={station}
                        vehicle={vehicle}
                        isFavorite={favoriteIds.has(station.id)}
                        isCheapest={isCheapest}
                        isLoadingAvailability={isLoadingAvailability}
                        sortBy={filters.sortBy}
                        onSelect={(st) => setSelectedStationId(st.id)}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    );
                  })
                )}
              </section>
            )}
          </div>
        )}

        {activeTab === 'simulator' && (
          <SimulatorView
            vehicle={vehicle}
            stations={visibleStations}
            locationLabel={location.label}
            onUpdateVehicle={updateVehicle}
            onSelectStation={(st) => setSelectedStationId(st.id)}
          />
        )}

        {activeTab === 'logbook' && (
          <LogbookView
            logs={logs}
            favorites={favorites}
            overrides={overrides}
            vehicle={vehicle}
            onAddLog={() => {
              setLogModalPrefill(null);
              setIsLogModalOpen(true);
            }}
            onDeleteLog={handleDeleteLog}
            onRemoveFavorite={(id) => {
              const next = favorites.filter((f) => f.id !== id);
              setFavorites(next);
              saveFavorites(next);
              showToast('Favori retiré');
            }}
            onLogFromFavorite={(fav) => {
              const ov = overrides[fav.id];
              setLogModalPrefill({
                stationId: fav.id,
                stationName: fav.name,
                operator: fav.brand || fav.operator,
                pricePerKwh: ov ? ov.pricePerKwh : fav.lastKnownPricePerKwh,
                powerKw: fav.maxPowerKw,
              });
              setIsLogModalOpen(true);
            }}
            onDeleteOverride={handleDeleteOverride}
            onUpdateOverride={(stationId, price) => {
              const existing = overrides[stationId];
              if (!existing) return;
              const next = {
                ...overrides,
                [stationId]: {
                  ...existing,
                  pricePerKwh: price,
                  updatedAt: new Date().toISOString(),
                },
              };
              setOverrides(next);
              savePriceOverrides(next);
              showToast('Tarif mis à jour');
            }}
            onExportJson={handleExportJson}
            onImportJson={handleImportJson}
          />
        )}
      </main>

      {/* Fixed Bottom Tabbar (SportApp style) */}
      <nav className="bottom-tabbar" aria-label="Navigation principale">
        <button
          type="button"
          className={`tabbar-item${activeTab === 'stations' ? ' active' : ''}`}
          aria-current={activeTab === 'stations' ? 'page' : undefined}
          onClick={() => setActiveTab('stations')}
        >
          <Zap size={20} aria-hidden="true" />
          <span>Bornes</span>
        </button>

        <button
          type="button"
          className={`tabbar-item${activeTab === 'simulator' ? ' active' : ''}`}
          aria-current={activeTab === 'simulator' ? 'page' : undefined}
          onClick={() => setActiveTab('simulator')}
        >
          <Calculator size={20} aria-hidden="true" />
          <span>Simulateur</span>
        </button>

        <button
          type="button"
          className={`tabbar-item${activeTab === 'logbook' ? ' active' : ''}`}
          aria-current={activeTab === 'logbook' ? 'page' : undefined}
          onClick={() => setActiveTab('logbook')}
        >
          <BookOpen size={20} aria-hidden="true" />
          <span>Carnet</span>
        </button>
      </nav>

      {/* Native <dialog> Modals */}
      <StationDetailModal
        station={selectedStation}
        vehicle={vehicle}
        areaAveragePrice={sectorStats.average}
        existingOverride={selectedStation ? overrides[selectedStation.id] : undefined}
        isFavorite={selectedStation ? favoriteIds.has(selectedStation.id) : false}
        onClose={() => setSelectedStationId(null)}
        onRefreshAvailability={handleRefreshStationAvailability}
        onSaveOverride={handleSaveOverride}
        onDeleteOverride={handleDeleteOverride}
        onToggleFavorite={handleToggleFavorite}
        onLogChargeHere={(st) => {
          setLogModalPrefill({
            stationId: st.id,
            stationName: st.name,
            operator: st.brand || st.operator,
            pricePerKwh: st.resolvedPrice.pricePerKwh,
            powerKw: st.maxPowerKw,
          });
          setIsLogModalOpen(true);
        }}
      />

      <ChargeLogModal
        isOpen={isLogModalOpen}
        prefill={logModalPrefill}
        vehicle={vehicle}
        onClose={() => setIsLogModalOpen(false)}
        onSaveLog={handleSaveChargeLog}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        filters={filters}
        vehicle={vehicle}
        activeSubscriptions={activeSubscriptions}
        canInstallApp={canInstallApp}
        onInstallApp={handleInstallApp}
        onUpdateFilters={updateFilters}
        onUpdateVehicle={updateVehicle}
        onToggleSubscription={handleToggleSubscription}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onResetAll={handleResetAll}
      />

      {toastMessage && (
        <div className="toast-banner" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
