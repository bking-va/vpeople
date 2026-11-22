import { gunzipSync } from "zlib";
import { readFileSync } from "fs";
import path from "path";
import type { CoarseLocation, GeoCoords } from "./types";

type CityRow = {
  name: string;
  admin1: string;
  country: string;
  lat: number;
  lng: number;
};

type PostalRow = GeoCoords;

export type GeocodeIndexes = {
  citiesByNameCountry: Map<string, CityRow[]>;
  citiesByNameAdminCountry: Map<string, CityRow>;
  postal: Map<string, PostalRow>;
};

const COUNTRY_ALIASES: Record<string, string> = {
  ca: "CA",
  can: "CA",
  canada: "CA",
  us: "US",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  america: "US",
  in: "IN",
  ind: "IN",
  india: "IN",
  gb: "GB",
  uk: "GB",
  "united kingdom": "GB",
  "great britain": "GB",
  au: "AU",
  aus: "AU",
  australia: "AU",
  ie: "IE",
  ireland: "IE",
  de: "DE",
  germany: "DE",
  fr: "FR",
  france: "FR",
  mx: "MX",
  mexico: "MX",
  ph: "PH",
  philippines: "PH",
  nz: "NZ",
  "new zealand": "NZ",
};

const CA_PROVINCES: Record<string, string> = {
  ab: "alberta",
  alberta: "alberta",
  bc: "british columbia",
  "british columbia": "british columbia",
  mb: "manitoba",
  manitoba: "manitoba",
  nb: "new brunswick",
  "new brunswick": "new brunswick",
  nl: "newfoundland and labrador",
  "newfoundland and labrador": "newfoundland and labrador",
  newfoundland: "newfoundland and labrador",
  ns: "nova scotia",
  "nova scotia": "nova scotia",
  nt: "northwest territories",
  "northwest territories": "northwest territories",
  nu: "nunavut",
  nunavut: "nunavut",
  on: "ontario",
  ontario: "ontario",
  pe: "prince edward island",
  "prince edward island": "prince edward island",
  pei: "prince edward island",
  qc: "quebec",
  quebec: "quebec",
  québec: "quebec",
  sk: "saskatchewan",
  saskatchewan: "saskatchewan",
  yt: "yukon",
  yukon: "yukon",
};

const US_STATES: Record<string, string> = {
  al: "alabama",
  alabama: "alabama",
  ak: "alaska",
  alaska: "alaska",
  az: "arizona",
  arizona: "arizona",
  ar: "arkansas",
  arkansas: "arkansas",
  ca: "california",
  california: "california",
  co: "colorado",
  colorado: "colorado",
  ct: "connecticut",
  connecticut: "connecticut",
  de: "delaware",
  delaware: "delaware",
  dc: "district of columbia",
  "district of columbia": "district of columbia",
  fl: "florida",
  florida: "florida",
  ga: "georgia",
  georgia: "georgia",
  hi: "hawaii",
  hawaii: "hawaii",
  id: "idaho",
  idaho: "idaho",
  il: "illinois",
  illinois: "illinois",
  "in": "indiana",
  indiana: "indiana",
  ia: "iowa",
  iowa: "iowa",
  ks: "kansas",
  kansas: "kansas",
  ky: "kentucky",
  kentucky: "kentucky",
  la: "louisiana",
  louisiana: "louisiana",
  me: "maine",
  maine: "maine",
  md: "maryland",
  maryland: "maryland",
  ma: "massachusetts",
  massachusetts: "massachusetts",
  mi: "michigan",
  michigan: "michigan",
  mn: "minnesota",
  minnesota: "minnesota",
  ms: "mississippi",
  mississippi: "mississippi",
  mo: "missouri",
  missouri: "missouri",
  mt: "montana",
  montana: "montana",
  ne: "nebraska",
  nebraska: "nebraska",
  nv: "nevada",
  nevada: "nevada",
  nh: "new hampshire",
  "new hampshire": "new hampshire",
  nj: "new jersey",
  "new jersey": "new jersey",
  nm: "new mexico",
  "new mexico": "new mexico",
  ny: "new york",
  "new york": "new york",
  nc: "north carolina",
  "north carolina": "north carolina",
  nd: "north dakota",
  "north dakota": "north dakota",
  oh: "ohio",
  ohio: "ohio",
  ok: "oklahoma",
  oklahoma: "oklahoma",
  or: "oregon",
  oregon: "oregon",
  pa: "pennsylvania",
  pennsylvania: "pennsylvania",
  ri: "rhode island",
  "rhode island": "rhode island",
  sc: "south carolina",
  "south carolina": "south carolina",
  sd: "south dakota",
  "south dakota": "south dakota",
  tn: "tennessee",
  tennessee: "tennessee",
  tx: "texas",
  texas: "texas",
  ut: "utah",
  utah: "utah",
  vt: "vermont",
  vermont: "vermont",
  va: "virginia",
  virginia: "virginia",
  wa: "washington",
  washington: "washington",
  wv: "west virginia",
  "west virginia": "west virginia",
  wi: "wisconsin",
  wisconsin: "wisconsin",
  wy: "wyoming",
  wyoming: "wyoming",
};

