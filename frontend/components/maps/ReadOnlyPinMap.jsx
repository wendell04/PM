'use client';

import { useEffect, useRef } from 'react';

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

export default function ReadOnlyPinMap({ lat, lng, height = 180 }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !lat || !lng) return;

    let cancelled = false;

    const init = async () => {
      if (!containerRef.current || cancelled) return;

      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (!containerRef.current || cancelled) return;

      if (containerRef.current._leaflet_id) {
        try { mapRef.current?.remove(); } catch {}
        mapRef.current = null;
        try { delete containerRef.current._leaflet_id; } catch {}
      }

      const map = L.map(containerRef.current, {
        zoomControl:       false,
        dragging:          false,
        scrollWheelZoom:   false,
        doubleClickZoom:   false,
        touchZoom:         false,
        keyboard:          false,
        boxZoom:           false,
        attributionControl: false,
      }).setView([lat, lng], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      L.marker([lat, lng], { icon: makePinIcon(L), interactive: false }).addTo(map);
      mapRef.current = map;
      requestAnimationFrame(() => { if (mapRef.current) mapRef.current.invalidateSize(); });
    };

    init();

    return () => {
      cancelled = true;
      try { mapRef.current?.remove(); } catch {}
      mapRef.current = null;
    };
  }, [lat, lng]);

  if (!lat || !lng) return null;

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        borderRadius: '8px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    />
  );
}
