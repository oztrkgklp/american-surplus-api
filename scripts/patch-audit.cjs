#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { isPidRunning } = require("./lib/async-job.cjs");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME_DIR = path.join(ROOT, ".runtime");
const JOBS_DIR = path.join(RUNTIME_DIR, "jobs");
const MANIFEST_DIR = path.join(RUNTIME_DIR, "manifests");

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function listJsonFiles(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dirPath, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function pushFinding(findings, severity, code, message) {
  findings.push({ severity, code, message });
}

async function main() {
  const findings = [];

  const [jobPaths, patchState, patchRun, esManifest, cdnManifest] = await Promise.all([
    listJsonFiles(JOBS_DIR),
    readJson(path.join(MANIFEST_DIR, "patch-sync-state.json")),
    readJson(path.join(MANIFEST_DIR, "patch-sync-run.json")),
    readJson(path.join(MANIFEST_DIR, "patch-sync-es.json")),
    readJson(path.join(MANIFEST_DIR, "patch-sync-cdn.json")),
  ]);

  for (const jobPath of jobPaths) {
    const state = await readJson(jobPath);
    if (!state) continue;
    if (state.status === "running" && state.pid && !isPidRunning(state.pid)) {
      pushFinding(
        findings,
        "error",
        "stale_running_job",
        `${path.basename(jobPath)} says running but pid=${state.pid} is not alive.`
      );
    }
    if (state.status === "failed") {
      pushFinding(
        findings,
        "warn",
        "failed_job",
        `${path.basename(jobPath)} failed (${state.error || "unknown error"}).`
      );
    }
  }

  if (!patchState) {
    pushFinding(findings, "warn", "missing_patch_state", "Missing patch-sync state manifest.");
  } else if (!patchState.lastSyncedPropertyIcn) {
    pushFinding(findings, "warn", "empty_checkpoint", "Patch state has no lastSyncedPropertyIcn checkpoint.");
  }

  if (!patchRun) {
    pushFinding(findings, "warn", "missing_patch_run", "Missing patch-sync run manifest.");
  }
  if (!esManifest) {
    pushFinding(findings, "error", "missing_es_manifest", "Missing patch-sync ES manifest.");
  }
  if (!cdnManifest) {
    pushFinding(findings, "error", "missing_cdn_manifest", "Missing patch-sync CDN manifest.");
  }

  if (esManifest && Array.isArray(esManifest.indices)) {
    const indexImported = esManifest.indices.reduce(
      (sum, item) => sum + Number(item.totalImported || 0),
      0
    );
    if (Number(esManifest.totalImported || 0) !== indexImported) {
      pushFinding(
        findings,
        "error",
        "es_total_mismatch",
        `ES manifest totalImported=${esManifest.totalImported} but indices sum=${indexImported}.`
      );
    }
  }

  if (cdnManifest) {
    const downloadedCount = Number(cdnManifest.downloadedCount || 0);
    const skippedCount = Number(cdnManifest.skippedCount || 0);
    const totalCandidates = Number(cdnManifest.totalCandidates || 0);
    const skippedRatio =
      totalCandidates > 0 ? skippedCount / totalCandidates : 0;
    if (downloadedCount + skippedCount !== totalCandidates) {
      pushFinding(
        findings,
        "error",
        "cdn_total_mismatch",
        `CDN manifest totals mismatch: downloaded+skipped=${downloadedCount + skippedCount}, candidates=${totalCandidates}.`
      );
    }
    if (skippedRatio > 0.5 && totalCandidates >= 100) {
      pushFinding(
        findings,
        "warn",
        "high_skip_ratio",
        `High CDN skip ratio detected (${(skippedRatio * 100).toFixed(1)}%).`
      );
    }
  }

  if (findings.length === 0) {
    console.log("[patch-audit] No issues found.");
    process.exit(0);
    return;
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warns = findings.filter((f) => f.severity === "warn");
  console.log(`[patch-audit] Findings: errors=${errors.length}, warnings=${warns.length}`);
  for (const finding of findings) {
    console.log(`[patch-audit] ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`[patch-audit] Failed: ${error.message}`);
  process.exit(1);
});
