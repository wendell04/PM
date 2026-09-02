'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../../contexts/AuthContext';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { fetchRegions, fetchProvinces, fetchCities, fetchBarangays, isNCR } from '@/lib/psgc';
import { CustomSelect } from '@/app/dashboard/business/inventory-v2/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Optional upgrade: TomTom Search API gives commercial-grade POI/landmark coverage (free tier, no card).
// When the key is set the address search uses TomTom; otherwise it falls back to free OSM/Nominatim.
const TOMTOM_KEY = process.env.NEXT_PUBLIC_TOMTOM_API_KEY || '';

// Google Places (New) — best PH landmark/POI coverage. Browser key (restrict by HTTP referrer + quota caps).
// When set, the address search uses Google; any failure/quota falls back to TomTom/OSM (never breaks).
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Map Google Place Details addressComponents[] → our { house_number, road, postcode, city, suburb, ... }.
const parseGoogleComponents = (components = []) => {
  const get = (type) => components.find(c => (c.types || []).includes(type));
  return {
    house_number: get('street_number')?.longText || '',
    road:         get('route')?.longText || '',
    postcode:     get('postal_code')?.longText || '',
    city:         get('locality')?.longText || get('administrative_area_level_2')?.longText || '',
    suburb:       get('sublocality_level_1')?.longText || get('neighborhood')?.longText || get('sublocality')?.longText || '',
    state:        get('administrative_area_level_1')?.longText || '',
    region:       get('administrative_area_level_1')?.longText || '',
  };
};

// Haversine distance in km between two lat/lng points (for the Grab-style "x.xx km" on each result).
const haversineKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Normalize a TomTom Fuzzy Search result into { title, subtitle, lat, lon, address:{...} } — POI name on
// top, full address beneath — so the suggestion UI + autoFillPsgc read the same shape as the OSM path.
const normalizeTomTom = (r) => {
  const a = r.address || {};
  const poiName = r.poi?.name;
  const line = a.freeformAddress || '';
  return {
    title:    poiName || a.streetName || line,
    subtitle: line,
    display_name: poiName ? (line ? `${poiName} — ${line}` : poiName) : line,
    lat: r.position?.lat,
    lon: r.position?.lon,
    address: {
      house_number: a.streetNumber || '',
      road:         a.streetName || '',
      postcode:     a.postalCode || '',
      city:         a.municipality || '',
      suburb:       a.municipalitySubdivision || '',
      state:        a.countrySubdivision || '',
      region:       a.countrySubdivision || '',
    },
  };
};

// Same { title, subtitle, ... } shape for a raw Nominatim result.
const normalizeNominatim = (r) => ({
  place_id: r.place_id,
  title:    r.name || (r.display_name || '').split(',')[0],
  subtitle: r.display_name || '',
  display_name: r.display_name || '',
  lat: r.lat,
  lon: r.lon,
  address: r.address || {},
});

const StoreLocationMap = dynamic(() => import('@/components/maps/StoreLocationMap'), { ssr: false });

const inputStyle = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  background: 'var(--dark2)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--white)',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
};

const inputErrorStyle = { ...inputStyle, border: '1px solid var(--red)' };

const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  color: 'var(--gray)',
  marginBottom: '0.4rem',
};

const fieldError = (msg) =>
  msg ? (
    <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: '0.25rem', display: 'block' }}>
      {msg}
    </span>
  ) : null;

const emptyForm = {
  label: '', house_number: '', street: '', subdivision: '', delivery_notes: '',
  region: '', region_code: '',
  province: '', province_code: '',
  city: '', city_code: '',
  barangay: '', barangay_code: '',
  zip: '', phone: '',
  is_default: false, lat: null, lng: null,
};

