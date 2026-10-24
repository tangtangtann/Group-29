// =============================================================================
// MOCK PLANNER — TriageFlow
// A deterministic, rule-based rebalancer used as:
//   1. the fallback when Bedrock is unavailable, and
//   2. the mock the frontend builds against before the AI is wired.
// The REAL reasoning lives in the Bedrock call (see src/lib/bedrock.ts).
// This mock keeps the UI fully functional without AWS credentials.
// =============================================================================

import type {
  Hospital,
  Patient,
  RecommendResponse,
  TransferRecommendation,
  EquityFlag,
  Capability,
} from "./types";
import { freeIcuBeds, icuLoadPercent } from "./types";

function hasCapabilities(h: Hospital, needs: Capability[]): boolean {
  return needs.every((n) => h.capabilities.includes(n));
}

function distance(a: Hospital, b: Hospital): number {
  const dx = a.lng - b.lng;
  const dy = a.lat - b.lat;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Rough transport-minute estimate from grid distance. */
function transportMinutes(a: Hospital, b: Hospital): number {
  return Math.max(6, Math.round(distance(a, b) * 0.8));
}

export function planRebalance(
  hospitals: Hospital[],
  patients: Patient[],
  overrides: Record<string, string> = {}
): RecommendResponse {
  // Work on copies so we can decrement capacity as we assign.
  const beds: Record<string, number> = {};
  for (const h of hospitals) beds[h.id] = freeIcuBeds(h);

  const byId: Record<string, Hospital> = {};
  for (const h of hospitals) byId[h.id] = h;

  // Only move patients who are stable and sitting in an overloaded hospital.
  const overloaded = new Set(
    hospitals.filter((h) => icuLoadPercent(h) >= 100).map((h) => h.id)
  );

  const candidates = patients
    .filter((p) => p.stableForTransfer && overloaded.has(p.currentHospitalId))
    // highest acuity first
    .sort((a, b) => b.acuity - a.acuity);

  const transfers: TransferRecommendation[] = [];
  let rank = 1;

  for (const p of candidates) {
    const from = byId[p.currentHospitalId];

    // honor a coordinator override if present and valid
    let target: Hospital | undefined;
    const forced = overrides[p.id];
    if (forced && byId[forced] && beds[forced] > 0) {
      target = byId[forced];
    } else {
      // pick the capable hospital with free beds and shortest transport
      target = hospitals
        .filter(
          (h) =>
            h.id !== from.id &&
            beds[h.id] > 0 &&
            hasCapabilities(h, p.needs)
        )
        .sort((a, b) => transportMinutes(from, a) - transportMinutes(from, b))[0];
    }

    if (!target) continue; // no placement available

    beds[target.id] -= 1;

    transfers.push({
      rank: rank++,
      patientId: p.id,
      patientCode: p.code,
      fromHospitalId: from.id,
      toHospitalId: target.id,
      transportMinutes: transportMinutes(from, target),
      rationale: `${target.name} has ICU capacity and the required capabilities (${p.needs.join(
        ", "
      )}). Acuity ${p.acuity}/5 — ${p.summary}. Closest capable facility by transport time.`,
      confidence: 0.7,
    });
  }

  // Equity: flag under-resourced hospitals that are overloaded.
  const equityFlags: EquityFlag[] = hospitals
    .filter((h) => h.underResourced && icuLoadPercent(h) >= 100)
    .map((h) => ({
      hospitalId: h.id,
      message: `${h.name} is a safety-net facility running at ${icuLoadPercent(
        h
      )}% while better-resourced hospitals nearby have capacity. Prioritizing its decompression.`,
    }));

  const summary = transfers.length
    ? `Recommended ${transfers.length} transfer(s) to decompress ${overloaded.size} overloaded facility/ies. Highest-acuity patients moved first to the closest capable hospital with open beds.`
    : `No transfers needed — no stable patients in overloaded facilities, or no capacity available.`;

  return { transfers, equityFlags, summary, usedBedrock: false };
}
