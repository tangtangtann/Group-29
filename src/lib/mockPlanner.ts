// =============================================================================
// MOCK PLANNER — LifeLine
// A deterministic, rule-based rebalancer used as:
//   1. the fallback when Bedrock is unavailable, and
//   2. the mock the frontend builds against before the AI is wired.
// The REAL reasoning lives in the Bedrock call (see src/lib/bedrock.ts).
// This mock keeps the UI fully functional without AWS credentials.
//
// Placement rules (keep in sync with SYSTEM_PROMPT in bedrock.ts):
//   - Only decompress hospitals that are OVER capacity (occupied > total).
//   - Never use a hospital's last free bed if another capable hospital has 2+.
//   - Among capable hospitals within LOAD_WINDOW_MIN of the closest option,
//     pick the one with the lowest ICU load after the move; tie → shorter trip.
// =============================================================================

import type {
  Hospital,
  Patient,
  RecommendResponse,
  TransferRecommendation,
  EquityFlag,
  Capability,
} from "./types";
import { freeIcuBeds, icuLoadPercent, isOverCapacity } from "./types";
import { transportMinutes } from "./geo";

/** Extra transport minutes we accept to reach a less-loaded hospital. */
export const LOAD_WINDOW_MIN = 15;

function hasCapabilities(h: Hospital, needs: Capability[]): boolean {
  return needs.every((n) => h.capabilities.includes(n));
}

export function planRebalance(
  hospitals: Hospital[],
  patients: Patient[],
  overrides: Record<string, string> = {}
): RecommendResponse {
  // Track beds and occupancy as we assign, so later picks see earlier ones.
  const beds: Record<string, number> = {};
  const occupied: Record<string, number> = {};
  for (const h of hospitals) {
    beds[h.id] = freeIcuBeds(h);
    occupied[h.id] = h.icuOccupied;
  }

  const byId: Record<string, Hospital> = {};
  for (const h of hospitals) byId[h.id] = h;

  const loadAfterMove = (h: Hospital) =>
    h.icuTotal === 0 ? Infinity : (occupied[h.id] + 1) / h.icuTotal;

  // Only move stable patients sitting in an over-capacity hospital.
  const overloaded = new Set(
    hospitals.filter(isOverCapacity).map((h) => h.id)
  );

  const candidates = patients
    .filter((p) => p.stableForTransfer && overloaded.has(p.currentHospitalId))
    // highest acuity first
    .sort((a, b) => b.acuity - a.acuity);

  const transfers: TransferRecommendation[] = [];
  let rank = 1;

  for (const p of candidates) {
    const from = byId[p.currentHospitalId];
    let target: Hospital | undefined;
    let rationale = "";

    // honor a coordinator override if present and valid
    const forced = overrides[p.id];
    if (forced && byId[forced] && beds[forced] > 0) {
      target = byId[forced];
      rationale = `Coordinator override: ${target.name}. It has ICU capacity for this patient (acuity ${p.acuity}/5, ${p.summary}).`;
    } else {
      const capable = hospitals.filter(
        (h) => h.id !== from.id && beds[h.id] > 0 && hasCapabilities(h, p.needs)
      );
      // Don't take anyone's last bed while another capable hospital has room.
      const roomy = capable.filter((h) => beds[h.id] >= 2);
      const pool = roomy.length > 0 ? roomy : capable;
      if (pool.length === 0) continue; // no placement available

      const nearest = Math.min(...pool.map((h) => transportMinutes(from, h)));
      target = pool
        .filter((h) => transportMinutes(from, h) <= nearest + LOAD_WINDOW_MIN)
        .sort(
          (a, b) =>
            loadAfterMove(a) - loadAfterMove(b) ||
            transportMinutes(from, a) - transportMinutes(from, b)
        )[0];

      const endLoad = Math.round(loadAfterMove(target) * 100);
      rationale = `${target.name} has the required capabilities (${p.needs.join(
        ", "
      )}) and ends at ${endLoad}% ICU load, the lowest among capable hospitals within ${LOAD_WINDOW_MIN} min of the closest option. Acuity ${p.acuity}/5: ${p.summary}.`;
    }

    beds[target.id] -= 1;
    occupied[target.id] += 1;

    transfers.push({
      rank: rank++,
      patientId: p.id,
      patientCode: p.code,
      fromHospitalId: from.id,
      toHospitalId: target.id,
      transportMinutes: transportMinutes(from, target),
      rationale,
      confidence: 0.7,
    });
  }

  // Equity: flag under-resourced hospitals that are over capacity.
  const equityFlags: EquityFlag[] = hospitals
    .filter((h) => h.underResourced && isOverCapacity(h))
    .map((h) => ({
      hospitalId: h.id,
      message: `${h.name} is a safety-net facility running at ${icuLoadPercent(
        h
      )}% while better-resourced hospitals nearby have capacity. Prioritizing its decompression.`,
    }));

  const summary = transfers.length
    ? `Recommended ${transfers.length} transfer(s) to decompress ${overloaded.size} over-capacity facility/ies. Highest-acuity patients move first, spread across the least-loaded capable hospitals so no receiving hospital is pushed to full.`
    : `No transfers needed: no stable patients in over-capacity facilities, or no capacity available.`;

  return { transfers, equityFlags, summary, usedBedrock: false };
}
