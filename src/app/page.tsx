// LifeLine dashboard — full-screen map with floating panels.
// The coordinator picks a region; Rebalance / Dispatch only touch that
// region's hospitals and patients.
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import PlanPanel from "@/components/PlanPanel";
import SummaryCard from "@/components/SummaryCard";
import type { MapPadding } from "@/components/RegionMap";
import type {
  Hospital,
  Patient,
  Region,
  RecommendResponse,
  StateResponse,
  DispatchResponse,
} from "@/lib/types";
import { isOverCapacity } from "@/lib/types";

// MapLibre needs the browser (WebGL, window), so skip server rendering.
const RegionMap = dynamic(() => import("@/components/RegionMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-slate-200" />,
});

// Screen space covered by the floating panels, so the map frames around them.
const MAP_PADDING: MapPadding = { top: 80, right: 470, bottom: 70, left: 390 };

const panel =
  "pointer-events-auto rounded-2xl border border-slate-700 bg-slate-900/90 shadow-2xl backdrop-blur";

export default function Home() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [plan, setPlan] = useState<RecommendResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<DispatchResponse | null>(null);
  // Region's hospital state captured just before a dispatch, for the before/after card.
  const [beforeDispatch, setBeforeDispatch] = useState<Hospital[] | null>(null);
  const [dispatchedCount, setDispatchedCount] = useState(0);

  function clearPlan() {
    setPlan(null);
    setOverrides({});
    setApproved(new Set());
    setResolved(null);
    setBeforeDispatch(null);
    setDispatchedCount(0);
  }

  async function loadState(surge: boolean) {
    const res = await fetch(`/api/state?surge=${surge ? 1 : 0}`);
    const data: StateResponse = await res.json();
    setRegions(data.regions);
    setHospitals(data.hospitals);
    setPatients(data.patients);
    clearPlan();
  }

  useEffect(() => {
    loadState(false);
  }, []);

  function selectRegion(id: string | null) {
    if (id === selectedRegionId) return;
    setSelectedRegionId(id);
    clearPlan(); // a plan belongs to one region
  }

  // --- Selected region slice ---------------------------------------------------
  const selectedRegion = regions.find((r) => r.id === selectedRegionId) ?? null;

  const regionHospitals = useMemo(
    () => hospitals.filter((h) => h.regionId === selectedRegionId),
    [hospitals, selectedRegionId]
  );

  const regionPatients = useMemo(() => {
    const ids = new Set(regionHospitals.map((h) => h.id));
    return patients.filter((p) => ids.has(p.currentHospitalId));
  }, [patients, regionHospitals]);

  const overByRegion = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of hospitals) {
      if (isOverCapacity(h)) counts[h.regionId] = (counts[h.regionId] ?? 0) + 1;
    }
    return counts;
  }, [hospitals]);

  const criticalCount = selectedRegionId ? overByRegion[selectedRegionId] ?? 0 : 0;

  // --- Actions -----------------------------------------------------------------
  async function rebalance(nextOverrides = overrides) {
    if (!selectedRegionId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospitals: regionHospitals,
          patients: regionPatients,
          overrides: nextOverrides,
        }),
      });
      const data: RecommendResponse = await res.json();
      setPlan(data);
    } finally {
      setLoading(false);
    }
  }

  function toggleApprove(patientId: string) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) {
        next.delete(patientId); // un-approve — coordinator changed their mind
      } else {
        next.add(patientId);
      }
      return next;
    });
  }

  function approveAll() {
    if (!plan) return;
    const ids = plan.transfers.map((t) => t.patientId);
    const allApproved = ids.length > 0 && ids.every((id) => approved.has(id));
    setApproved(allApproved ? new Set() : new Set(ids));
  }

  function override(patientId: string, toHospitalId: string) {
    const next = { ...overrides, [patientId]: toHospitalId };
    setOverrides(next);
    rebalance(next); // AI recalculates around the locked-in choice
  }

  async function dispatch() {
    if (!plan) return;
    const toApply = plan.transfers.filter((t) => approved.has(t.patientId));
    setBeforeDispatch(regionHospitals); // snapshot for the before/after card
    setDispatchedCount(toApply.length);
    const res = await fetch("/api/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hospitals: regionHospitals,
        patients: regionPatients,
        transfers: toApply,
      }),
    });
    const data: DispatchResponse = await res.json();
    // Merge the region's updated records back into the full Bay Area state.
    const hUpdated = new Map<string, Hospital>(
      data.hospitals.map((h) => [h.id, h] as const)
    );
    const pUpdated = new Map<string, Patient>(
      data.patients.map((p) => [p.id, p] as const)
    );
    setHospitals((prev) => prev.map((h) => hUpdated.get(h.id) ?? h));
    setPatients((prev) => prev.map((p) => pUpdated.get(p.id) ?? p));
    setResolved(data);
    setPlan(null);
  }

  const arrows = plan ? plan.transfers.filter((t) => approved.has(t.patientId)) : [];

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <RegionMap
        hospitals={hospitals}
        selectedRegionId={selectedRegionId}
        transfers={arrows}
        onSelectRegion={selectRegion}
        padding={MAP_PADDING}
      />

      {/* --- Left: brand, scenario controls, region picker ------------------- */}
      <section className="pointer-events-none absolute left-4 top-4 z-10 flex max-h-[calc(100vh-5rem)] w-[350px] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto">
        <div className={`${panel} p-4`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold text-slate-100">
                LifeLine <span className="text-sky-400">·</span>{" "}
                <span className="text-xs font-normal text-slate-400">MOCC</span>
              </h1>
              <p className="text-xs text-slate-400">
                Regional patient load-balancing · powered by Amazon Bedrock
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              Simulated data
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => loadState(false)}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Reset (calm)
            </button>
            <button
              onClick={() => loadState(true)}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
            >
              Simulate surge
            </button>
          </div>
        </div>

        <div className={`${panel} p-3`}>
          <h2 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Coordination region
          </h2>
          <div className="flex flex-col gap-1.5">
            {regions.map((r) => {
              const over = overByRegion[r.id] ?? 0;
              const active = r.id === selectedRegionId;
              return (
                <button
                  key={r.id}
                  onClick={() => selectRegion(r.id)}
                  aria-pressed={active}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "border-sky-500 bg-sky-500/15 text-slate-100"
                      : "border-slate-700 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <span>{r.name}</span>
                  <span
                    className={`text-[11px] font-medium ${
                      over > 0
                        ? "text-red-300"
                        : r.incident
                          ? "text-amber-300"
                          : "text-green-300"
                    }`}
                  >
                    {over > 0 ? `${over} over capacity` : r.incident ? "Strained" : "Calm"}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => selectRegion(null)}
              aria-pressed={selectedRegionId === null}
              className={`rounded-lg px-3 py-1.5 text-left text-xs ${
                selectedRegionId === null
                  ? "text-sky-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ← Whole Bay Area
            </button>
          </div>
        </div>

        {selectedRegion?.incident && (
          <div
            className={`pointer-events-auto rounded-2xl border p-3 text-sm shadow-2xl backdrop-blur ${
              criticalCount > 0
                ? "border-red-500/50 bg-red-950/90 text-red-100"
                : "border-amber-500/50 bg-amber-950/90 text-amber-100"
            }`}
          >
            🚨 {selectedRegion.incident}
          </div>
        )}
      </section>

      {/* --- Right: rebalance controls + AI plan ------------------------------ */}
      <aside className="pointer-events-none absolute right-4 top-4 z-10 flex max-h-[calc(100vh-3.5rem)] w-[430px] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto">
        {resolved && (
          <div className="pointer-events-auto rounded-2xl border border-green-500/40 bg-green-950/90 px-4 py-3 text-sm text-green-200 shadow-2xl backdrop-blur">
            ✓ {selectedRegion?.name ?? "Region"} rebalanced. Max facility load:{" "}
            {resolved.maxLoadPercent}% · Unplaced patients: {resolved.unplacedCount}
          </div>
        )}

        {resolved && beforeDispatch && (
          <div className="pointer-events-auto">
            <SummaryCard
              before={beforeDispatch}
              after={regionHospitals}
              transferCount={dispatchedCount}
            />
          </div>
        )}

        <div className={`${panel} flex items-center justify-between gap-3 p-4`}>
          <div className="text-xs text-slate-300">
            {!selectedRegion ? (
              <span className="text-slate-400">Select a region to rebalance</span>
            ) : criticalCount > 0 ? (
              <span className="text-red-300">
                {selectedRegion.name}: {criticalCount} over capacity
              </span>
            ) : (
              <span className="text-green-300">{selectedRegion.name}: balanced</span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => rebalance()}
              disabled={!selectedRegion || criticalCount === 0 || loading}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              Rebalance with AI
            </button>
            <button
              onClick={dispatch}
              disabled={!plan || approved.size === 0}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-40"
            >
              Dispatch ({approved.size})
            </button>
          </div>
        </div>

        <div className="pointer-events-auto">
          <PlanPanel
            plan={plan}
            hospitals={regionHospitals}
            approved={approved}
            onApprove={toggleApprove}
            onApproveAll={approveAll}
            onOverride={override}
            loading={loading}
          />
        </div>
      </aside>
    </main>
  );
}
