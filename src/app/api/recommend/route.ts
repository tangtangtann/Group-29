// POST /api/recommend  — the AI rebalancing plan (owner: Siddharth)
// Body: RecommendRequest  → Response: RecommendResponse

import { NextResponse } from "next/server";
import { recommendWithBedrock } from "@/lib/bedrock";
import type { RecommendRequest } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecommendRequest;

    if (!Array.isArray(body.hospitals) || !Array.isArray(body.patients)) {
      return NextResponse.json(
        { error: "hospitals and patients are required arrays" },
        { status: 400 }
      );
    }

    const plan = await recommendWithBedrock(
      body.hospitals,
      body.patients,
      body.overrides ?? {}
    );

    return NextResponse.json(plan);
  } catch (err) {
    console.error("[/api/recommend]", err);
    return NextResponse.json(
      { error: "Failed to produce a plan" },
      { status: 500 }
    );
  }
}
