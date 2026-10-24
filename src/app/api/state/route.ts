// GET /api/state  — current region snapshot (owner: Reshma)
// Query ?surge=1 to get the surge state, otherwise calm.

import { NextResponse } from "next/server";
import {
  HOSPITALS_CALM,
  HOSPITALS_SURGE,
  PATIENTS_SURGE,
  SURGE_INCIDENT,
} from "@/lib/seed";
import type { StateResponse } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const surge = searchParams.get("surge") === "1";

  const body: StateResponse = surge
    ? {
        incident: SURGE_INCIDENT,
        hospitals: HOSPITALS_SURGE,
        patients: PATIENTS_SURGE,
      }
    : {
        incident: null,
        hospitals: HOSPITALS_CALM,
        patients: [],
      };

  return NextResponse.json(body);
}
