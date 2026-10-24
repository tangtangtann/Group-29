// RegionMap — full-screen, draggable MapLibre map of every Bay Area hospital.
// Light CARTO "Positron" basemap (free, no API key; attribution required).
// - Markers are color-coded by load, pulse when over capacity, and get a
//   dashed purple ring for safety-net (under-resourced) hospitals.
// - Clicking a marker selects its region; hospitals outside the selected
//   region are dimmed and the camera flies to the region.
// - Approved transfers draw as animated arcs.
// Must be loaded client-side only (see next/dynamic in page.tsx).
"use client";

import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  LngLatBounds,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import type { Hospital, TransferRecommendation } from "@/lib/types";
import { freeIcuBeds, icuLoadPercent, loadStatus } from "@/lib/types";
import { BAY_AREA_BOUNDS } from "@/lib/seed";

// MapLibre v6 renders tiles in a web worker that bundlers can't locate.
// scripts/copy-maplibre-worker.mjs copies it into public/ before dev/build.
// Must run before the first Map is created.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const SOURCE_ID = "transfers";

const COLORS = {
  healthy: "#22c55e",
  strained: "#eab308",
  critical: "#ef4444",
  equity: "#a855f7",
  transfer: "#0284c7",
};

// Marching-ants animation steps for the transfer lines (MapLibre pattern).
const DASH_SEQUENCE: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1],
  [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3],
  [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Curved arc between two [lng, lat] points (quadratic Bezier). */
function arc(a: [number, number], b: [number, number], n = 48): [number, number][] {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const cx = (x1 + x2) / 2 - (y2 - y1) * 0.25;
  const cy = (y1 + y2) / 2 + (x2 - x1) * 0.25;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * x1 + 2 * u * t * cx + t * t * x2,
      u * u * y1 + 2 * u * t * cy + t * t * y2,
    ]);
  }
  return pts;
}

function buildMarker(
  h: Hospital,
  selectedRegionId: string | null,
  onSelect: (regionId: string) => void
): HTMLElement {
  const status = loadStatus(h);
  const pct = icuLoadPercent(h);
  const detail = `ICU ${h.icuOccupied}/${h.icuTotal} · ${freeIcuBeds(h)} free · ${pct}%`;

  const el = document.createElement("button");
  el.type = "button";
  el.className = ["tf-marker", `tf-${status}`, h.underResourced ? "tf-equity" : ""]
    .filter(Boolean)
    .join(" ");
  el.title = `${h.name}${h.underResourced ? " (safety-net)" : ""}: ${detail}`;
  el.setAttribute("aria-label", el.title);

  if (status === "critical") {
    const pulse = document.createElement("span");
    pulse.className = "tf-pulse";
    el.appendChild(pulse);
  }

  const dot = document.createElement("span");
  dot.className = "tf-dot";
  dot.textContent = String(pct);
  el.appendChild(dot);

  // Labels only for the selected region, to keep the overview uncluttered.
  if (selectedRegionId === h.regionId) {
    const label = document.createElement("span");
    label.className = "tf-label";
    const name = document.createElement("span");
    name.textContent = h.name + (h.underResourced ? " ⚑" : "");
    const small = document.createElement("small");
    small.textContent = detail;
    label.append(name, small);
    el.appendChild(label);
  }

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect(h.regionId);
  });
  return el;
}

export default function RegionMap({
  hospitals,
  selectedRegionId,
  transfers = [],
  onSelectRegion,
  padding,
}: {
  hospitals: Hospital[];
  selectedRegionId: string | null;
  transfers?: TransferRecommendation[];
  onSelectRegion: (regionId: string) => void;
  /** Screen space covered by floating panels, so the camera avoids it. */
  padding: MapPadding;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const markersRef = useRef<Marker[]>([]);
  const dataRef = useRef<FeatureCollection>(EMPTY);
  const onSelectRef = useRef(onSelectRegion);
  onSelectRef.current = onSelectRegion;
  const paddingRef = useRef(padding);
  paddingRef.current = padding;

  // --- Create the map once ----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      bounds: BAY_AREA_BOUNDS,
      fitBoundsOptions: { padding: paddingRef.current },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    let frame = 0;
    let lastStep = -1;

    map.on("load", () => {
      map.addSource(SOURCE_ID, { type: "geojson", data: dataRef.current });
      map.addLayer({
        id: "transfer-casing",
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "transfer-line",
        type: "line",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": COLORS.transfer,
          "line-width": 3.5,
          "line-dasharray": DASH_SEQUENCE[0],
        },
      });
      map.addLayer({
        id: "transfer-end",
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": COLORS.transfer,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      loadedRef.current = true;

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (!reduceMotion) {
        const animate = (t: number) => {
          const step = Math.floor(t / 60) % DASH_SEQUENCE.length;
          if (step !== lastStep) {
            map.setPaintProperty("transfer-line", "line-dasharray", DASH_SEQUENCE[step]);
            lastStep = step;
          }
          frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- Hospital markers -------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = hospitals.map((h) => {
      const dim = selectedRegionId !== null && selectedRegionId !== h.regionId;
      const el = buildMarker(h, selectedRegionId, (id) => onSelectRef.current(id));
      return new Marker({ element: el, anchor: "center", opacity: dim ? "0.35" : "1" })
        .setLngLat([h.lng, h.lat])
        .addTo(map);
    });
  }, [hospitals, selectedRegionId]);

  // --- Transfer arcs ----------------------------------------------------------
  useEffect(() => {
    const byId: Record<string, Hospital> = {};
    for (const h of hospitals) byId[h.id] = h;

    const features: Feature[] = [];
    for (const t of transfers) {
      const from = byId[t.fromHospitalId];
      const to = byId[t.toHospitalId];
      if (!from || !to) continue;
      features.push({
        type: "Feature",
        properties: { patient: t.patientCode },
        geometry: { type: "LineString", coordinates: arc([from.lng, from.lat], [to.lng, to.lat]) },
      });
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [to.lng, to.lat] },
      });
    }
    const data: FeatureCollection = { type: "FeatureCollection", features };
    dataRef.current = data;

    const source = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (loadedRef.current && source) source.setData(data);
  }, [transfers, hospitals]);

  // --- Camera: fly to the selected region, or the whole Bay Area -----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const inRegion = selectedRegionId
      ? hospitals.filter((h) => h.regionId === selectedRegionId)
      : [];
    if (inRegion.length > 0) {
      const bounds = new LngLatBounds();
      for (const h of inRegion) bounds.extend([h.lng, h.lat]);
      map.fitBounds(bounds, { padding: paddingRef.current, maxZoom: 12, duration: 900 });
    } else {
      map.fitBounds(BAY_AREA_BOUNDS, { padding: paddingRef.current, duration: 900 });
    }
    // Only re-frame when the selection changes or hospitals first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegionId, hospitals.length > 0]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />

      {/* legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-3 rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
        <Legend color={COLORS.healthy} label="Healthy <85%" />
        <Legend color={COLORS.strained} label="Strained 85–100%" />
        <Legend color={COLORS.critical} label="Over capacity >100%" />
        <Legend color={COLORS.equity} label="Safety-net" ring />
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
            ? { border: `2px dashed ${color}`, background: "transparent" }
            : { background: color }
        }
      />
      {label}
    </span>
  );
}