let cached: GeocodeIndexes | null = null;

export function geocodeDataDir(): string {
  return path.join(process.cwd(), "data", "geocode");
}

export function loadGeocodeIndexes(dir = geocodeDataDir()): GeocodeIndexes {
  if (cached) return cached;
  const citiesByNameCountry = new Map<string, CityRow[]>();
  const citiesByNameAdminCountry = new Map<string, CityRow>();
  const postal = new Map<string, PostalRow>();

  const citiesPath = path.join(dir, "cities.tsv.gz");
  const postalPath = path.join(dir, "postal.tsv.gz");
  let citiesText = "";
  try {
    citiesText = readGzipTsv(citiesPath);
  } catch {
    console.error("geocode cities dataset missing");
    cached = { citiesByNameCountry, citiesByNameAdminCountry, postal };
    return cached;
  }
  for (const line of citiesText.split("\n")) {
    if (!line || line.startsWith("name\t")) continue;
    const [name, admin1, country, latStr, lngStr] = line.split("\t");
    if (!name || !country) continue;
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const row: CityRow = { name, admin1: admin1 || "", country, lat, lng };
    const nameKey = `${norm(name)}|${country}`;
    const list = citiesByNameCountry.get(nameKey);
    if (list) list.push(row);
    else citiesByNameCountry.set(nameKey, [row]);
    const adminKey = `${norm(name)}|${normAdmin(admin1, country)}|${country}`;
    if (adminKey) citiesByNameAdminCountry.set(adminKey, row);
  }

  let postalText = "";
  try {
    postalText = readGzipTsv(postalPath);
  } catch {
    console.error("geocode postal dataset missing");
  }
  for (const line of postalText.split("\n")) {
    if (!line || line.startsWith("country\t")) continue;
    const [country, code, latStr, lngStr] = line.split("\t");
    if (!country || !code) continue;
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    postal.set(`${country}|${code}`, { lat, lng });
  }

  cached = { citiesByNameCountry, citiesByNameAdminCountry, postal };
  return cached;
}

/** Test-only: drop the in-memory index so a different directory can be loaded. */
export function resetGeocodeCache() {
  cached = null;
}

export function normalizeCountryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (!trimmed) return null;
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return COUNTRY_ALIASES[norm(trimmed)] || trimmed.toUpperCase().slice(0, 2);
}

export function geocodeLocation(
  loc: CoarseLocation,
  indexes: GeocodeIndexes = loadGeocodeIndexes()
): GeoCoords | null {
  const country = normalizeCountryCode(loc.country);
  const postalHit = geocodePostal(loc.postalCode, country, indexes);
  if (postalHit) return postalHit;
  if (!loc.city || !country) return null;
  const admin = normAdmin(loc.province, country);
  if (admin) {
    const withAdmin = indexes.citiesByNameAdminCountry.get(
      `${norm(loc.city)}|${admin}|${country}`
    );
    if (withAdmin) return { lat: withAdmin.lat, lng: withAdmin.lng };
  }
  const matches = indexes.citiesByNameCountry.get(`${norm(loc.city)}|${country}`);
  if (!matches || matches.length === 0) return null;
  if (matches.length === 1) return { lat: matches[0].lat, lng: matches[0].lng };
  // Ambiguous city (e.g. Springfield, US) without a province: do not guess.
  return null;
}

export function geocodePostal(
  postalCode: string | null | undefined,
  country: string | null,
  indexes: GeocodeIndexes = loadGeocodeIndexes()
): GeoCoords | null {
  if (!postalCode || !country) return null;
  const keys = postalLookupKeys(postalCode, country);
  for (const key of keys) {
    const hit = indexes.postal.get(key);
    if (hit) return hit;
  }
  return null;
}

export function postalLookupKeys(postalCode: string, country: string): string[] {
  const cc = country.toUpperCase();
  const compact = postalCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return [];
  if (cc === "CA") {
    const fsa = compact.slice(0, 3);
    return fsa.length === 3 ? [`CA|${fsa}`] : [];
  }
  if (cc === "US") {
    const zip = compact.replace(/\D/g, "").slice(0, 5);
    return zip.length === 5 ? [`US|${zip}`] : [];
  }
  if (cc === "IN") {
    const pin = compact.replace(/\D/g, "");
    if (pin.length >= 3) return [`IN|${pin.slice(0, 3)}`];
  }
  return [`${cc}|${compact}`];
}

function readGzipTsv(filePath: string): string {
  return gunzipSync(readFileSync(filePath)).toString("utf8");
}

function norm(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normAdmin(admin: string | null | undefined, country: string | null): string {
  if (!admin) return "";
  const n = norm(admin);
  if (!n) return "";
  if (country === "CA") return CA_PROVINCES[n] || n;
  if (country === "US") return US_STATES[n] || n;
  return n;
}
