// PlanPanel — AI recommendation list with approve/override. (owner: Vatey)
"use client";

import type {
  Hospital,
  RecommendResponse,
  TransferRecommendation,
} from "@/lib/types";
import { freeIcuBeds } from "@/lib/types";

export default function PlanPanel({
  plan,
  hospitals,
  approved,
  onApprove,
  onApproveAll,
  onOverride,
  loading,
}: {
  plan: RecommendResponse | null;
  hospitals: Hospital[];
  approved: Set<string>;
  onApprove: (patientId: string) => void;
  /** Approve every transfer, or clear all approvals if they're all approved. */
  onApproveAll: () => void;
  onOverride: (patientId: string, toHospitalId: string) => void;
  loading: boolean;
}) {
  const hById: Record<string, Hospital> = {};
  for (const h of hospitals) hById[h.id] = h;

  const allApproved =
    !!plan &&
    plan.transfers.length > 0 &&
    plan.transfers.every((t) => approved.has(t.patientId));

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-300">
        Analyzing patients across facilities…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-400">
        Trigger a surge, then run <span className="text-sky-400">Rebalance with AI</span> to
        generate a transfer plan.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Recommended transfers</h3>
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              plan.usedBedrock
                ? "bg-sky-500/20 text-sky-300"
                : "bg-amber-500/20 text-amber-300"
            }`}
          >
            {plan.usedBedrock ? "Amazon Bedrock · Claude" : "Rule-based fallback"}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">{plan.summary}</p>
        {plan.transfers.length > 0 && (
          <button
            onClick={onApproveAll}
            className={`mt-3 w-full rounded-md px-3 py-1.5 text-xs font-medium text-white ${
              allApproved
                ? "bg-slate-600 hover:bg-slate-500"
                : "bg-green-600 hover:bg-green-500"
            }`}
          >
            {allApproved
              ? "Clear all approvals"
              : `Approve all ${plan.transfers.length} transfers`}
          </button>
        )}
      </div>

      {/* Opaque backgrounds: these float over the white map. */}
      {plan.equityFlags.map((f) => (
        <div
          key={f.hospitalId}
          className="rounded-xl border border-amber-500/60 bg-amber-950 p-3 text-xs text-amber-100 shadow-lg"
        >
          ⚠️ Equity: {f.message}
        </div>
      ))}

      {plan.transfers.map((t) => (
        <TransferCard
          key={t.patientId}
          t={t}
          hospitals={hospitals}
          hById={hById}
          approved={approved.has(t.patientId)}
          onApprove={() => onApprove(t.patientId)}
          onOverride={(to) => onOverride(t.patientId, to)}
        />
      ))}

      {plan.transfers.length === 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
          No transfers recommended.
        </div>
      )}
    </div>
  );
}

function TransferCard({
  t,
  hospitals,
  hById,
  approved,
  onApprove,
  onOverride,
}: {
  t: TransferRecommendation;
  hospitals: Hospital[];
  hById: Record<string, Hospital>;
  approved: boolean;
  onApprove: () => void;
  onOverride: (toHospitalId: string) => void;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        approved
          ? "border-green-500/60 bg-green-950"
          : "border-slate-700 bg-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">
            <span className="mr-2 inline-block rounded bg-slate-700 px-1.5 text-xs">#{t.rank}</span>
            {t.patientCode}
          </div>
          <div className="mt-1 text-xs text-slate-300">
            {hById[t.fromHospitalId]?.name} <span className="text-sky-400">→</span>{" "}
            {hById[t.toHospitalId]?.name} · {t.transportMinutes} min
          </div>
        </div>
        {approved && <span className="text-xs text-green-400">✓ Approved</span>}
      </div>

      <p className="mt-2 text-xs text-slate-400">{t.rationale}</p>

      <div className="mt-3 flex items-center gap-2">
        {/* <button //Change Approve button
          onClick={onApprove}
          disabled={approved}
          className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Approve
        </button> */}
        <button
          onClick={onApprove}
          className={`rounded-md px-3 py-1 text-xs font-medium text-white ${
            approved
              ? "bg-slate-600 hover:bg-slate-500"
              : "bg-green-600 hover:bg-green-500"
          }`}
        >
          {approved ? "Undo approval" : "Approve"}
        </button>
        <select
          value={t.toHospitalId}
          onChange={(e) => onOverride(e.target.value)}
          className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200"
        >
          {hospitals
            .filter((h) => h.id !== t.fromHospitalId)
            .map((h) => (
              <option key={h.id} value={h.id}>
                Override → {h.name} ({freeIcuBeds(h)} free)
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}