export default function AddressBook({ onSaved, initialEditAddress }) {
  const { token } = useAuth();

  const [addresses, setAddresses]       = useState([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm]         = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [error, setError]               = useState(null);
  const [successMsg, setSuccessMsg]     = useState(null);
  const [formData, setFormData]         = useState(emptyForm);
  const [formErrors, setFormErrors]     = useState({});
  const [deletingId, setDeletingId]     = useState(null);
  const [mapExpanded, setMapExpanded]     = useState(true);
  const autoOpenedRef                     = useRef(false);
  const [isGeocoding, setIsGeocoding]     = useState(false);
  const [userLoc, setUserLoc]             = useState(null); // device GPS, for the Grab-style distance

  // PSGC cascading dropdown option lists
  const [regions, setRegions]       = useState([]);
  const [provinces, setProvinces]   = useState([]);
  const [cities, setCities]         = useState([]);
  const [barangays, setBarangays]   = useState([]);

  // Address search (autocomplete) — convenience: pre-fills pin + free-text +
  // best-effort the PSGC dropdowns. User confirms the dropdowns.
  const [addressSearch, setAddressSearch] = useState('');
  const [suggestions, setSuggestions]     = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching]     = useState(false);
  const searchTimerRef                    = useRef(null);
  const googleSessionRef                  = useRef(null); // Places session token (1 search = 1 billable session)

  useEffect(() => { fetchAddresses(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open edit form when initialEditAddress prop is provided (used by checkout pin modal)
  useEffect(() => {
    if (!initialEditAddress || autoOpenedRef.current || addresses.length === 0) return;
    autoOpenedRef.current = true;
    const found = addresses.find(a => a.id === initialEditAddress.id);
    if (found) handleEdit(found);
  }, [addresses]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  // ── PSGC cascade: load regions once, then children as codes change ──
  useEffect(() => {
    let cancelled = false;
    fetchRegions().then(r => { if (!cancelled) setRegions(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Device location (best-effort) → shows the Grab-style distance next to each search result. Silent if denied.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    if (!formData.region_code) { setProvinces([]); setCities([]); return; }
    let cancelled = false;
    (async () => {
      try {
        if (isNCR(formData.region_code)) {
          setProvinces([]);
          const c = await fetchCities(formData.region_code, null);
          if (!cancelled) setCities(c);
        } else {
          const p = await fetchProvinces(formData.region_code);
          if (!cancelled) setProvinces(p);
        }
      } catch { /* network — leave lists as-is */ }
    })();
    return () => { cancelled = true; };
  }, [formData.region_code]);

  useEffect(() => {
    if (isNCR(formData.region_code)) return; // NCR cities loaded by the region effect
    if (!formData.province_code) { setCities([]); return; }
    let cancelled = false;
    fetchCities(formData.region_code, formData.province_code)
      .then(c => { if (!cancelled) setCities(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [formData.province_code, formData.region_code]);

  useEffect(() => {
    if (!formData.city_code) { setBarangays([]); return; }
    let cancelled = false;
    fetchBarangays(formData.city_code)
      .then(b => { if (!cancelled) setBarangays(b); }).catch(() => {});
    return () => { cancelled = true; };
  }, [formData.city_code]);

  const handleRegionChange = (code) => {
    const r = regions.find(x => x.code === code);
    const ncr = isNCR(code);
    setFormData(prev => ({
      ...prev,
      region: r?.name || '', region_code: code,
      province: ncr ? 'Metro Manila' : '', province_code: ncr ? code : '',
      city: '', city_code: '',
      barangay: '', barangay_code: '',
    }));
    setFormErrors(prev => ({ ...prev, region: null, province: null, city: null, barangay: null }));
  };

  const handleProvinceChange = (code) => {
    const p = provinces.find(x => x.code === code);
    setFormData(prev => ({
      ...prev,
      province: p?.name || '', province_code: code,
      city: '', city_code: '',
      barangay: '', barangay_code: '',
    }));
    setFormErrors(prev => ({ ...prev, province: null, city: null, barangay: null }));
  };

  const handleCityChange = (code) => {
    const c = cities.find(x => x.code === code);
    setFormData(prev => ({
      ...prev,
      city: c?.name || '', city_code: code,
      barangay: '', barangay_code: '',
    }));
    setFormErrors(prev => ({ ...prev, city: null, barangay: null }));
  };

  // Geocode a free-text address → lat/lng (best-effort, Nominatim/OSM) and drop/move the map pin.
  const geocodeToPin = async (query) => {
    if (!query || query.trim().length < 3) return false;
    try {
      setIsGeocoding(true);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ph`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data[0]) {
        setFormData(prev => ({ ...prev, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }));
        setMapExpanded(true);
        setFormErrors(prev => ({ ...prev, pin: null }));
        return true;
      }
    } catch { /* keep whatever pin the user set manually */ }
    finally { setIsGeocoding(false); }
    return false;
  };

  const handleBarangayChange = (code) => {
    const b = barangays.find(x => x.code === code);
    setFormData(prev => ({ ...prev, barangay: b?.name || '', barangay_code: code }));
    setFormErrors(prev => ({ ...prev, barangay: null }));
    // Initial pin at barangay level; refined to the exact house/street once those are typed (refinePin).
    const parts = [b?.name, formData.city, formData.province, 'Philippines'].filter(Boolean);
    if (parts.length >= 2) geocodeToPin(parts.join(', '));
  };

  // Refine the pin to the precise house-number + street once the customer types them (fires on blur).
  // Falls back silently to the barangay-level pin if OSM can't resolve the exact address.
  const refinePin = () => {
    const { house_number, street, barangay, city, province } = formData;
    if (!street || !city) return;
    const parts = [[house_number, street].filter(Boolean).join(' '), barangay, city, province, 'Philippines'].filter(Boolean);
    geocodeToPin(parts.join(', '));
  };

  // ── Address search (free, OpenStreetMap/Nominatim, PH-filtered) ──
  // TomTom (commercial POI, when a key is set): finds named landmarks that OSM lacks. PH-filtered + pin-biased.
  // Any failure — including a 429 when the daily free quota (2,500) is spent — returns [] so the caller
  // silently falls back to free OSM/Nominatim; the search never breaks for the user.
  const runTomTom = async (val) => {
    try {
      const bias = (formData.lat && formData.lng) ? `&lat=${formData.lat}&lon=${formData.lng}` : '';
      const res = await fetch(
        `https://api.tomtom.com/search/2/search/${encodeURIComponent(val)}.json?key=${TOMTOM_KEY}&typeahead=true&limit=6&countrySet=PH${bias}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).map(normalizeTomTom).filter(r => r.lat && r.lon);
    } catch { return []; }
  };

  // OSM/Nominatim (free, no key): catches small eskinita/local spots; PH-filtered + soft pin bias.
  const runNominatim = async (val) => {
    let bias = '';
    if (formData.lat && formData.lng) {
      const d = 0.15;
      bias = `&viewbox=${formData.lng - d},${formData.lat + d},${formData.lng + d},${formData.lat - d}&bounded=0`;
    }
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&addressdetails=1&limit=6&countrycodes=ph${bias}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    return (await res.json()).map(normalizeNominatim);
  };

  // Google Places Autocomplete (New): best PH POI/landmark coverage. One session token covers all the
  // keystroke predictions of a search (billed as a single session; coords come later on select). PH-locked
  // + biased to the current pin. Any failure/quota returns [] → caller falls back to TomTom/OSM.
  const runGoogle = async (val) => {
    try {
      if (!googleSessionRef.current) googleSessionRef.current = (globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()));
      const body = {
        input: val,
        includedRegionCodes: ['ph'], // hard-restrict results to the Philippines (regionCode only formats)
        sessionToken: googleSessionRef.current,
        ...(formData.lat && formData.lng
          ? { locationBias: { circle: { center: { latitude: formData.lat, longitude: formData.lng }, radius: 30000 } } }
          : {}),
      };
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY },
        body: JSON.stringify(body),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.suggestions || [])
        .map(s => s.placePrediction)
        .filter(Boolean)
        .map(p => ({
          google_place_id: p.placeId,
          title:        p.structuredFormat?.mainText?.text || p.text?.text || '',
          subtitle:     p.structuredFormat?.secondaryText?.text || '',
          display_name: p.text?.text || '',
          lat: null, lon: null, address: {},
        }))
        .filter(s => s.google_place_id);
    } catch { return []; }
  };

  // Resolve a Google prediction → coordinates + address (Place Details, the one billable event per search).
  // Closing the session token here ends the billing session.
  const fetchGooglePlaceDetails = async (placeId) => {
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${googleSessionRef.current || ''}`,
        { headers: { 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': 'location,formattedAddress,addressComponents' } }
      );
      if (!res.ok) return null;
      const d = await res.json();
      return {
        lat: d.location?.latitude,
        lon: d.location?.longitude,
        address: parseGoogleComponents(d.addressComponents),
        display_name: d.formattedAddress || '',
      };
    } catch { return null; }
    finally { googleSessionRef.current = null; }
  };

  const handleSearchChange = (val) => {
    setAddressSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (val.trim().length < 3) { setSuggestions([]); setShowSuggestions(false); setIsSearching(false); return; }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        // Provider chain: Google (best landmarks) → TomTom → OSM. Each falls back when it has no key/no match.
        let results = GOOGLE_KEY ? await runGoogle(val) : (TOMTOM_KEY ? await runTomTom(val) : []);
        if (results.length === 0) results = await runNominatim(val);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch { setSuggestions([]); }
      finally { setIsSearching(false); }
    }, 280);
  };

  // Best-effort: match a Nominatim address to the PSGC cascade (Region→Province→City→Barangay).
  // Returns a partial formData patch of whatever it could confidently match.
  const autoFillPsgc = async (a) => {
    const norm = (s) => (s || '').toLowerCase()
      .replace(/\b(city of|municipality of|province of|city|municipality)\b/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const match = (list, name) => {
      const n = norm(name);
      if (!n) return null;
      return list.find(x => norm(x.name) === n)
          || list.find(x => norm(x.name).includes(n) || n.includes(norm(x.name)));
    };
    try {
      const regionName   = a.region || '';
      const provinceName = a.state || '';
      const cityName     = a.city || a.town || a.municipality || a.county || '';
      const brgyName     = a.suburb || a.village || a.neighbourhood || a.quarter || '';
      const isMM = /metro manila|national capital/i.test(`${regionName} ${provinceName}`);

      const regs = await fetchRegions();
      const reg  = isMM ? regs.find(r => isNCR(r.code)) : match(regs, regionName);
      if (!reg) return null;

      const patch = {
        region: reg.name, region_code: reg.code,
        province: '', province_code: '', city: '', city_code: '', barangay: '', barangay_code: '',
      };

      let cityList = null;
      if (isNCR(reg.code)) {
        patch.province = 'Metro Manila'; patch.province_code = reg.code;
        cityList = await fetchCities(reg.code, null);
      } else {
        const prov = match(await fetchProvinces(reg.code), provinceName);
        if (prov) {
          patch.province = prov.name; patch.province_code = prov.code;
          cityList = await fetchCities(reg.code, prov.code);
        }
      }
      if (cityList) {
        const city = match(cityList, cityName);
        if (city) {
          patch.city = city.name; patch.city_code = city.code;
          const brgy = match(await fetchBarangays(city.code), brgyName);
          if (brgy) { patch.barangay = brgy.name; patch.barangay_code = brgy.code; }
        }
      }
      return patch;
    } catch { return null; }
  };

  const handleSuggestionSelect = async (s) => {
    setSuggestions([]);
    setShowSuggestions(false);
    setAddressSearch('');
    // Google predictions carry only a placeId — resolve coordinates + address via Place Details on select.
    let sel = s;
    if (s.google_place_id && (!s.lat || !s.lon)) {
      setIsGeocoding(true);
      const details = await fetchGooglePlaceDetails(s.google_place_id);
      setIsGeocoding(false);
      if (details) sel = { ...s, ...details };
    }
    const a = sel.address || {};
    setFormData(prev => ({
      ...prev,
      house_number: a.house_number || prev.house_number,
      street:       a.road || a.pedestrian || a.footway || prev.street,
      zip:          a.postcode ? a.postcode.replace(/\D/g, '').slice(0, 4) : prev.zip,
      lat:          parseFloat(sel.lat),
      lng:          parseFloat(sel.lon),
    }));
    setMapExpanded(true);
    const patch = await autoFillPsgc(a);
    if (patch) {
      setFormData(prev => ({ ...prev, ...patch }));
      setFormErrors(prev => ({ ...prev, region: null, province: null, city: null, barangay: null }));
    }
  };

  const fetchAddresses = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/addresses`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch addresses');
      setAddresses(data.addresses || []);
    } catch (err) {
      setError(err.message || 'Failed to load addresses');
    } finally {
      setIsLoading(false);
    }
  };

  // Pin drop → back-fill Street / House No. / ZIP from the reverse-geocode, but ONLY when the field is
  // still empty so a manual entry (and the authoritative PSGC dropdowns) are never overwritten.
  const handleLocationSelect = async (lat, lng) => {
    setFormData(prev => ({ ...prev, lat, lng }));
    setIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      const a = data?.address || {};
      setFormData(prev => ({
        ...prev, lat, lng,
        house_number: prev.house_number || a.house_number || '',
        street:       prev.street || a.road || a.pedestrian || a.footway || '',
        zip:          prev.zip || (a.postcode ? a.postcode.replace(/\D/g, '').slice(0, 4) : ''),
      }));
    } catch { /* Nominatim unavailable — keep existing fields */ }
    finally { setIsGeocoding(false); }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.region_code)   errors.region   = 'Region is required';
    if (!isNCR(formData.region_code) && !formData.province_code)
      errors.province = 'Province is required';
    if (!formData.city_code)     errors.city     = 'City/Municipality is required';
    if (!formData.barangay_code) errors.barangay = 'Barangay is required';
    if (!formData.house_number.trim()) errors.house_number = 'House/Unit No. is required';
    if (!formData.street.trim())       errors.street       = 'Street is required';
    if (!formData.zip.trim() || !/^\d{4}$/.test(formData.zip.trim()))
      errors.zip = 'ZIP Code must be a 4-digit number';
    if (!formData.phone.trim() || !/^\+63\d{10}$/.test(formData.phone.trim()))
      errors.phone = 'Phone must be in the format +63XXXXXXXXXX';
    if (!formData.lat || !formData.lng)
      errors.pin = 'Please pin your location on the map before saving.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      if (!formData.lat || !formData.lng) setMapExpanded(true);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const url    = editingAddress ? `${API_URL}/api/addresses/${editingAddress.id}` : `${API_URL}/api/addresses`;
      const method = editingAddress ? 'PUT' : 'POST';
      const res = await fetchWithTimeout(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || (editingAddress ? 'Failed to update address' : 'Failed to add address'));
      setAddresses(data.addresses || []);
      setSuccessMsg(editingAddress ? 'Address updated successfully!' : 'Address added successfully!');
      resetForm();
      onSaved?.();
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (address) => {
    setEditingAddress(address);
    setFormData({
      label:         address.label         || '',
      house_number:  address.house_number  || '',
      street:        address.street        || '',
      subdivision:   address.subdivision   || '',
      delivery_notes: address.delivery_notes || '',
      region:        address.region        || '',
      region_code:   address.region_code   || '',
      province:      address.province      || '',
      province_code: address.province_code || '',
      city:          address.city          || '',
      city_code:     address.city_code     || '',
      barangay:      address.barangay      || '',
      barangay_code: address.barangay_code || '',
      zip:           address.zip           || '',
      phone:         address.phone         || '',
      is_default:    address.is_default    || false,
      lat:           address.lat           ?? null,
      lng:           address.lng           ?? null,
    });
    setMapExpanded(!(address.lat && address.lng)); // editing: keep the map hidden if a pin is already saved
    setShowForm(true);
    setFormErrors({});
    setError(null);
  };

  const handleDelete = async (id) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/addresses/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete address');
      setAddresses(data.addresses || []);
      setSuccessMsg('Address deleted successfully!');
      setDeletingId(null);
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (id) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/addresses/${id}/default`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to set default address');
      setAddresses(data.addresses || []);
      setSuccessMsg('Default address updated!');
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingAddress(null);
    setShowForm(false);
    setFormErrors({});
    setMapExpanded(true);
    setProvinces([]);
    setCities([]);
    setBarangays([]);
    setAddressSearch('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const openAddForm = () => { resetForm(); setShowForm(true); };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ padding: '1.25rem', background: 'var(--dark)', borderRadius: '12px', border: '1px solid var(--border)', animation: 'pulse 1.5s ease-in-out infinite' }}>
            <div style={{ height: '18px', background: 'var(--dark3)', borderRadius: '4px', width: '40%', marginBottom: '0.75rem' }} />
            <div style={{ height: '14px', background: 'var(--dark3)', borderRadius: '4px', width: '70%', marginBottom: '0.5rem' }} />
            <div style={{ height: '14px', background: 'var(--dark3)', borderRadius: '4px', width: '50%' }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header — title comes from the parent page; keep only the Add Address action here */}
      {!showForm && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button onClick={openAddForm} style={{ padding: '0.625rem 1.25rem', background: 'var(--gold)', border: 'none', borderRadius: '8px', color: 'var(--black)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Address
          </button>
        </div>
      )}

      {/* Success */}
      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          {successMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={fetchAddresses} style={{ padding: '0.4rem 0.75rem', background: 'transparent', border: '1px solid var(--gold)', borderRadius: '6px', color: 'var(--gold)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} style={{ padding: '1.25rem', background: 'var(--dark)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Address search / autocomplete ── */}
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Search your address <span style={{ color: 'var(--gray)', fontSize: '0.7rem' }}>(drops the pin & fills the fields below)</span></label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={addressSearch}
                onChange={e => handleSearchChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
                placeholder="Type a street, barangay, building, or landmark…"
                style={{ ...inputStyle, paddingRight: '2.25rem' }}
                autoComplete="off"
              />
              <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
                {isSearching ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gray)" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                )}
              </span>
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1200, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', maxHeight: '272px', overflowY: 'auto', overflowX: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                {suggestions.map((s, i) => (
                  <button
                    key={s.place_id || i}
                    type="button"
                    onMouseDown={() => handleSuggestionSelect(s)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', width: '100%', padding: '0.625rem 0.875rem', background: 'transparent', border: 'none', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none', color: 'var(--white)', fontSize: '0.8125rem', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,168,67,0.07)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0, marginTop: '3px' }}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.title || s.display_name}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--gray)', lineHeight: 1.35 }}>
                        {userLoc && s.lat && s.lon && (
                          <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                            {haversineKm(userLoc.lat, userLoc.lng, parseFloat(s.lat), parseFloat(s.lon)).toFixed(2)} km&nbsp;·&nbsp;
                          </span>
                        )}
                        {s.subtitle || s.display_name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!isSearching && addressSearch.trim().length >= 3 && !showSuggestions && suggestions.length === 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1200, background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', padding: '0.75rem 0.875rem', fontSize: '0.8125rem', color: 'var(--gray)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                No results. Try a more specific address, or just pin it on the map below.
              </div>
            )}
          </div>

          {/* ── Map pin (required) ── */}
          <div>
            <button
              type="button"
              onClick={() => { setMapExpanded(v => !v); if (formErrors.pin) setFormErrors(prev => ({ ...prev, pin: null })); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: mapExpanded ? 'rgba(212,168,67,0.1)' : (formErrors.pin ? 'rgba(239,68,68,0.06)' : 'transparent'), border: `1px solid ${formErrors.pin ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, borderRadius: '8px', padding: '0.5rem 0.875rem', cursor: 'pointer', color: mapExpanded ? 'var(--gold)' : (formErrors.pin ? 'var(--red)' : 'var(--gray-light)'), fontSize: '0.8125rem', fontWeight: 500 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              {mapExpanded ? 'Hide Map' : (formData.lat && formData.lng ? 'Update Pin Location' : 'Pin Location on Map')}
              <span style={{ fontSize: '0.72rem', color: formErrors.pin ? 'var(--red)' : 'var(--gray)', fontWeight: 400 }}>
                {formErrors.pin ? '— required' : '— for exact delivery location'}
              </span>
            </button>
            {formErrors.pin && !mapExpanded && (
              <div style={{ marginTop: '0.375rem', fontSize: '0.78rem', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {formErrors.pin}
              </div>
            )}

            {mapExpanded && (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <StoreLocationMap
                  lat={formData.lat}
                  lng={formData.lng}
                  onLocationSelect={handleLocationSelect}
                />
                {isGeocoding && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span className="spinner" style={{ width: '12px', height: '12px' }} />
                    Detecting location…
                  </div>
                )}
                {formData.lat && formData.lng && !isGeocoding && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.78rem', color: 'var(--gray-light)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                    </svg>
                    Pinned · {
                      [formData.house_number, formData.street, formData.barangay, formData.city, formData.province]
                        .filter(Boolean).join(', ')
                      || `${formData.lat.toFixed(5)}, ${formData.lng.toFixed(5)}`
                    }
                  </div>
                )}
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--gray)', lineHeight: 1.5 }}>
                  Drag the pin to your exact doorstep. This precise location is what the seller uses to book your courier — select your Region, City and Barangay from the dropdowns below.
                </p>
              </div>
            )}
          </div>

          <style>{`
            .addr-2col      { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
            .addr-2col-wide { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
            @media (max-width: 560px) {
              .addr-2col, .addr-2col-wide { grid-template-columns: 1fr; gap: 0.75rem; }
            }
          `}</style>

          <div style={{ height: '1px', background: 'var(--border)' }} />

          {/* ROW 1: Label | Phone */}
          <div className="addr-2col">
            <div>
              <label style={labelStyle}>Label <span style={{ color: 'var(--gray)', fontSize: '0.7rem' }}>(optional)</span></label>
              <input type="text" value={formData.label} onChange={e => handleInputChange('label', e.target.value)} placeholder="e.g. Home, Office" style={formErrors.label ? inputErrorStyle : inputStyle} />
              {fieldError(formErrors.label)}
            </div>
            <div>
              <label style={labelStyle}>Phone <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="text" value={formData.phone} onChange={e => handleInputChange('phone', e.target.value)} placeholder="+63XXXXXXXXXX" style={formErrors.phone ? inputErrorStyle : inputStyle} />
              {fieldError(formErrors.phone)}
            </div>
          </div>

          {/* PSGC cascade: Region | Province */}
          <div className="addr-2col">
            <div>
              <label style={labelStyle}>Region <span style={{ color: 'var(--red)' }}>*</span></label>
              <CustomSelect
                value={formData.region_code}
                onChange={handleRegionChange}
                options={regions.map(r => ({ value: r.code, label: r.name }))}
                placeholder="Select region"
                error={!!formErrors.region}
                searchable
              />
              {fieldError(formErrors.region)}
            </div>
            <div>
              <label style={labelStyle}>Province {!isNCR(formData.region_code) && <span style={{ color: 'var(--red)' }}>*</span>}</label>
              <CustomSelect
                value={formData.province_code}
                onChange={handleProvinceChange}
                options={provinces.map(p => ({ value: p.code, label: p.name }))}
                placeholder={isNCR(formData.region_code) ? 'Metro Manila (NCR)' : 'Select province'}
                disabled={!formData.region_code || isNCR(formData.region_code)}
                error={!!formErrors.province}
                searchable
              />
              {fieldError(formErrors.province)}
            </div>
          </div>

          {/* PSGC cascade: City/Municipality | Barangay */}
          <div className="addr-2col">
            <div>
              <label style={labelStyle}>City / Municipality <span style={{ color: 'var(--red)' }}>*</span></label>
              <CustomSelect
                value={formData.city_code}
                onChange={handleCityChange}
                options={cities.map(c => ({ value: c.code, label: c.name }))}
                placeholder={cities.length === 0 ? 'Select region/province first' : 'Select city/municipality'}
                disabled={cities.length === 0}
                error={!!formErrors.city}
                searchable
              />
              {fieldError(formErrors.city)}
            </div>
            <div>
              <label style={labelStyle}>Barangay <span style={{ color: 'var(--red)' }}>*</span></label>
              <CustomSelect
                value={formData.barangay_code}
                onChange={handleBarangayChange}
                options={barangays.map(b => ({ value: b.code, label: b.name }))}
                placeholder={barangays.length === 0 ? 'Select city first' : 'Select barangay'}
                disabled={barangays.length === 0}
                error={!!formErrors.barangay}
                searchable
              />
              {fieldError(formErrors.barangay)}
            </div>
          </div>

          {/* House/Unit No. | Subdivision */}
          <div className="addr-2col">
            <div>
              <label style={labelStyle}>House/Unit No. <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="text" value={formData.house_number} onChange={e => handleInputChange('house_number', e.target.value)} onBlur={refinePin} placeholder="e.g. 168 or Blk 2 Lot 24" style={formErrors.house_number ? inputErrorStyle : inputStyle} />
              {fieldError(formErrors.house_number)}
            </div>
            <div>
              <label style={labelStyle}>Subdivision / Village <span style={{ color: 'var(--gray)', fontSize: '0.7rem' }}>(optional)</span></label>
              <input type="text" value={formData.subdivision} onChange={e => handleInputChange('subdivision', e.target.value)} placeholder="e.g. Greenville Subd." style={inputStyle} />
            </div>
          </div>

          {/* Street | ZIP */}
          <div className="addr-2col-wide">
            <div>
              <label style={labelStyle}>Street <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="text" value={formData.street} onChange={e => handleInputChange('street', e.target.value)} onBlur={refinePin} placeholder="e.g. General Luis St." style={formErrors.street ? inputErrorStyle : inputStyle} />
              {fieldError(formErrors.street)}
            </div>
            <div>
              <label style={labelStyle}>ZIP Code <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="text" value={formData.zip} onChange={e => handleInputChange('zip', e.target.value)} placeholder="e.g. 1400" style={formErrors.zip ? inputErrorStyle : inputStyle} />
              {fieldError(formErrors.zip)}
            </div>
          </div>

          {/* Delivery notes / landmark for the rider */}
          <div>
            <label style={labelStyle}>Delivery Notes <span style={{ color: 'var(--gray)', fontSize: '0.7rem' }}>(optional — landmark or instructions for the rider)</span></label>
            <textarea
              value={formData.delivery_notes}
              onChange={e => handleInputChange('delivery_notes', e.target.value.slice(0, 300))}
              placeholder="e.g. Green gate beside the sari-sari store. Ring the bell / call on arrival."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--gray)', display: 'block', marginTop: '0.2rem', textAlign: 'right' }}>{(formData.delivery_notes || '').length}/300</span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
            <button type="button" onClick={resetForm} disabled={isSubmitting} style={{ padding: '0.625rem 1.25rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--gray)', fontSize: '0.875rem', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.5 : 1 }}>
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} style={{ padding: '0.625rem 1.5rem', background: isSubmitting ? 'var(--dark3)' : 'var(--gold)', border: 'none', borderRadius: '8px', color: isSubmitting ? 'var(--gray)' : 'var(--black)', fontSize: '0.875rem', fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
              {isSubmitting ? 'Saving…' : editingAddress ? 'Update Address' : 'Save Address'}
            </button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {!showForm && addresses.length === 0 && (
        <div style={{ padding: '2rem 1.5rem', background: 'var(--dark)', borderRadius: '12px', border: '1px solid rgba(212,168,67,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(212,168,67,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--white)', marginBottom: '0.35rem' }}>No delivery address yet</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--gray)', lineHeight: 1.5 }}>
              Add your delivery address so we can calculate shipping and process your orders.
              <br />Pinning your location on the map lets us give you an accurate shipping estimate at checkout.
            </div>
          </div>
          <button
            onClick={openAddForm}
            style={{ padding: '0.625rem 1.5rem', background: 'var(--gold)', border: 'none', borderRadius: '8px', color: 'var(--black)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Delivery Address
          </button>
        </div>
      )}

      {/* Address Cards */}
      {!showForm && addresses.map((address) => (
        <div key={address.id} style={{ padding: '1.25rem', background: 'var(--dark2)', borderRadius: '12px', border: `1px solid ${address.is_default ? 'var(--gold)' : 'var(--border)'}`, position: 'relative' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)' }}>{address.label || 'Address'}</span>
              {address.is_default && (
                <span style={{ padding: '0.2rem 0.6rem', background: 'var(--gold)', color: 'var(--black)', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Default</span>
              )}
            </div>
            {address.lat && address.lng && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--gray)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                Pinned
              </span>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--white)', marginBottom: '0.25rem' }}>
              {address.house_number} {address.street}{address.subdivision && <>, {address.subdivision}</>}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--white)', marginBottom: '0.25rem' }}>
              {address.barangay}, {address.city}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--white)', marginBottom: '0.25rem' }}>
              {address.province} {address.zip}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--gray)' }}>{address.phone}</div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => handleEdit(address)} disabled={isSubmitting} style={{ padding: '0.5rem 0.875rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--gray)', fontSize: '0.75rem', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { if (!isSubmitting) { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; } }}
              onMouseLeave={e => { if (!isSubmitting) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--gray)'; } }}>
              Edit
            </button>

            {!address.is_default && (
              <button onClick={() => handleSetDefault(address.id)} disabled={isSubmitting} style={{ padding: '0.5rem 0.875rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--gold)', fontSize: '0.75rem', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
                Set as Default
              </button>
            )}

            <button onClick={() => setDeletingId(deletingId === address.id ? null : address.id)} disabled={isSubmitting} style={{ padding: '0.5rem 0.875rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: deletingId === address.id ? 'var(--red)' : 'var(--gray)', fontSize: '0.75rem', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { if (!isSubmitting && deletingId !== address.id) { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)'; } }}
              onMouseLeave={e => { if (!isSubmitting && deletingId !== address.id) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--gray)'; } }}>
              Delete
            </button>

            {deletingId === address.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--gray)' }}>Delete this address?</span>
                <button onClick={() => handleDelete(address.id)} disabled={isSubmitting} style={{ padding: '0.35rem 0.625rem', background: 'var(--red)', border: 'none', borderRadius: '4px', color: 'var(--white)', fontSize: '0.7rem', fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>Confirm</button>
                <button onClick={() => setDeletingId(null)} disabled={isSubmitting} style={{ padding: '0.35rem 0.625rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--gray)', fontSize: '0.7rem', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
