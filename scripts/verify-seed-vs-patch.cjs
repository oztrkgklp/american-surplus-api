#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("@elastic/elasticsearch");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_DIR = path.join(ROOT, ".runtime", "manifests");
const APP_INDICES = ["ppms-service-details", "ppms-details"];

function getArgValue(name, fallback) {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!found) return fallback;
  return found.slice(name.length + 3);
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

function fail(failures, message) {
  failures.push(message);
}

async function getIndexCount(client, index) {
  try {
    const response = await client.count({ index, query: { match_all: {} } });
    return Number(response.count || 0);
  } catch (error) {
    if (error?.meta?.body?.error?.type === "index_not_found_exception") return 0;
    throw error;
  }
}

async function main() {
  const failures = [];
  const localNode = getArgValue(
    "local-node",
    process.env.LOCAL_ELASTICSEARCH_NODE || "http://localhost:9200"
  );

  const [seedManifest, patchState, patchRun, esManifest, cdnManifest] = await Promise.all([
    readJson(path.join(MANIFEST_DIR, "local-seed-applied.json")),
    readJson(path.join(MANIFEST_DIR, "patch-sync-state.json")),
    readJson(path.join(MANIFEST_DIR, "patch-sync-run.json")),
    readJson(path.join(MANIFEST_DIR, "patch-sync-es.json")),
    readJson(path.join(MANIFEST_DIR, "patch-sync-cdn.json")),
  ]);

  if (!seedManifest) fail(failures, "Missing local seed manifest.");
  if (!patchState) fail(failures, "Missing patch state manifest.");
  if (!patchRun) fail(failures, "Missing patch run manifest.");
  if (!esManifest) fail(failures, "Missing patch ES manifest.");
  if (!cdnManifest) fail(failures, "Missing patch CDN manifest.");

  if (seedManifest && Number(seedManifest.count || 0) < 0) {
    fail(failures, "Seed manifest count is invalid.");
  }

  if (esManifest && Array.isArray(esManifest.indices)) {
    const indexTotal = esManifest.indices.reduce(
      (sum, item) => sum + Number(item.totalImported || 0),
      0
    );
    if (Number(esManifest.totalImported || 0) !== indexTotal) {
      fail(
        failures,
        `ES totalImported mismatch: expected ${indexTotal}, got ${esManifest.totalImported}.`
      );
    }
  }

  if (cdnManifest) {
    const downloadedLength = Array.isArray(cdnManifest.downloaded)
      ? cdnManifest.downloaded.length
      : -1;
    if (downloadedLength !== Number(cdnManifest.downloadedCount || 0)) {
      fail(
        failures,
        `CDN downloaded count mismatch: expected ${downloadedLength}, got ${cdnManifest.downloadedCount}.`
      );
    }
  }

  if (
    patchState &&
    patchRun &&
    patchRun.nextCheckpoint &&
    patchState.lastSyncedPropertyIcn &&
    String(patchRun.nextCheckpoint) !== String(patchState.lastSyncedPropertyIcn)
  ) {
    fail(
      failures,
      `Patch checkpoint mismatch between run/state manifests (${patchRun.nextCheckpoint} vs ${patchState.lastSyncedPropertyIcn}).`
    );
  }

  const client = new Client({ node: localNode });
  const indexCounts = {};
  try {
    for (const index of APP_INDICES) {
      indexCounts[index] = await getIndexCount(client, index);
    }
  } finally {
    await client.close().catch(() => {});
  }

  const totalLocalDocs = Object.values(indexCounts).reduce((sum, value) => sum + value, 0);
  if (totalLocalDocs <= 0) {
    fail(failures, "Local Elasticsearch appears empty after seed/patch.");
  }

  if (failures.length > 0) {
    console.log("[verify-seed-vs-patch] FAILED");
    for (const message of failures) {
      console.log(`[verify-seed-vs-patch] ${message}`);
    }
    process.exit(1);
    return;
  }

  console.log("[verify-seed-vs-patch] PASSED");
  console.log(`[verify-seed-vs-patch] Seed count: ${seedManifest?.count || 0}`);
  console.log(`[verify-seed-vs-patch] Patch checkpoint: ${patchState?.lastSyncedPropertyIcn || "none"}`);
  console.log(`[verify-seed-vs-patch] ES total imported (last patch): ${esManifest?.totalImported || 0}`);
  console.log(`[verify-seed-vs-patch] CDN downloaded (last patch): ${cdnManifest?.downloadedCount || 0}`);
  for (const [index, count] of Object.entries(indexCounts)) {
    console.log(`[verify-seed-vs-patch] ${index}: ${count}`);
  }
}

main().catch((error) => {
  console.error(`[verify-seed-vs-patch] Failed: ${error.message}`);
  process.exit(1);
});
