// =============================================================================
// SEED DATA — TriageFlow  (owner: Reshma, but shared by all)
// 8 hospitals + a patient set. Two states: calm and surge.
// Frontend can import these directly for mock rendering before the API is live.
// =============================================================================

import type { Hospital, Patient } from "./types";

// Coordinates are a simple 0..100 grid so an SVG map works without real geo.
// (lat = y, lng = x). Swap for real lat/lng if using Leaflet.
export const HOSPITALS_CALM: Hospital[] = [
  {
    id: "h1",
    name: "County General",
    lat: 50, lng: 48,
    icuTotal: 24, icuOccupied: 18,
    ventilatorsAvailable: 3,
    capabilities: ["icu", "ventilator", "cardiac", "trauma"],
    underResourced: true,
  },
  {
    id: "h2",
    name: "Mercy West",
    lat: 40, lng: 20,
    icuTotal: 20, icuOccupied: 8,
    ventilatorsAvailable: 7,
    capabilities: ["icu", "ventilator", "cardiac", "pediatric"],
  },
  {
    id: "h3",
    name: "Riverside Medical",
    lat: 68, lng: 30,
    icuTotal: 16, icuOccupied: 10,
    ventilatorsAvailable: 4,
    capabilities: ["icu", "ventilator", "dialysis"],
  },
  {
    id: "h4",
    name: "St. Agnes",
    lat: 30, lng: 62,
    icuTotal: 15, icuOccupied: 14,
    ventilatorsAvailable: 1,
    capabilities: ["icu", "ventilator", "trauma"],
    underResourced: true,
  },
  {
    id: "h5",
    name: "Lakeshore Hospital",
    lat: 72, lng: 70,
    icuTotal: 18, icuOccupied: 9,
    ventilatorsAvailable: 6,
    capabilities: ["icu", "ventilator", "cardiac", "dialysis"],
  },
  {
    id: "h6",
    name: "Northgate Medical",
    lat: 22, lng: 38,
    icuTotal: 12, icuOccupied: 7,
    ventilatorsAvailable: 3,
    capabilities: ["icu", "ventilator", "pediatric"],
  },
  {
    id: "h7",
    name: "Summit Regional",
    lat: 55, lng: 80,
    icuTotal: 22, icuOccupied: 12,
    ventilatorsAvailable: 5,
    capabilities: ["icu", "ventilator", "cardiac", "trauma", "dialysis"],
  },
  {
    id: "h8",
    name: "Harbor Community",
    lat: 85, lng: 50,
    icuTotal: 10, icuOccupied: 6,
    ventilatorsAvailable: 2,
    capabilities: ["icu", "ventilator"],
    underResourced: true,
  },
];

/**
 * Surge state: a mass-casualty + infectious spike concentrated on the
 * eastern/central hospitals. County General, St. Agnes, and Harbor go critical,
 * while Mercy West, Northgate, and Lakeshore still have room — the imbalance.
 */
export const HOSPITALS_SURGE: Hospital[] = HOSPITALS_CALM.map((h) => {
  switch (h.id) {
    case "h1": // County General -> over capacity
      return { ...h, icuOccupied: 26, ventilatorsAvailable: 0 };
    case "h4": // St. Agnes -> over capacity (under-resourced)
      return { ...h, icuOccupied: 17, ventilatorsAvailable: 0 };
    case "h8": // Harbor Community -> over capacity (under-resourced)
      return { ...h, icuOccupied: 12, ventilatorsAvailable: 0 };
    case "h3": // Riverside -> strained
      return { ...h, icuOccupied: 15, ventilatorsAvailable: 1 };
    default:
      return h;
  }
});

/** Patients who are candidates for transfer during the surge. */
export const PATIENTS_SURGE: Patient[] = [
  { id: "p1", code: "P-4417", currentHospitalId: "h1", acuity: 5, needs: ["icu", "ventilator", "cardiac"], summary: "Ventilated, cardiac instability", stableForTransfer: true },
  { id: "p2", code: "P-2231", currentHospitalId: "h1", acuity: 4, needs: ["icu", "ventilator"], summary: "Respiratory failure, declining O2", stableForTransfer: true },
  { id: "p3", code: "P-9087", currentHospitalId: "h1", acuity: 3, needs: ["icu"], summary: "Post-op monitoring", stableForTransfer: true },
  { id: "p4", code: "P-1120", currentHospitalId: "h4", acuity: 5, needs: ["icu", "ventilator", "trauma"], summary: "Multi-trauma, intubated", stableForTransfer: true },
  { id: "p5", code: "P-3344", currentHospitalId: "h4", acuity: 4, needs: ["icu", "ventilator"], summary: "Sepsis, pressor support", stableForTransfer: true },
  { id: "p6", code: "P-7781", currentHospitalId: "h4", acuity: 2, needs: ["icu"], summary: "Stable, step-down candidate", stableForTransfer: true },
  { id: "p7", code: "P-5590", currentHospitalId: "h8", acuity: 4, needs: ["icu", "ventilator"], summary: "COPD exacerbation, ventilated", stableForTransfer: true },
  { id: "p8", code: "P-6612", currentHospitalId: "h8", acuity: 3, needs: ["icu", "dialysis"], summary: "AKI requiring dialysis", stableForTransfer: true },
  { id: "p9", code: "P-2048", currentHospitalId: "h8", acuity: 5, needs: ["icu", "ventilator", "cardiac"], summary: "Post-MI, ventilated", stableForTransfer: false },
  { id: "p10", code: "P-8833", currentHospitalId: "h1", acuity: 3, needs: ["icu"], summary: "Observation, stable vitals", stableForTransfer: true },
];

export const SURGE_INCIDENT =
  "Multi-vehicle pileup on I-40 + respiratory surge. 3 facilities over capacity, 10 patients need placement.";
