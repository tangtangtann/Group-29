// POST /api/dispatch  — apply approved transfers, return updated state (owner: Reshma)
// Body: DispatchRequest { transfers } + hospitals/patients snapshot in body.
// Stateless for the demo: the client sends current state, we return the result.

import { NextResponse } from "next/server";
import type {
  DispatchResponse,
  Hospital,
  Patient,
  TransferRecommendation,
} from "@/lib/types";
import { icuLoadPercent } from "@/lib/types";

interface Body {
  hospitals: Hospital[];
  patients: Patient[];
  transfers: TransferRecommendation[];
}

export async function POST(request: Request) {
  const { hospitals, patients, transfers } = (await request.json()) as Body;

  const hById: Record<string, Hospital> = {};
  for (const h of hospitals) hById[h.id] = { ...h };

  const pById: Record<string, Patient> = {};
  for (const p of patients) pById[p.id] = { ...p };

  // Apply each transfer: free a bed at origin, take one at destination.
  for (const t of transfers) {
    const from = hById[t.fromHospitalId];
    const to = hById[t.toHospitalId];
    const patient = pById[t.patientId];
    if (!from || !to || !patient) continue;

    from.icuOccupied = Math.max(0, from.icuOccupied - 1);
    to.icuOccupied = to.icuOccupied + 1;
    patient.currentHospitalId = to.id;
  }

  const updatedHospitals = Object.values(hById);
  const updatedPatients = Object.values(pById);

  const maxLoadPercent = updatedHospitals.reduce(
    (max, h) => Math.max(max, icuLoadPercent(h)),
    0
  );

  // Patients still stuck in an over-capacity hospital.
  const unplacedCount = updatedPatients.filter(
    (p) =>
      p.stableForTransfer &&
      icuLoadPercent(hById[p.currentHospitalId]) >= 100
  ).length;

  const body: DispatchResponse = {
    hospitals: updatedHospitals,
    patients: updatedPatients,
    maxLoadPercent,
    unplacedCount,
  };

  return NextResponse.json(body);
}
