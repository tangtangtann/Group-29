// =============================================================================
// SHARED CONTRACT — TriageFlow
// This file is the single source of truth between Backend and Frontend.
// Backend (Siddharth/Reshma) produces these shapes; Frontend (Nicole/Vatey)
// renders them. Change this file together, not in isolation.
// =============================================================================

/** A clinical capability a hospital may or may not have. */
export type Capability =
  | "icu"
  | "ventilator"
  | "cardiac"
  | "pediatric"
  | "trauma"
  | "dialysis";

/** How loaded a hospital is. Drives the map color. */
export type LoadStatus = "healthy" | "strained" | "critical";

/** A hospital in the region. */
export interface Hospital {
  id: string;
  name: string;
  /** For map placement. lat/lng (or x/y on an SVG map 0..100). */
  lat: number;
  lng: number;
  /** Total ICU beds. */
  icuTotal: number;
  /** Currently occupied ICU beds. */
  icuOccupied: number;
  /** Ventilators available (free). */
  ventilatorsAvailable: number;
  /** Clinical capabilities this hospital supports. */
  capabilities: Capability[];
  /** Optional: flag for an under-resourced / safety-net hospital (equity). */
  underResourced?: boolean;
}

/** A patient who may need to be transferred. */
export interface Patient {
  id: string;
  /** Short display code, e.g. "P-4417". */
  code: string;
  /** Hospital this patient is currently in. */
  currentHospitalId: string;
  /** 1 (stable) .. 5 (critical). Drives transfer priority. */
  acuity: 1 | 2 | 3 | 4 | 5;
  /** What this patient clinically needs at the receiving hospital. */
  needs: Capability[];
  /** Short human description, e.g. "ventilated, cardiac". */
  summary: string;
  /** Can this patient tolerate transport right now? */
  stableForTransfer: boolean;
}

/** One recommended move produced by Bedrock. */
export interface TransferRecommendation {
  /** Order of execution; 1 = do first. */
  rank: number;
  patientId: string;
  patientCode: string;
  fromHospitalId: string;
  toHospitalId: string;
  /** Minutes of estimated transport time. */
  transportMinutes: number;
  /** Plain-language justification from the AI. */
  rationale: string;
  /** Model's confidence 0..1 (optional). */
  confidence?: number;
}

/** An equity concern the AI surfaced. */
export interface EquityFlag {
  hospitalId: string;
  message: string;
}

// =============================================================================
// API SHAPES
// =============================================================================

/** GET /api/state → current region snapshot. */
export interface StateResponse {
  incident: string | null; // null = calm, otherwise description
  hospitals: Hospital[];
  patients: Patient[];
}

/** POST /api/recommend body. */
export interface RecommendRequest {
  hospitals: Hospital[];
  patients: Patient[];
  /** Optional overrides the coordinator already locked in (patientId → toHospitalId). */
  overrides?: Record<string, string>;
}

/** POST /api/recommend → the AI rebalancing plan. */
export interface RecommendResponse {
  transfers: TransferRecommendation[];
  equityFlags: EquityFlag[];
  /** Short overall summary of the plan. */
  summary: string;
  /** True if produced by Bedrock, false if the mock fallback was used. */
  usedBedrock: boolean;
}

/** POST /api/dispatch body — apply approved transfers. */
export interface DispatchRequest {
  transfers: TransferRecommendation[];
}

/** POST /api/dispatch → updated state after applying transfers. */
export interface DispatchResponse {
  hospitals: Hospital[];
  patients: Patient[];
  maxLoadPercent: number;
  unplacedCount: number;
}

// =============================================================================
// HELPERS
// =============================================================================

export function icuLoadPercent(h: Hospital): number {
  if (h.icuTotal === 0) return 100;
  return Math.round((h.icuOccupied / h.icuTotal) * 100);
}

export function loadStatus(h: Hospital): LoadStatus {
  const pct = icuLoadPercent(h);
  if (pct >= 100) return "critical";
  if (pct >= 85) return "strained";
  return "healthy";
}

export function freeIcuBeds(h: Hospital): number {
  return Math.max(0, h.icuTotal - h.icuOccupied);
}
