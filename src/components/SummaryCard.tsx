// SummaryCard — before/after region summary.
// Appears once a dispatch resolves: shows how the region's load changed.
"use client";

import type { Hospital } from "@/lib/types";
import { icuLoadPercent, isOverCapacity } from "@/lib/types";

function criticalCount(hospitals: Hospital[]): number {
  return hospitals.filter(isOverCapacity).length;
}

function maxLoad(hospitals: Hospital[]): number {
  return hospitals.reduce((max, h) => Math.max(max, icuLoadPercent(h)), 0);
}

function avgLoad(hospitals: Hospital[]): number {
  if (hospitals.length === 0) return 0;
  const total = hospitals.reduce((sum, h) => sum + icuLoadPercent(h), 0);
  return Math.round(total / hospitals.length);
}

function Stat({
  label,
  before,
  after,
  suffix = "",
}: {
  label: string;
  before: number;
  after: number;
  suffix?: string;
}) {
  const changed = after !== before;
  const improved = after < before; // lower load / fewer critical is better
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm text-slate-500 line-through">
          {before}
          {suffix}
        </span>
        <span className="text-slate-500">→</span>
        <span
          className={`text-lg font-semibold ${
            !changed
              ? "text-slate-200"
              : improved
                ? "text-green-400"
                : "text-red-400"
          }`}
        >
          {after}
          {suffix}
        </span>
      </div>
    </div>
  );
}

export default function SummaryCard({
  before,
  after,
  transferCount,
}: {
  before: Hospital[];
  after: Hospital[];
  transferCount?: number;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">
          Before / after rebalance
        </h3>
        {typeof transferCount === "number" && (
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
            {transferCount} transfer{transferCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat
          label="Over capacity"
          before={criticalCount(before)}
          after={criticalCount(after)}
        />
        <Stat
          label="Peak load"
          before={maxLoad(before)}
          after={maxLoad(after)}
          suffix="%"
        />
        <Stat
          label="Avg load"
          before={avgLoad(before)}
          after={avgLoad(after)}
          suffix="%"
        />
      </div>
    </div>
  );
}
