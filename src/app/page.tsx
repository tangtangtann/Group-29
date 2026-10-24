// TriageFlow dashboard — wires map + AI panel + controls. (owner: Nicole & Vatey)
"use client";

import { useEffect, useMemo, useState } from "react";
import RegionMap from "@/components/RegionMap";
import PlanPanel from "@/components/PlanPanel";
import SummaryCard from "@/components/SummaryCard";
import type {
  Hospital,
  Patient,
  RecommendResponse,
  StateResponse,
  DispatchResponse,
} from "@/lib/types";
import { icuLoadPercent } from "@/lib/types";

export default function Home() {
  const [incident, setIncident] = useState<string | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [plan, setPlan] = useState<RecommendResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<DispatchResponse | null>(null);
  // Hospital state captured just before a dispatch, for the before/after card.
  const [beforeDispatch, setBeforeDispatch] = useState<Hospital[] | null>(null);
  const [dispatchedCount, setDispatchedCount] = useState(0);

  async function loadState(surge: boolean) {
    const res = await fetch(`/api/state?surge=${surge ? 1 : 0}`);
    const data: StateResponse = await res.json();
    setIncident(data.incident);
    setHospitals(data.hospitals);
    setPatients(data.patients);
    setPlan(null);
    setOverrides({});
    setApproved(new Set());
    setResolved(null);
    setBeforeDispatch(null);
    setDispatchedCount(0);
  }

  useEffect(() => {
    loadState(false);
  }, []);

  async function rebalance(nextOverrides = overrides) {
    setLoading(true);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitals, patients, overrides: nextOverrides }),
      });
      const data: RecommendResponse = await res.json();
      setPlan(data);
    } finally {
      setLoading(false);
    }
  }

  function approve(patientId: string) {
    setApproved((prev) => new Set(prev).add(patientId));
  }

  function override(patientId: string, toHospitalId: string) {
    const next = { ...overrides, [patientId]: toHospitalId };
    setOverrides(next);
    rebalance(next); // AI recalculates around the locked-in choice
  }

  async function dispatch() {
    if (!plan) return;
    const toApply = plan.transfers.filter((t) => approved.has(t.patientId));
    setBeforeDispatch(hospitals); // snapshot for the before/after card
    setDispatchedCount(toApply.length);
    const res = await fetch("/api/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hospitals, patients, transfers: toApply }),
    });
    const data: DispatchResponse = await res.json();
    setHospitals(data.hospitals);
    setPatients(data.patients);
    setResolved(data);
    setPlan(null);
  }

  const criticalCount = useMemo(
    () => hospitals.filter((h) => icuLoadPercent(h) >= 100).length,
    [hospitals]
  );

  const arrows = plan ? plan.transfers.filter((t) => approved.has(t.patientId)) : [];

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            TriageFlow <span className="text-sky-400">·</span>{" "}
            <span className="text-sm font-normal text-slate-400">
              AI Medical Operations Coordination Center
            </span>
          </h1>
          <p className="text-xs text-slate-500">Regional patient load-balancing · powered by Amazon Bedrock</p>
        </div>
        <div className="flex gap-2">
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
      </header>

      {incident && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          🚨 {incident}
        </div>
      )}

      {resolved && (
        <div className="mb-4 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200">
          ✓ Region rebalanced. Max facility load: {resolved.maxLoadPercent}% · Unplaced
          patients: {resolved.unplacedCount}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RegionMap hospitals={hospitals} transfers={arrows} />
        </div>

        <div className="space-y-3 lg:col-span-2">
          {resolved && beforeDispatch && (
            <SummaryCard
              before={beforeDispatch}
              after={hospitals}
              transferCount={dispatchedCount}
            />
          )}

          <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-4">
            <div className="text-xs text-slate-300">
              {criticalCount > 0 ? (
                <span className="text-red-300">{criticalCount} facility/ies over capacity</span>
              ) : (
                <span className="text-green-300">Region balanced</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => rebalance()}
                disabled={criticalCount === 0 || loading}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 hover:bg-sky-500"
              >
                Rebalance with AI
              </button>
              <button
                onClick={dispatch}
                disabled={!plan || approved.size === 0}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 hover:bg-green-500"
              >
                Dispatch ({approved.size})
              </button>
            </div>
          </div>

          <PlanPanel
            plan={plan}
            hospitals={hospitals}
            approved={approved}
            onApprove={approve}
            onOverride={override}
            loading={loading}
          />
        </div>
      </div>
    </main>
  );
}
