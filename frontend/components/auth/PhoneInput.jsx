'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, AsYouType, getExampleNumber } from 'libphonenumber-js';
import phoneExamples from 'libphonenumber-js/examples.mobile.json';
import * as Flags from 'country-flag-icons/react/3x2';

/** Inline SVG flag (no image request → unaffected by CSP, and renders on every OS unlike emoji). */
const Flag = ({ code, style }) => {
  const Svg = Flags[code];
  if (!Svg) return <span style={{ width: 20, ...style }} />;
  return <Svg style={{ width: 20, height: 14, borderRadius: 2, flexShrink: 0, ...style }} />;
};

/** Validate an E.164 number. Exported so forms can reuse the exact same rule. */
export const isValidPhone = (e164) => {
  if (!e164) return false;
  const parsed = parsePhoneNumberFromString(e164);
  return !!parsed && parsed.isValid();
};

const regionName = (() => {
  let dn = null;
  try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* older browser */ }
  return (code) => {
    try { return dn?.of(code) || code; } catch { return code; }
  };
})();

const COUNTRIES = getCountries()
  .map(code => ({ code, name: regionName(code), dial: `+${getCountryCallingCode(code)}` }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * Phone field with a country selector. Defaults to the Philippines but any country can be picked —
 * libphonenumber-js enforces that country's own length/format, so nothing is hard-coded.
 * Emits the E.164 string (e.g. +639272518750) via onChange.
 */
export default function PhoneInput({ value = '', onChange, error, defaultCountry = 'PH' }) {
  const [country, setCountry] = useState(defaultCountry);
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState('');
  const [national, setNational] = useState('');
  const boxRef = useRef(null);

  // Keep local state in sync when the parent resets the form.
  useEffect(() => {
    if (!value) { setNational(''); return; }
    const parsed = parsePhoneNumberFromString(value);
    if (parsed) {
      if (parsed.country) setCountry(parsed.country);
      setNational(parsed.nationalNumber || '');
    }
  }, [value]);

  useEffect(() => {
    const onDocClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const dial = `+${getCountryCallingCode(country)}`;

  const emit = (nextCountry, nextNational) => {
    const digits = (nextNational || '').replace(/\D/g, '');
    onChange?.(digits ? `+${getCountryCallingCode(nextCountry)}${digits}` : '');
  };

  const handleNumber = (raw) => {
    // Cap to the SELECTED COUNTRY's own length, taken from the library's example number - PH is 10
    // digits, Singapore 8. The old cap was the generic E.164 ceiling (15 minus the country code), so
    // a Philippine field happily accepted 13 digits and only complained on submit. A field that lets
    // you type an impossible number and then scolds you is worse than one that cannot.
    // Falls back to the E.164 ceiling for any country with no example in the metadata.
    const e164Max = Math.max(4, 15 - getCountryCallingCode(country).length);
    let maxNational = e164Max;
    try {
      const example = getExampleNumber(country, phoneExamples);
      if (example?.nationalNumber) maxNational = example.nationalNumber.length;
    } catch { /* keep the E.164 ceiling */ }
    const digits = raw.replace(/\D/g, '').slice(0, maxNational);
    // Format as the user types, using the selected country's own rules.
    const pretty = new AsYouType(country).input(digits);
    setNational(pretty);
    emit(country, digits);
  };

  const pickCountry = (code) => {
    setCountry(code);
    setOpen(false);
    setSearch('');
    emit(code, national);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase() === q
    );
  }, [search]);

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title={COUNTRIES.find(c => c.code === country)?.name || country}
          style={{
            background: 'var(--dark3)', borderRight: '1px solid var(--border)', border: 'none',
            padding: '0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
            color: 'var(--white)', fontWeight: 700, fontSize: '0.95rem', flexShrink: 0, cursor: 'pointer',
          }}
        >
          <Flag code={country} />
          {dial}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <input
          type="tel"
          placeholder="912 345 6789"
          value={national}
          onChange={e => handleNumber(e.target.value)}
          className={error ? 'error' : ''}
          style={{ border: 'none', borderRadius: 0, flex: 1, background: 'transparent' }}
        />
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: '100%', minWidth: '240px',
          maxHeight: '240px', overflowY: 'auto', zIndex: 70,
          background: 'var(--dark2, #1f1f1f)', border: '1px solid var(--border)',
          borderRadius: '10px', boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
        }}>
          <div style={{ padding: '8px', position: 'sticky', top: 0, background: 'var(--dark2, #1f1f1f)' }}>
            <input
              autoFocus
              placeholder="Search country"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--dark3)', color: 'var(--white)', fontSize: '0.82rem' }}
            />
          </div>
          {filtered.map(c => (
            <button
              key={c.code}
              type="button"
              onClick={() => pickCountry(c.code)}
              style={{
                display: 'flex', justifyContent: 'space-between', gap: '8px', width: '100%',
                padding: '8px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                background: c.code === country ? 'rgba(212,168,67,0.15)' : 'transparent',
                color: 'var(--white)', fontSize: '0.82rem',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                <Flag code={c.code} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              </span>
              <span style={{ color: 'var(--gray)', flexShrink: 0 }}>{c.dial}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--gray)' }}>No match</div>
          )}
        </div>
      )}
    </div>
  );
}
