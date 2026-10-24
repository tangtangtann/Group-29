// RegionMap — SVG map of hospitals, color-coded by load.
// Shows animated transfer arrows when a plan is provided. Under-resourced
// (safety-net) hospitals get an equity ring so load inequity is visible.
"use client";

import type { Hospital, TransferRecommendation } from "@/lib/types";
import { icuLoadPercent, loadStatus, freeIcuBeds } from "@/lib/types";

const COLORS: Record<string, string> = {
  healthy: "#22c55e",
  strained: "#eab308",
  critical: "#ef4444",
};

const EQUITY_COLOR = "#a855f7"; // purple-500 — safety-net / under-resourced

export default function RegionMap({
  hospitals,
  transfers = [],
}: {
  hospitals: Hospital[];
  transfers?: TransferRecommendation[];
}) {
  const byId: Record<string, Hospital> = {};
  for (const h of hospitals) byId[h.id] = h;

  const criticalCount = hospitals.filter(
    (h) => loadStatus(h) === "critical",
  ).length;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      {/* header strip */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Regional view
          </h2>
          {criticalCount > 0 && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-300">
              {criticalCount} over capacity
            </span>
          )}
        </div>
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
          Simulated data
        </span>
      </div>

      <svg viewBox="0 0 100 100" className="h-[520px] w-full">
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M 10 0 L 0 0 0 10"
              fill="none"
              stroke="#1e293b"
              strokeWidth="0.3"
            />
          </pattern>
          <marker
            id="arrow"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="#38bdf8" />
          </marker>
          {/* soft shadow so nodes lift off the grid */}
          <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0.3" stdDeviation="0.4" floodOpacity="0.5" />
          </filter>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />

        {/* transfer arrows (under nodes) */}
        {transfers.map((t) => {
          const from = byId[t.fromHospitalId];
          const to = byId[t.toHospitalId];
          if (!from || !to) return null;
          return (
            <line
              key={`${t.patientId}-arrow`}
              x1={from.lng}
              y1={from.lat}
              x2={to.lng}
              y2={to.lat}
              stroke="#38bdf8"
              strokeWidth="0.6"
              strokeDasharray="2 1.5"
              markerEnd="url(#arrow)"
              opacity="0.9"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="7"
                to="0"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </line>
          );
        })}

        {/* hospitals */}
        {hospitals.map((h) => {
          const status = loadStatus(h);
          const pct = icuLoadPercent(h);
          const free = freeIcuBeds(h);
          const equity = h.underResourced;

          return (
            <g key={h.id}>
              {/* critical pulse */}
              {status === "critical" && (
                <circle cx={h.lng} cy={h.lat} r="4.5" fill={COLORS.critical} opacity="0.25">
                  <animate
                    attributeName="r"
                    from="3.5"
                    to="6.5"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.35"
                    to="0"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* equity ring for under-resourced hospitals */}
              {equity && (
                <circle
                  cx={h.lng}
                  cy={h.lat}
                  r="3.5"
                  fill="none"
                  stroke={EQUITY_COLOR}
                  strokeWidth="0.5"
                  strokeDasharray="1 0.8"
                  opacity="0.9"
                />
              )}

              {/* node */}
              <circle
                cx={h.lng}
                cy={h.lat}
                r="2.4"
                fill={COLORS[status]}
                stroke="#0b1220"
                strokeWidth="0.4"
                filter="url(#nodeShadow)"
              />

              {/* load % pill on the node */}
              <text
                x={h.lng}
                y={h.lat + 0.9}
                fontSize="1.9"
                fontWeight="700"
                fill="#0b1220"
                textAnchor="middle"
              >
                {pct}
              </text>

              {/* name + detail label */}
              <text x={h.lng + 3.4} y={h.lat - 1.2} fontSize="2.6" fill="#e2e8f0">
                {h.name}
                {equity ? " ⚑" : ""}
              </text>
              <text x={h.lng + 3.4} y={h.lat + 2} fontSize="2.2" fill="#94a3b8">
                ICU {h.icuOccupied}/{h.icuTotal} · {free} free · {pct}%
              </text>
            </g>
          );
        })}
      </svg>

      {/* legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-lg bg-slate-800/80 px-3 py-2 text-xs backdrop-blur">
        <Legend color={COLORS.healthy} label="Healthy <85%" />
        <Legend color={COLORS.strained} label="Strained 85–100%" />
        <Legend color={COLORS.critical} label="Over capacity >100%" />
        <Legend color={EQUITY_COLOR} label="Safety-net" ring />
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  ring = false,
}: {
  color: string;
  label: string;
  ring?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-slate-200">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={
          ring
            ? { border: `2px solid ${color}`, background: "transparent" }
            : { background: color }
        }
      />
      {label}
    </span>
  );
}
