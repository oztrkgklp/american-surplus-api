#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { run } = require("./lib/process.cjs");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_DIR = path.join(ROOT, ".runtime", "manifests");

function getArgValue(name, fallback) {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!found) return fallback;
  return found.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeIcn(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function compareIcn(a, b) {
  return normalizeIcn(a).localeCompare(normalizeIcn(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function minIcn(a, b) {
  if (!a) return b || "";
  if (!b) return a || "";
  return compareIcn(a, b) <= 0 ? a : b;
}

function maxIcn(a, b) {
  if (!a) return b || "";
  if (!b) return a || "";
  return compareIcn(a, b) >= 0 ? a : b;
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const explicitFromIcn = normalizeIcn(getArgValue("from-icn", ""));
  const statePath = getArgValue(
    "state-manifest",
    path.join(MANIFEST_DIR, "patch-sync-state.json")
  );
  const runManifestPath = getArgValue(
    "run-manifest",
    path.join(MANIFEST_DIR, "patch-sync-run.json")
  );
  const esManifestPath = getArgValue(
    "es-manifest",
    path.join(MANIFEST_DIR, "patch-sync-es.json")
  );
  const cdnManifestPath = getArgValue(
    "cdn-manifest",
    path.join(MANIFEST_DIR, "patch-sync-cdn.json")
  );

  const previousState = await readJson(statePath);
  const stateCheckpoint = normalizeIcn(previousState?.lastSyncedPropertyIcn);
  const startAfterIcn = explicitFromIcn || stateCheckpoint;

  console.log(`[patch-sync] Dry run: ${dryRun}`);
  console.log(`[patch-sync] Start after ICN: ${startAfterIcn || "none"}`);
  console.log(`[patch-sync] State manifest: ${statePath}`);
  console.log(`[patch-sync] ES manifest: ${esManifestPath}`);
  console.log(`[patch-sync] CDN manifest: ${cdnManifestPath}`);
  console.log(`[patch-sync] Run manifest: ${runManifestPath}`);

  const esArgs = ["scripts/es-sync.cjs", "--mode=append", `--checkpoint-manifest=${esManifestPath}`];
  const cdnArgs = ["scripts/cdn-hydrate.cjs", `--checkpoint-manifest=${cdnManifestPath}`];
  if (startAfterIcn) {
    esArgs.push(`--start-after-icn=${startAfterIcn}`);
    cdnArgs.push(`--start-after-icn=${startAfterIcn}`);
  }
  if (dryRun) {
    esArgs.push("--dry-run");
    cdnArgs.push("--dry-run");
  }

  await run(process.execPath, esArgs, { cwd: ROOT });
  await run(process.execPath, cdnArgs, { cwd: ROOT });

  const [esManifest, cdnManifest] = await Promise.all([
    readJson(esManifestPath),
    readJson(cdnManifestPath),
  ]);

  const esLast = normalizeIcn(esManifest?.lastSyncedPropertyIcn);
  const cdnLast = normalizeIcn(cdnManifest?.lastSyncedPropertyIcn);
  let candidateCheckpoint = "";
  if (esLast && cdnLast) candidateCheckpoint = minIcn(esLast, cdnLast);
  else candidateCheckpoint = esLast || cdnLast || startAfterIcn;
  candidateCheckpoint = maxIcn(startAfterIcn, candidateCheckpoint);

  const runSummary = {
    generatedAt: new Date().toISOString(),
    dryRun,
    startAfterIcn: startAfterIcn || null,
    previousCheckpoint: stateCheckpoint || null,
    esLastSyncedIcn: esLast || null,
    cdnLastSyncedIcn: cdnLast || null,
    nextCheckpoint: candidateCheckpoint || null,
    esManifestPath,
    cdnManifestPath,
    esImportedDocs: Number(esManifest?.totalImported || 0),
    cdnDownloaded: Number(cdnManifest?.downloadedCount || 0),
    cdnSkipped: Number(cdnManifest?.skippedCount || 0),
  };
  await writeJsonAtomic(runManifestPath, runSummary);

  if (!dryRun) {
    await writeJsonAtomic(statePath, {
      generatedAt: new Date().toISOString(),
      lastSyncedPropertyIcn: candidateCheckpoint || null,
      lastRunManifest: runManifestPath,
      lastRunStartAfterIcn: startAfterIcn || null,
      esManifestPath,
      cdnManifestPath,
      esImportedDocs: runSummary.esImportedDocs,
      cdnDownloaded: runSummary.cdnDownloaded,
      cdnSkipped: runSummary.cdnSkipped,
    });
  }

  console.log(`[patch-sync] ES imported docs: ${runSummary.esImportedDocs}`);
  console.log(`[patch-sync] CDN downloaded files: ${runSummary.cdnDownloaded}`);
  console.log(`[patch-sync] Next checkpoint ICN: ${candidateCheckpoint || "unchanged"}`);
  console.log("[patch-sync] Completed.");
}

main().catch((error) => {
  console.error(`[patch-sync] Failed: ${error.message}`);
  process.exit(1);
});
