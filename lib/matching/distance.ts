import type { DistanceHit, GeoCoords, GeoPlace } from "./types";

const EARTH_KM = 6371;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: GeoCoords, b: GeoCoords): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_KM * c;
}

export function nearestPlace(
  origin: GeoCoords | null,
  places: GeoPlace[]
): DistanceHit | null {
  if (!origin || places.length === 0) return null;
  let best: DistanceHit | null = null;
  for (const place of places) {
    const km = haversineKm(origin, place);
    if (!best || km < best.km) {
      best = { km, label: place.label, kind: place.kind };
    }
  }
  return best;
}

export function formatDistance(hit: DistanceHit | null): string | null {
  if (!hit) return null;
  const rounded = hit.km < 1 ? null : Math.round(hit.km);
  const dist = rounded == null ? "under 1 km" : `about ${rounded} km`;
  return `${dist} from ${hit.label}`;
}

/** 100 at 0 km, 0 at maxDistanceKm. */
export function proximityScore(km: number | null, maxDistanceKm: number): number | null {
  if (km == null || !(maxDistanceKm > 0)) return null;
  const ratio = 1 - km / maxDistanceKm;
  return Math.round(Math.min(100, Math.max(0, ratio * 100)));
}

export function blendScores(
  llmScore: number,
  proximity: number | null,
  weight: number
): number {
  const w = Math.min(100, Math.max(0, weight)) / 100;
  if (proximity == null || w === 0) return clampScore(llmScore);
  return clampScore(llmScore * (1 - w) + proximity * w);
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
