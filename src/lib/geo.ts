// =============================================================================
// GEO HELPERS — LifeLine
// Real-distance transport estimates. Shared by the rule-based planner and the
// Bedrock call (which receives a precomputed table, so the model never has to
// do trigonometry). Safe to import from client and server code.
// =============================================================================

import type { Hospital } from "./types";

/** Great-circle distance in kilometers. */
export function haversineKm(a: Hospital, b: Hospital): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rough critical-care ambulance time: 4 min to load plus 1.6 min per km
 * (about 37 km/h through Bay Area traffic). Minimum 6 minutes.
 */
export function transportMinutes(a: Hospital, b: Hospital): number {
  return Math.max(6, Math.round(4 + haversineKm(a, b) * 1.6));
}

/** minutes[fromId][toId] for each origin in `fromIds` to every other hospital. */
export function transportTable(
  hospitals: Hospital[],
  fromIds: string[]
): Record<string, Record<string, number>> {
  const byId: Record<string, Hospital> = {};
  for (const h of hospitals) byId[h.id] = h;
  const table: Record<string, Record<string, number>> = {};
  for (const id of fromIds) {
    const from = byId[id];
    if (!from) continue;
    table[id] = {};
    for (const to of hospitals) {
      if (to.id !== id) table[id][to.id] = transportMinutes(from, to);
    }
  }
  return table;
}
