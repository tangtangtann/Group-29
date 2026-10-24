// =============================================================================
// BEDROCK CLIENT — TriageFlow  (owner: Siddharth)
// The core AI reasoning. Sends the region state to Claude on Amazon Bedrock
// and parses a structured rebalancing plan back out.
// Falls back to the deterministic mock planner if Bedrock is unavailable.
// =============================================================================

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  Hospital,
  Patient,
  RecommendResponse,
  TransferRecommendation,
  EquityFlag,
} from "./types";
import { planRebalance } from "./mockPlanner";

const REGION = process.env.AWS_REGION || "us-east-1";
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ||
  "anthropic.claude-3-5-sonnet-20240620-v1:0";

/** Instruction that frames Claude as the MOCC reasoning engine. */
const SYSTEM_PROMPT = `You are the reasoning engine for a Medical Operations Coordination Center (MOCC).
During a surge, some hospitals are over capacity while others nearby have room.
Your job: produce a patient load-balancing plan that moves the right patients to the right hospitals.

Rules:
- Only move patients who are stableForTransfer: true and currently in an OVER-CAPACITY hospital (icuOccupied >= icuTotal).
- A receiving hospital MUST have free ICU beds (icuTotal - icuOccupied > 0) AND include ALL of the patient's required capabilities.
- Do not exceed a receiving hospital's free beds across the whole plan (account for beds you consume as you assign).
- Prioritize higher-acuity patients (5 is most critical) first.
- Prefer shorter transport time when multiple hospitals qualify.
- EQUITY: if an under-resourced / safety-net hospital is over capacity while better-resourced hospitals have room, prioritize decompressing it and raise an equity flag.
- Keep a human in control: give a clear, plain-language rationale for every move so the coordinator can trust and defend it.

Respond with STRICT JSON ONLY, no prose, matching this TypeScript type:
{
  "transfers": [
    { "rank": number, "patientId": string, "patientCode": string,
      "fromHospitalId": string, "toHospitalId": string,
      "transportMinutes": number, "rationale": string, "confidence": number }
  ],
  "equityFlags": [ { "hospitalId": string, "message": string } ],
  "summary": string
}`;

function buildUserMessage(
  hospitals: Hospital[],
  patients: Patient[],
  overrides: Record<string, string>
): string {
  return JSON.stringify(
    {
      instruction:
        "Produce the rebalancing plan as strict JSON. Respect any coordinator overrides (patientId -> toHospitalId) exactly, then plan the rest around them.",
      overrides,
      hospitals,
      patients,
    },
    null,
    2
  );
}

/** Pull the first JSON object out of a model text response. */
function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in response");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function recommendWithBedrock(
  hospitals: Hospital[],
  patients: Patient[],
  overrides: Record<string, string> = {}
): Promise<RecommendResponse> {
  // No credentials configured → use the deterministic mock so the app still works.
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    return planRebalance(hospitals, patients, overrides);
  }

  try {
    const client = new BedrockRuntimeClient({ region: REGION });

    const messages: Message[] = [
      {
        role: "user",
        content: [{ text: buildUserMessage(hospitals, patients, overrides) }],
      },
    ];

    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages,
      inferenceConfig: { maxTokens: 2000, temperature: 0.2 },
    });

    const response = await client.send(command);
    const text =
      response.output?.message?.content?.find((c) => "text" in c)?.text ?? "";

    const parsed = extractJson(text);

    const transfers: TransferRecommendation[] = Array.isArray(parsed.transfers)
      ? parsed.transfers
      : [];
    const equityFlags: EquityFlag[] = Array.isArray(parsed.equityFlags)
      ? parsed.equityFlags
      : [];

    return {
      transfers,
      equityFlags,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      usedBedrock: true,
    };
  } catch (err) {
    console.error("[bedrock] falling back to mock planner:", err);
    const fallback = planRebalance(hospitals, patients, overrides);
    return { ...fallback, summary: `${fallback.summary} (Bedrock unavailable — showing rule-based fallback.)` };
  }
}
