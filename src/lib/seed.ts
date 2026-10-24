// =============================================================================
// SEED DATA — LifeLine  (owner: Reshma, but shared by all)
// Three Bay Area coordination regions, each with its own hospitals.
// Hospital names are FICTIONAL, placed at real neighborhood coordinates.
// Capacity numbers are simulated. Two states: calm and surge.
//
// Surge story:
//   - San Francisco & Peninsula: earthquake. 2 safety-net hospitals overloaded.
//   - East Bay: wildfire smoke + freeway pileup. 3 hospitals overloaded.
//   - South Bay: elevated admissions but still balanced (shows that selecting
//     a region matters: nothing to rebalance there).
// =============================================================================

import type { Capability, Hospital, Patient, Region } from "./types";

/** Whole Bay Area, for the initial map view: [[west, south], [east, north]]. */
export const BAY_AREA_BOUNDS: [[number, number], [number, number]] = [
  [-122.55, 37.28],
  [-121.8, 37.98],
];

export const REGIONS: Region[] = [
  { id: "sf", name: "San Francisco & Peninsula", incident: null },
  { id: "east", name: "East Bay", incident: null },
  { id: "south", name: "South Bay", incident: null },
];

export const SURGE_INCIDENTS: Record<string, string> = {
  sf: "M6.4 earthquake on the Peninsula segment of the San Andreas fault. Building collapses in the Mission and Bayview: 2 safety-net hospitals over capacity.",
  east: "Wildfire smoke event plus a 14-vehicle pileup on I-880. 3 facilities over capacity, Oakland and Richmond hit hardest.",
  south: "Elevated respiratory admissions from regional smoke. Hospitals strained but within capacity.",
};

const ALL: Capability[] = ["icu", "ventilator", "cardiac", "trauma", "dialysis"];

function hospital(
  id: string,
  regionId: string,
  name: string,
  lat: number,
  lng: number,
  icuTotal: number,
  icuOccupied: number,
  ventilatorsAvailable: number,
  capabilities: Capability[],
  underResourced = false
): Hospital {
  return {
    id, regionId, name, lat, lng,
    icuTotal, icuOccupied, ventilatorsAvailable, capabilities,
    ...(underResourced ? { underResourced: true } : {}),
  };
}

export const HOSPITALS_CALM: Hospital[] = [
  // --- San Francisco & Peninsula --------------------------------------------
  hospital("sf1", "sf", "Mission District General", 37.7599, -122.4148, 24, 18, 3, ["icu", "ventilator", "cardiac", "trauma"], true),
  hospital("sf2", "sf", "Pacific Heights Medical", 37.7905, -122.434, 20, 9, 6, ["icu", "ventilator", "cardiac", "pediatric"]),
  hospital("sf3", "sf", "Bayview Community Hospital", 37.734, -122.388, 12, 8, 2, ["icu", "ventilator"], true),
  hospital("sf4", "sf", "Sunset Medical Center", 37.753, -122.487, 16, 10, 4, ["icu", "ventilator", "dialysis"]),
  hospital("sf5", "sf", "Daly City Regional", 37.6879, -122.4702, 18, 9, 5, ["icu", "ventilator", "cardiac", "dialysis"]),
  hospital("sf6", "sf", "San Mateo Medical", 37.563, -122.3255, 22, 12, 6, ALL),
  hospital("sf7", "sf", "Redwood City Hospital", 37.4852, -122.2364, 14, 7, 4, ["icu", "ventilator", "pediatric"]),

  // --- East Bay ---------------------------------------------------------------
  hospital("eb1", "east", "Oakland Highland General", 37.799, -122.231, 22, 16, 3, ["icu", "ventilator", "cardiac", "trauma"], true),
  hospital("eb2", "east", "Berkeley Alta Medical", 37.8565, -122.257, 18, 9, 5, ["icu", "ventilator", "cardiac", "pediatric"]),
  hospital("eb3", "east", "Richmond Community Hospital", 37.9358, -122.3477, 12, 7, 2, ["icu", "ventilator", "dialysis"], true),
  hospital("eb4", "east", "San Leandro Hospital", 37.7249, -122.1561, 14, 9, 3, ["icu", "ventilator", "dialysis"]),
  hospital("eb5", "east", "Walnut Creek Medical", 37.9101, -122.0652, 22, 11, 7, ALL),
  hospital("eb6", "east", "Hayward Regional", 37.6688, -122.0808, 16, 8, 4, ["icu", "ventilator", "cardiac"]),
  hospital("eb7", "east", "Fremont Valley Hospital", 37.5485, -121.9886, 14, 7, 4, ["icu", "ventilator", "pediatric", "dialysis"]),

  // --- South Bay --------------------------------------------------------------
  hospital("sb1", "south", "San Jose Valley Medical", 37.3138, -121.9325, 26, 18, 5, ["icu", "ventilator", "cardiac", "trauma"]),
  hospital("sb2", "south", "East San Jose Community", 37.35, -121.84, 12, 8, 2, ["icu", "ventilator"], true),
  hospital("sb3", "south", "Santa Clara Medical", 37.349, -121.98, 18, 10, 5, ["icu", "ventilator", "cardiac", "dialysis"]),
  hospital("sb4", "south", "Mountain View Medical", 37.37, -122.08, 14, 7, 4, ["icu", "ventilator", "pediatric"]),
  hospital("sb5", "south", "Palo Alto Medical", 37.441, -122.143, 24, 13, 6, ["icu", "ventilator", "cardiac", "trauma", "pediatric"]),
];

