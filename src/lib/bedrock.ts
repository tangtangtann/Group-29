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

// BEDROCK_REGION works on Amplify (which reserves the AWS_ prefix);
// AWS_REGION / AWS_DEFAULT_REGION cover local shells and the AWS CLI convention.
const REGION =
  process.env.BEDROCK_REGION ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-east-1";

// Cross-region inference profile ID. Older Claude IDs reach end-of-life on
// Bedrock; confirm this one is enabled in your account, or override it.
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ||
  "us.anthropic.claude-sonnet-5-5";

// Amplify Hosting cuts SSR requests off at about 30s with a 504. Abort the
// Bedrock call before that so the user gets the rule-based fallback instead
// of an error. Sonnet is slower than Haiku, so this matters.
const BEDROCK_TIMEOUT_MS = Number(process.env.BEDROCK_TIMEOUT_MS) || 25000;

/**
 * Call Bedrock only when credentials are likely present. On Amplify/Lambda
 * credentials come from an IAM role (no env keys), so BEDROCK_ENABLED=true
 * forces the real call there. Any Bedrock error still falls back to the mock.
 */
function bedrockConfigured(): boolean {
  return Boolean(
    process.env.BEDROCK_ENABLED === "true" ||
      process.env.TF_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_PROFILE
  );
}

/**
 * Explicit credentials for hosts that block the AWS_ env prefix (Amplify).
 * Set TF_ACCESS_KEY_ID / TF_SECRET_ACCESS_KEY / TF_SESSION_TOKEN there.
 * Returns undefined otherwise, so the SDK uses its default chain
 * (AWS_* env vars, profile, or an IAM role).
 */
function explicitCredentials() {
  const accessKeyId = process.env.TF_ACCESS_KEY_ID;
  const secretAccessKey = process.env.TF_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return undefined;
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.TF_SESSION_TOKEN || undefined,
  };
}

/** Instruction that frames Claude as the MOCC reasoning engine. */
const SYSTEM_PROMPT = `You are the reasoning engine for a Medical Operations Coordination Center (MOCC).
During a surge, some hospitals are over capacity while others nearby have room.
Your job: produce a patient load-balancing plan that moves the right patients to the right hospitals.

Rules:
- Only move patients who are stableForTransfer: true and currently in an OVER-CAPACITY hospital (icuOccupied > icuTotal). A hospital at exactly 100% is full, not over capacity: do not move patients out of it.
- A receiving hospital MUST have free ICU beds (icuTotal - icuOccupied > 0) AND include ALL of the patient's required capabilities.
- Do not exceed a receiving hospital's free beds across the whole plan (account for beds you consume as you assign).
- Prioritize higher-acuity patients (5 is most critical) first.
- transportMinutes = max(6, round(0.8 * sqrt((lat1-lat2)^2 + (lng1-lng2)^2))) between the two hospitals.
- LOAD-AWARE PLACEMENT, decided patient by patient in priority order, tracking beds you have already used:
  1. Never use a hospital's last free bed if another capable hospital still has 2 or more free beds.
  2. Among the remaining capable hospitals, consider those within 15 minutes of the closest one.
  3. Pick the one with the lowest ICU load after the move ((icuOccupied + 1) / icuTotal); break ties by shorter transport.
  The goal is to spread patients so no receiving hospital is pushed to full while others have room.
- EQUITY: if an under-resourced / safety-net hospital is over capacity while better-resourced hospitals have room, prioritize decompressing it and raise an equity flag.
- Keep a human in control: give a clear, plain-language rationale for every move so the coordinator can trust and defend it.
- Be concise: each rationale is 1-2 sentences, the summary at most 3 sentences.

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
  if (!bedrockConfigured()) {
    return planRebalance(hospitals, patients, overrides);
  }

  try {
    const client = new BedrockRuntimeClient({
      region: REGION,
      credentials: explicitCredentials(),
    });

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

    const response = await client.send(command, {
      abortSignal: AbortSignal.timeout(BEDROCK_TIMEOUT_MS),
    });
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
