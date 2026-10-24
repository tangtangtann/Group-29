// GET /api/state  — snapshot of every region (owner: Reshma)
// Query ?surge=1 to get the surge state, otherwise calm.

import { NextResponse } from "next/server";
import {
  HOSPITALS_CALM,
  HOSPITALS_SURGE,
  PATIENTS_SURGE,
  REGIONS,
  SURGE_INCIDENTS,
} from "@/lib/seed";
import type { StateResponse } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const surge = searchParams.get("surge") === "1";

  const body: StateResponse = surge
    ? {
        regions: REGIONS.map((r) => ({
          ...r,
          incident: SURGE_INCIDENTS[r.id] ?? null,
        })),
        hospitals: HOSPITALS_SURGE,
        patients: PATIENTS_SURGE,
      }
    : {
        regions: REGIONS,
        hospitals: HOSPITALS_CALM,
        patients: [],
      };

  return NextResponse.json(body);
}
