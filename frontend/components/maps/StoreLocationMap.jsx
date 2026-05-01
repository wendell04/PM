'use client';

import { useEffect, useRef } from 'react';

export default function StoreLocationMap({ lat, lng, onLocationSelect }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || leafletMap.current) return;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const defaultLat = lat ?? 14.5995;
      const defaultLng = lng ?? 120.9842;

      const map = L.map(mapRef.current, { zoomControl: true }).setView([defaultLat, defaultLng], lat ? 15 : 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (lat && lng) {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
        markerRef.current.on('dragend', (e) => {
          const { lat: newLat, lng: newLng } = e.target.getLatLng();
          onLocationSelect(newLat, newLng);
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
            onLocationSelect(newLat, newLng);
          });
        }
        onLocationSelect(clickLat, clickLng);
      });

      leafletMap.current = map;
    };

    initMap();

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        markerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!leafletMap.current || !markerRef.current) return;
    if (lat && lng) markerRef.current.setLatLng([lat, lng]);
  }, [lat, lng]);

  return (
    <div
      ref={mapRef}
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
