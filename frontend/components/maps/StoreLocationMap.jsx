'use client';

import { useEffect, useRef, useState } from 'react';

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// ── Google Maps JS loader (once) ─────────────────────────────────────────────
let googleMapsPromise = null;
function loadGoogleMaps(key) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise((resolve, reject) => {
    const cbName = '__gmapsCb';
    window[cbName] = () => resolve(window.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=${cbName}&loading=async`;
    s.async = true;
    s.onerror = () => { googleMapsPromise = null; reject(new Error('gmaps load failed')); };
    document.head.appendChild(s);
  });
  return googleMapsPromise;
}

// ── Google Maps renderer (used when a key is present; falls back to Leaflet on failure) ──
function GoogleLocationMap({ lat, lng, onLocationSelect, onFallback }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markerRef    = useRef(null);
  const gmRef        = useRef(null);
  const [mapType, setMapType] = useState('roadmap');

  const placeMarker = (gm, map, la, ln) => {
    if (markerRef.current) { markerRef.current.setPosition({ lat: la, lng: ln }); return; }
    const m = new gm.Marker({ position: { lat: la, lng: ln }, map, draggable: true });
    m.addListener('dragend', (e) => onLocationSelect?.(e.latLng.lat(), e.latLng.lng()));
    markerRef.current = m;
  };

  useEffect(() => {
    let cancelled = false;
    // Google calls this global on auth/quota failure → fall back to the free Leaflet/OSM map.
    window.gm_authFailure = () => onFallback?.();
    loadGoogleMaps(GOOGLE_KEY).then((gm) => {
      if (cancelled || !containerRef.current) return;
      gmRef.current = gm;
      const map = new gm.Map(containerRef.current, {
        center: { lat: lat ?? 14.5995, lng: lng ?? 120.9842 },
        zoom: lat && lng ? 16 : 12,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        clickableIcons: false,
      });
      mapRef.current = map;
      if (lat && lng) placeMarker(gm, map, lat, lng);
      map.addListener('click', (e) => {
        const la = e.latLng.lat(), ln = e.latLng.lng();
        placeMarker(gm, map, la, ln);
        onLocationSelect?.(la, ln);
      });
    }).catch(() => onFallback?.());
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapRef.current || !gmRef.current || !lat || !lng) return;
    placeMarker(gmRef.current, mapRef.current, lat, lng);
    mapRef.current.panTo({ lat, lng });
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mapRef.current) mapRef.current.setMapTypeId(mapType);
  }, [mapType]);

  return (
    <div style={{ position: 'relative', width: '100%', isolation: 'isolate' }}>
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
        {[['roadmap', 'Street'], ['hybrid', 'Satellite']].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setMapType(key)}
            style={{ padding: '5px 10px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', border: 'none',
              background: mapType === key ? '#D4A843' : 'rgba(20,20,20,0.85)', color: mapType === key ? '#000' : '#fff',
              transition: 'background 0.15s', letterSpacing: '0.3px' }}>
            {label}
          </button>
        ))}
      </div>
      <div ref={containerRef} style={{ width: '100%', height: '320px', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden', zIndex: 0 }} />
    </div>
  );
}

// ── Leaflet / OSM renderer (free fallback; also used when no Google key) ──────
const TILE_LAYERS = {
  street: {
    url:         'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains:  'abc',
    maxZoom:     19,
    label:       'Street',
  },
  satellite: {
    url:         'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGS, and the GIS User Community',
    maxZoom:     19,
    label:       'Satellite',
  },
};

function makePinIcon(L) {
  return L.divIcon({
    className: '',
    iconSize:   [28, 38],
    iconAnchor: [14, 38],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38" fill="none">
      <path d="M14 1C7.925 1 3 5.925 3 12c0 8.25 11 25 11 25S25 20.25 25 12C25 5.925 20.075 1 14 1z" fill="#D4A843" stroke="#fff" stroke-width="1.5"/>
      <circle cx="14" cy="12" r="4.5" fill="#fff"/>
    </svg>`,
  });
}

