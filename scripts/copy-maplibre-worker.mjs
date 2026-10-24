// Copies MapLibre's web worker (and the chunks it imports) into
// public/maplibre/ so Next.js serves them as static files.
//
// MapLibre v6 loads tiles in a separate worker module. Bundlers can't resolve
// its URL, so RegionMap.tsx calls setWorkerUrl("/maplibre/maplibre-gl-worker.mjs").
// Runs automatically before `npm run dev` and `npm run build` (predev/prebuild),
// so the copied files always match the installed maplibre-gl version.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "maplibre-gl", "dist");
const dest = join(root, "public", "maplibre");

if (!existsSync(join(src, "maplibre-gl-worker.mjs"))) {
  console.error("[maplibre] worker not found. Run `npm install` first.");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });

// Copy the worker and shared chunk, then any other sibling modules they import.
const queue = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"].filter((f) =>
  existsSync(join(src, f))
);
const done = new Set();
while (queue.length > 0) {
  const file = queue.pop();
  if (done.has(file)) continue;
  done.add(file);
  copyFileSync(join(src, file), join(dest, file));
  const code = readFileSync(join(src, file), "utf8");
  for (const m of code.matchAll(/["'`]\.\/([\w.-]+\.mjs)["'`]/g)) {
    if (!done.has(m[1]) && existsSync(join(src, m[1]))) queue.push(m[1]);
  }
}
console.log(`[maplibre] copied ${[...done].join(", ")} to public/maplibre/`);
