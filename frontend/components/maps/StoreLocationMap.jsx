'use client';

import { useEffect, useRef } from 'react';

export default function StoreLocationMap({ lat, lng, onLocationSelect }) {
  const containerRef = useRef(null);
  const leafletMap   = useRef(null);
  const markerRef    = useRef(null);
  const leafletRef   = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const initMap = async () => {
      if (!containerRef.current || cancelled) return;

      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (!containerRef.current || cancelled) return;

      // Clear any stale Leaflet state left on the element
      if (containerRef.current._leaflet_id) {
        try { leafletMap.current?.remove(); } catch {}
        leafletMap.current = null;
        markerRef.current  = null;
        try { delete containerRef.current._leaflet_id; } catch {}
      }

      if (cancelled) return;

      leafletRef.current = L;

      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const centerLat = lat ?? 14.5995;
      const centerLng = lng ?? 120.9842;
      const zoom      = lat && lng ? 15 : 13;

      const map = L.map(containerRef.current, { zoomControl: true })
        .setView([centerLat, centerLng], zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (lat && lng) {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
        markerRef.current.on('dragend', (e) => {
          const { lat: newLat, lng: newLng } = e.target.getLatLng();
          onLocationSelect?.(newLat, newLng);
        });
      }

      map.on('click', (e) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          markerRef.current = L.marker([clickLat, clickLng], { draggable: true }).addTo(map);
          markerRef.current.on('dragend', (ev) => {
            const { lat: newLat, lng: newLng } = ev.target.getLatLng();
            onLocationSelect?.(newLat, newLng);
          });
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
        leafletMap.current = null;
        markerRef.current  = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update/create marker when lat/lng arrive after map init (e.g. async settings load)
  useEffect(() => {
    if (!leafletMap.current || !lat || !lng) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else if (leafletRef.current) {
      const L = leafletRef.current;
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
        overflow: 'hidden',
        zIndex: 0,
      }}
    />
  );
}