/** Occupancy / ventilator changes during the surge. Others keep calm values. */
const SURGE_CHANGES: Record<string, Partial<Hospital>> = {
  // SF: Mission and Bayview (both safety-net) overloaded; Sunset down to 1 bed.
  sf1: { icuOccupied: 28, ventilatorsAvailable: 0 },
  sf3: { icuOccupied: 15, ventilatorsAvailable: 0 },
  sf4: { icuOccupied: 15, ventilatorsAvailable: 1 },
  // East Bay: Oakland, Richmond (safety-net) and San Leandro overloaded.
  eb1: { icuOccupied: 26, ventilatorsAvailable: 0 },
  eb3: { icuOccupied: 15, ventilatorsAvailable: 0 },
  eb4: { icuOccupied: 16, ventilatorsAvailable: 0 },
  eb6: { icuOccupied: 15, ventilatorsAvailable: 1 },
  // South Bay: strained, not over capacity.
  sb1: { icuOccupied: 23, ventilatorsAvailable: 2 },
  sb2: { icuOccupied: 11, ventilatorsAvailable: 1 },
};

export const HOSPITALS_SURGE: Hospital[] = HOSPITALS_CALM.map((h) => ({
  ...h,
  ...(SURGE_CHANGES[h.id] ?? {}),
}));

function patient(
  id: string,
  code: string,
  currentHospitalId: string,
  acuity: Patient["acuity"],
  needs: Capability[],
  summary: string,
  stableForTransfer = true
): Patient {
  return { id, code, currentHospitalId, acuity, needs, summary, stableForTransfer };
}

/** Transfer candidates during the surge, in the overloaded hospitals. */
export const PATIENTS_SURGE: Patient[] = [
  // Mission District General (28/24)
  patient("sf-p1", "P-4417", "sf1", 5, ["icu", "ventilator", "cardiac"], "Crush injury, ventilated, cardiac instability"),
  patient("sf-p2", "P-1120", "sf1", 5, ["icu", "ventilator", "trauma"], "Multi-trauma from building collapse, intubated"),
  patient("sf-p3", "P-2231", "sf1", 4, ["icu", "ventilator"], "Respiratory failure after dust inhalation"),
  patient("sf-p4", "P-9087", "sf1", 3, ["icu"], "Post-op monitoring"),
  patient("sf-p5", "P-8833", "sf1", 2, ["icu"], "Observation, stable vitals"),
  patient("sf-p6", "P-2048", "sf1", 5, ["icu", "ventilator", "cardiac"], "Post-MI, ventilated, too unstable to move", false),
  // Bayview Community Hospital (15/12)
  patient("sf-p7", "P-5590", "sf3", 4, ["icu", "ventilator"], "COPD exacerbation, ventilated"),
  patient("sf-p8", "P-3344", "sf3", 4, ["icu", "ventilator"], "Sepsis, pressor support"),
  patient("sf-p9", "P-6612", "sf3", 3, ["icu", "dialysis"], "Acute kidney injury, needs dialysis"),
  patient("sf-p10", "P-4102", "sf3", 3, ["icu", "pediatric"], "Pediatric asthma, high-flow oxygen"),
  patient("sf-p11", "P-7781", "sf3", 2, ["icu"], "Stable, step-down candidate"),

  // Oakland Highland General (26/22)
  patient("eb-p1", "P-5102", "eb1", 5, ["icu", "ventilator", "trauma"], "Pileup multi-trauma, intubated"),
  patient("eb-p2", "P-5118", "eb1", 5, ["icu", "ventilator", "cardiac"], "Blunt chest trauma, ventilated"),
  patient("eb-p3", "P-5131", "eb1", 4, ["icu", "ventilator"], "Smoke inhalation, intubated"),
  patient("eb-p4", "P-5144", "eb1", 3, ["icu"], "Post-op, stable"),
  patient("eb-p5", "P-5157", "eb1", 2, ["icu"], "Step-down candidate"),
  patient("eb-p6", "P-5160", "eb1", 5, ["icu", "ventilator", "cardiac"], "Post-cardiac-arrest, too unstable to move", false),
  // Richmond Community Hospital (15/12)
  patient("eb-p7", "P-6201", "eb3", 4, ["icu", "ventilator"], "Smoke-triggered asthma, ventilated"),
  patient("eb-p8", "P-6214", "eb3", 4, ["icu", "dialysis"], "Renal failure, missed dialysis"),
  patient("eb-p9", "P-6227", "eb3", 3, ["icu", "pediatric"], "Pediatric burn, monitoring"),
  patient("eb-p10", "P-6230", "eb3", 2, ["icu"], "Observation"),
  // San Leandro Hospital (16/14)
  patient("eb-p11", "P-7305", "eb4", 4, ["icu", "ventilator"], "COPD, ventilated"),
  patient("eb-p12", "P-7318", "eb4", 3, ["icu", "cardiac"], "Unstable angina, monitoring"),
  patient("eb-p13", "P-7321", "eb4", 2, ["icu"], "Stable, step-down candidate"),
];
