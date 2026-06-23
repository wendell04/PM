// Philippine Standard Geographic Code (PSGC) API helper.
// Free, no key. Uses the `.json` endpoint variants for correct content-type.
// Docs: https://psgc.gitlab.io/api/

const BASE = 'https://psgc.gitlab.io/api';
export const NCR_REGION_CODE = '130000000'; // NCR has no provinces

const cache = new Map();

async function getJson(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`PSGC fetch failed: ${path} (${res.status})`);
  const data = await res.json();
  cache.set(path, data);
  return data;
}

const byName = (a, b) => a.name.localeCompare(b.name);
const slim = (arr) => arr.map((x) => ({ code: x.code, name: x.name })).sort(byName);

export function isNCR(regionCode) {
  return regionCode === NCR_REGION_CODE;
}

export async function fetchRegions() {
  return slim(await getJson('/regions.json'));
}

export async function fetchProvinces(regionCode) {
  if (!regionCode || isNCR(regionCode)) return []; // NCR has no provinces
  return slim(await getJson(`/regions/${regionCode}/provinces.json`));
}

// For NCR, cities come straight from the region (no province in between).
export async function fetchCities(regionCode, provinceCode) {
  if (isNCR(regionCode)) {
    return slim(await getJson(`/regions/${NCR_REGION_CODE}/cities-municipalities.json`));
  }
  if (!provinceCode) return [];
  return slim(await getJson(`/provinces/${provinceCode}/cities-municipalities.json`));
}

export async function fetchBarangays(cityMunCode) {
  if (!cityMunCode) return [];
  return slim(await getJson(`/cities-municipalities/${cityMunCode}/barangays.json`));
}