function LeafletLocationMap({ lat, lng, onLocationSelect }) {
  const containerRef  = useRef(null);
  const leafletMap    = useRef(null);
  const markerRef     = useRef(null);
  const leafletRef    = useRef(null);
  const tileLayerRef  = useRef(null);

  const [tileMode, setTileMode] = useState('street');
  const tileModeRef = useRef('street');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const initMap = async () => {
      if (!containerRef.current || cancelled) return;
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (!containerRef.current || cancelled) return;

      if (containerRef.current._leaflet_id) {
        try { leafletMap.current?.remove(); } catch {}
        leafletMap.current = null;
        markerRef.current  = null;
        tileLayerRef.current = null;
        try { delete containerRef.current._leaflet_id; } catch {}
      }
      if (cancelled) return;

      leafletRef.current = L;
      const centerLat = lat ?? 14.5995;
      const centerLng = lng ?? 120.9842;
      const zoom      = lat && lng ? 15 : 13;

      const map = L.map(containerRef.current, { zoomControl: true }).setView([centerLat, centerLng], zoom);

      const cfg = TILE_LAYERS[tileModeRef.current];
      tileLayerRef.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom, subdomains: cfg.subdomains ?? 'abc' }).addTo(map);

      if (lat && lng) {
        markerRef.current = L.marker([lat, lng], { draggable: true, icon: makePinIcon(L) }).addTo(map);
        markerRef.current.on('dragend', (e) => { const { lat: nLat, lng: nLng } = e.target.getLatLng(); onLocationSelect?.(nLat, nLng); });
      }

      map.on('click', (e) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          markerRef.current = L.marker([clickLat, clickLng], { draggable: true, icon: makePinIcon(L) }).addTo(map);
          markerRef.current.on('dragend', (ev) => { const { lat: nLat, lng: nLng } = ev.target.getLatLng(); onLocationSelect?.(nLat, nLng); });
        }
        onLocationSelect?.(clickLat, clickLng);
      });

      leafletMap.current = map;
      requestAnimationFrame(() => { if (leafletMap.current) leafletMap.current.invalidateSize(); });
    };

    initMap();
    return () => {
      cancelled = true;
      if (leafletMap.current) {
        try { leafletMap.current.remove(); } catch {}
        leafletMap.current = null; markerRef.current = null; tileLayerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!leafletMap.current || !lat || !lng) return;
    const L = leafletRef.current;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else if (L) {
      markerRef.current = L.marker([lat, lng], { draggable: true, icon: makePinIcon(L) }).addTo(leafletMap.current);
      markerRef.current.on('dragend', (e) => { const { lat: nLat, lng: nLng } = e.target.getLatLng(); onLocationSelect?.(nLat, nLng); });
    }
    leafletMap.current.panTo([lat, lng], { animate: true });
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tileModeRef.current = tileMode;
    if (!leafletMap.current || !leafletRef.current) return;
    const L = leafletRef.current, map = leafletMap.current;
    if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null; }
    const cfg = TILE_LAYERS[tileMode];
    tileLayerRef.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom, subdomains: cfg.subdomains ?? 'abc' }).addTo(map);
  }, [tileMode]);

  return (
    <div style={{ position: 'relative', width: '100%', isolation: 'isolate' }}>
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
        {Object.entries(TILE_LAYERS).map(([key, { label }]) => (
          <button key={key} type="button" onClick={() => setTileMode(key)}
            style={{ padding: '5px 10px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', border: 'none',
              background: tileMode === key ? '#D4A843' : 'rgba(20,20,20,0.85)', color: tileMode === key ? '#000' : '#fff',
              transition: 'background 0.15s', letterSpacing: '0.3px' }}>
            {label}
          </button>
        ))}
      </div>
      <div ref={containerRef} style={{ width: '100%', height: '320px', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden', zIndex: 0 }} />
    </div>
  );
}

// ── Dispatcher: Google Maps when a key is set (auto-falls back to Leaflet/OSM on failure) ──
export default function StoreLocationMap(props) {
  const [fallback, setFallback] = useState(false);
  if (GOOGLE_KEY && !fallback) {
    return <GoogleLocationMap {...props} onFallback={() => setFallback(true)} />;
  }
  return <LeafletLocationMap {...props} />;
}
