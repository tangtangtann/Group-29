// RegionMap — SVG map of hospitals, color-coded by load. (owner: Nicole)
// Shows animated transfer arrows when a plan is provided.
"use client";

import type { Hospital, TransferRecommendation } from "@/lib/types";
import { icuLoadPercent, loadStatus } from "@/lib/types";

const COLORS: Record<string, string> = {
  healthy: "#22c55e",
  strained: "#eab308",
  critical: "#ef4444",
};

export default function RegionMap({
  hospitals,
  transfers = [],
}: {
  hospitals: Hospital[];
  transfers?: TransferRecommendation[];
}) {
  const byId: Record<string, Hospital> = {};
  for (const h of hospitals) byId[h.id] = h;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
      <svg viewBox="0 0 100 100" className="h-[520px] w-full">
        {/* subtle grid */}
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#1e293b" strokeWidth="0.3" />
          </pattern>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#38bdf8" />
          </marker>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />

        {/* transfer arrows */}
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
          return (
            <g key={h.id}>
              {status === "critical" && (
                <circle cx={h.lng} cy={h.lat} r="4.5" fill={COLORS.critical} opacity="0.25">
                  <animate attributeName="r" from="3.5" to="6" dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.35" to="0" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={h.lng} cy={h.lat} r="2.4" fill={COLORS[status]} stroke="#0b1220" strokeWidth="0.4" />
              <text x={h.lng + 3.2} y={h.lat - 1.2} fontSize="2.6" fill="#e2e8f0">
                {h.name}
              </text>
              <text x={h.lng + 3.2} y={h.lat + 2} fontSize="2.2" fill="#94a3b8">
                ICU {h.icuOccupied}/{h.icuTotal} · {pct}%
                {h.underResourced ? " · safety-net" : ""}
              </text>
            </g>
          );
        })}
      </svg>

      {/* legend */}
      <div className="absolute bottom-3 left-3 flex gap-3 rounded-lg bg-slate-800/80 px-3 py-2 text-xs">
        <Legend color={COLORS.healthy} label="Healthy" />
        <Legend color={COLORS.strained} label="Strained" />
        <Legend color={COLORS.critical} label="Critical" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
