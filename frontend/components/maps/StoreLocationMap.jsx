'use client';

import { useEffect, useRef } from 'react';

export default function StoreLocationMap({ lat, lng, onLocationSelect }) {
  const containerRef = useRef(null);
  const leafletMap   = useRef(null);
  const markerRef    = useRef(null);
  const leafletRef   = useRef(null); // store L instance for async marker creation

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let destroyed = false;

    const destroy = () => {
      if (leafletMap.current) {
        try { leafletMap.current.remove(); } catch {}
        leafletMap.current = null;
        markerRef.current  = null;
      }
      if (containerRef.current) {
        try { delete containerRef.current._leaflet_id; } catch {}
      }
    };

    const addDragListener = (marker) => {
      marker.on('dragend', (e) => {
        const { lat: newLat, lng: newLng } = e.target.getLatLng();
        onLocationSelect?.(newLat, newLng);
      });
    };

    const initMap = async () => {
      if (!containerRef.current || destroyed) return;

      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (!containerRef.current || destroyed) return;

      destroy();
      if (destroyed) return;

      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      leafletRef.current = L;

      const centerLat = lat ?? 14.5995;
      const centerLng = lng ?? 120.9842;
      const zoom      = lat && lng ? 15 : 13;

      try {
        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([centerLat, centerLng], zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
          crossOrigin: true,
        }).addTo(map);

        if (lat && lng) {
          markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
          addDragListener(markerRef.current);
        }

        map.on('click', (e) => {
          const { lat: clickLat, lng: clickLng } = e.latlng;
          if (markerRef.current) {
            markerRef.current.setLatLng([clickLat, clickLng]);
          } else {
            markerRef.current = L.marker([clickLat, clickLng], { draggable: true }).addTo(map);
            addDragListener(markerRef.current);
          }
          onLocationSelect?.(clickLat, clickLng);
        });

        leafletMap.current = map;

        requestAnimationFrame(() => { if (leafletMap.current) leafletMap.current.invalidateSize(); });
      } catch (err) {
        console.error('[StoreLocationMap] init error:', err);
      }
    };

    initMap();

    return () => {
      destroyed = true;
      destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync marker when lat/lng props arrive — handles both prop updates AND
  // the async case where lat/lng load after the map is already initialized
  useEffect(() => {
    if (!leafletMap.current) return;
    if (!lat || !lng) return;

    const L = leafletRef.current;

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else if (L) {
      // lat/lng arrived after map init (async settings load) — create marker now
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(leafletMap.current);
      markerRef.current.on('dragend', (e) => {
        const { lat: newLat, lng: newLng } = e.target.getLatLng();
        onLocationSelect?.(newLat, newLng);
      });
    }

    leafletMap.current.panTo([lat, lng], { animate: true });
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '320px',
        borderRadius: '10px',
        border: '1px solid var(--border)',
        background: 'var(--dark3)',
        overflow: 'hidden',
        zIndex: 0,
      }}
    />
  );
}
