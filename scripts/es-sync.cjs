#!/usr/bin/env node

const fs = require("node:fs/promises");
const { Client } = require("@elastic/elasticsearch");
const path = require("node:path");
const dotenv = require("dotenv");

const APP_INDICES = ["ppms-service-details", "ppms-details"];
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

function getArgValue(name, fallback) {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!found) return fallback;
  return found.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function isIndexNotFound(error) {
  return error?.meta?.body?.error?.type === "index_not_found_exception";
}

function isRejectedExecutionError(error) {
  return (
    error?.meta?.body?.error?.type === "es_rejected_execution_exception" ||
    String(error?.message || "").includes("es_rejected_execution_exception")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray(items, chunkSize) {
  if (chunkSize <= 0) return [items];
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
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

function maxIcn(a, b) {
  if (!a) return b || "";
  if (!b) return a || "";
  return compareIcn(a, b) >= 0 ? a : b;
}

async function writeJsonAtomic(filePath, payload) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

function isRetryableBulkResult(bulkResult) {
  if (!bulkResult?.errors) {
    return false;
  }
  const items = bulkResult.items || [];
  if (items.length === 0) return false;
  return items.every((item) => {
    const action = item.index || item.create || item.update || item.delete;
    const status = action?.status;
    const type = action?.error?.type;
    return status === 429 || type === "es_rejected_execution_exception";
  });
}

function buildBulkFailureDetails(bulkResult, max = 5) {
  const items = bulkResult?.items || [];
  const failures = [];
  for (const item of items) {
    const action = item.index || item.create || item.update || item.delete;
    if (!action || !action.error) continue;
    failures.push({
      status: action.status,
      type: action.error.type,
      reason: action.error.reason,
      id: action._id,
    });
    if (failures.length >= max) break;
  }
  return failures;
}

class Semaphore {
  constructor(limit) {
    this.limit = Math.max(1, limit || 1);
    this.active = 0;
    this.waiters = [];
  }

  async use(task) {
    if (this.active >= this.limit) {
      await new Promise((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.waiters.shift();
      if (next) next();
    }
  }
}

async function bulkWithRetry(localClient, operations, context, options, writeSemaphore) {
  const { maxRetries, baseBackoffMs } = options;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      const bulkResult = await writeSemaphore.use(() =>
        localClient.bulk({ operations, refresh: false })
      );

      if (!bulkResult.errors) {
        return;
      }

      if (isRetryableBulkResult(bulkResult) && attempt <= maxRetries) {
        const waitMs = baseBackoffMs * 2 ** (attempt - 1);
        console.warn(
          `[es-sync] Retrying bulk due to 429/rejected execution (${context}), attempt ${attempt}/${maxRetries}, wait ${waitMs}ms`
        );
        await sleep(waitMs);
        continue;
      }

      const failures = buildBulkFailureDetails(bulkResult);
      throw new Error(
        `Bulk import errors for ${context}: ${JSON.stringify(failures)}`
      );
    } catch (error) {
      if (isRejectedExecutionError(error) && attempt <= maxRetries) {
        const waitMs = baseBackoffMs * 2 ** (attempt - 1);
        console.warn(
          `[es-sync] Retrying bulk after es_rejected_execution_exception (${context}), attempt ${attempt}/${maxRetries}, wait ${waitMs}ms`
        );
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }
}

async function ensureIndex(localClient, remoteClient, index, mode) {
  let settings = {};
  let mappings = {};
  let sourceExists = true;
  try {
    const remoteInfo = await remoteClient.indices.get({ index });
    settings = remoteInfo[index]?.settings?.index || {};
    mappings = remoteInfo[index]?.mappings || {};
  } catch (error) {
    if (!isIndexNotFound(error)) {
      throw error;
    }
    sourceExists = false;
    console.warn(`[es-sync] Source index not found on remote: ${index}.`);
  }

  const localExists = await localClient.indices.exists({ index });
  if (localExists && mode === "replace") {
    await localClient.indices.delete({ index });
  }

  const existsAfterDelete = await localClient.indices.exists({ index });
  if (!existsAfterDelete) {
    const safeSettings = {
      number_of_shards: settings.number_of_shards || "1",
      number_of_replicas: "0",
    };
    await localClient.indices.create({
      index,
      settings: safeSettings,
      mappings,
    });
  }

  return sourceExists;
}

async function syncIndexSlice(
  remoteClient,
  localClient,
  index,
  batchSize,
  sliceId,
  sliceCount,
  options,
  writeSemaphore,
  resumeAfterIcn
) {
  let response;
  try {
    response = await remoteClient.search({
      index,
      scroll: "2m",
      size: batchSize,
      query: { match_all: {} },
      sort: ["_doc"],
      ...(sliceCount > 1 ? { slice: { id: sliceId, max: sliceCount } } : {}),
    });
  } catch (error) {
    if (!isIndexNotFound(error)) {
      throw error;
    }
    console.warn(`[es-sync] Source index disappeared during slice search: ${index} [slice ${sliceId}/${sliceCount}]`);
    return {
      totalSeen: 0,
      totalImported: 0,
      totalSkippedBeforeCheckpoint: 0,
      totalSkippedMissingIcn: 0,
      highestIcn: "",
    };
  }

  let totalSeen = 0;
  let totalImported = 0;
  let totalSkippedBeforeCheckpoint = 0;
  let totalSkippedMissingIcn = 0;
  let highestIcn = "";
  while (true) {
    const hits = response.hits?.hits || [];
    if (hits.length === 0) break;
    totalSeen += hits.length;

    const effectiveHits = [];
    for (const hit of hits) {
      if (!resumeAfterIcn) {
        effectiveHits.push(hit);
        continue;
      }
      const icn = normalizeIcn(hit?._source?.icn);
      if (!icn) {
        totalSkippedMissingIcn += 1;
        continue;
      }
      if (compareIcn(icn, resumeAfterIcn) <= 0) {
        totalSkippedBeforeCheckpoint += 1;
        continue;
      }
      highestIcn = maxIcn(highestIcn, icn);
      effectiveHits.push(hit);
    }

    if (effectiveHits.length === 0) {
      if (!response._scroll_id) break;
      response = await remoteClient.scroll({
        scroll_id: response._scroll_id,
        scroll: "2m",
      });
      continue;
    }

    for (const chunk of chunkArray(effectiveHits, options.bulkSize)) {
      const operations = [];
      for (const hit of chunk) {
        operations.push({ index: { _index: index, _id: hit._id } });
        operations.push(hit._source || {});
      }
      const context = `${index} slice ${sliceId + 1}/${sliceCount}, docs=${chunk.length}`;
      await bulkWithRetry(localClient, operations, context, options, writeSemaphore);
    }
    totalImported += effectiveHits.length;

    if (!response._scroll_id) break;
    response = await remoteClient.scroll({
      scroll_id: response._scroll_id,
      scroll: "2m",
    });
  }

  if (response._scroll_id) {
    await remoteClient.clearScroll({ scroll_id: response._scroll_id }).catch(() => {});
  }

  return {
    totalSeen,
    totalImported,
    totalSkippedBeforeCheckpoint,
    totalSkippedMissingIcn,
    highestIcn,
  };
}

async function syncIndex(
  remoteClient,
  localClient,
  index,
  mode,
  batchSize,
  slices,
  options,
  writeSemaphore,
  resumeAfterIcn
) {
  const sourceExists = await ensureIndex(localClient, remoteClient, index, mode);
  if (mode === "replace") {
    await localClient.deleteByQuery({
      index,
      conflicts: "proceed",
      refresh: true,
      query: { match_all: {} },
    }).catch(() => {});
  }

  if (!sourceExists) {
    await localClient.indices.refresh({ index }).catch(() => {});
    console.log(`[es-sync] Skipped import for missing source index: ${index}`);
    return {
      index,
      sourceExists: false,
      totalSeen: 0,
      totalImported: 0,
      totalSkippedBeforeCheckpoint: 0,
      totalSkippedMissingIcn: 0,
      highestIcn: "",
    };
  }

  const effectiveSlices = Math.max(1, slices || 1);
  const totals = await Promise.all(
    Array.from({ length: effectiveSlices }, (_, sliceIndex) =>
      syncIndexSlice(
        remoteClient,
        localClient,
        index,
        batchSize,
        sliceIndex,
        effectiveSlices,
        options,
        writeSemaphore,
        resumeAfterIcn
      )
    )
  );
  const aggregate = totals.reduce(
    (acc, value) => ({
      totalSeen: acc.totalSeen + value.totalSeen,
      totalImported: acc.totalImported + value.totalImported,
      totalSkippedBeforeCheckpoint:
        acc.totalSkippedBeforeCheckpoint + value.totalSkippedBeforeCheckpoint,
      totalSkippedMissingIcn:
        acc.totalSkippedMissingIcn + value.totalSkippedMissingIcn,
      highestIcn: maxIcn(acc.highestIcn, value.highestIcn),
    }),
    {
      totalSeen: 0,
      totalImported: 0,
      totalSkippedBeforeCheckpoint: 0,
      totalSkippedMissingIcn: 0,
      highestIcn: "",
    }
  );

  await localClient.indices.refresh({ index });
  console.log(`[es-sync] Synced ${aggregate.totalImported} docs into ${index}`);
  if (resumeAfterIcn) {
    console.log(
      `[es-sync] Resume checkpoint=${resumeAfterIcn}, skipped-before-checkpoint=${aggregate.totalSkippedBeforeCheckpoint}, skipped-missing-icn=${aggregate.totalSkippedMissingIcn}`
    );
  }
  return {
    index,
    sourceExists: true,
    ...aggregate,
  };
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const remoteNode = process.env.ELASTICSEARCH_NODE;
  const remoteApiKey = process.env.ELASTICSEARCH_API_KEY;
  const localNode = getArgValue("local-node", process.env.LOCAL_ELASTICSEARCH_NODE || "http://localhost:9200");
  const mode = getArgValue("mode", "replace");
  const batchSize = Number(getArgValue("batch-size", "10000"));
  const slices = Math.max(1, Number(getArgValue("slices", "8")) || 8);
  const bulkSize = Math.max(1, Number(getArgValue("bulk-size", "1000")) || 1000);
  const writeConcurrency = Math.max(
    1,
    Number(getArgValue("write-concurrency", "2")) || 2
  );
  const maxBulkRetries = Math.max(
    0,
    Number(getArgValue("max-bulk-retries", "6")) || 6
  );
  const backoffMs = Math.max(
    100,
    Number(getArgValue("bulk-retry-backoff-ms", "500")) || 500
  );

  const indicesArg = getArgValue("indices", "");
  const startAfterIcn = normalizeIcn(getArgValue("start-after-icn", ""));
  const checkpointManifest = getArgValue(
    "checkpoint-manifest",
    path.join(ROOT, ".runtime", "manifests", "es-sync-manifest.json")
  );
  const indices = indicesArg
    ? indicesArg.split(",").map((v) => v.trim()).filter(Boolean)
    : APP_INDICES;
  const effectiveSlices = startAfterIcn ? 1 : slices;

  console.log(`[es-sync] Remote: ${remoteNode}`);
  console.log(`[es-sync] Local: ${localNode}`);
  console.log(`[es-sync] Mode: ${mode}`);
  console.log(`[es-sync] Batch size: ${batchSize}`);
  console.log(`[es-sync] Slices per index: ${slices}`);
  if (startAfterIcn && slices !== 1) {
    console.log("[es-sync] start-after-icn enabled; forcing slices per index to 1 for deterministic checkpointing.");
  }
  console.log(`[es-sync] Bulk size: ${bulkSize}`);
  console.log(`[es-sync] Write concurrency: ${writeConcurrency}`);
  console.log(`[es-sync] Max bulk retries: ${maxBulkRetries}`);
  console.log(`[es-sync] Bulk retry backoff ms: ${backoffMs}`);
  console.log(`[es-sync] Indices: ${indices.join(", ")}`);
  console.log(`[es-sync] Start after ICN: ${startAfterIcn || "none"}`);
  console.log(`[es-sync] Checkpoint manifest: ${checkpointManifest}`);

  if (dryRun) {
    console.log("[es-sync] Dry run complete.");
    return;
  }

  if (!remoteNode || !remoteApiKey) {
    throw new Error("ELASTICSEARCH_NODE and ELASTICSEARCH_API_KEY are required in environment");
  }

  const remoteClient = new Client({
    node: remoteNode,
    auth: { apiKey: remoteApiKey },
  });
  const localClient = new Client({
    node: localNode,
  });
  const writeSemaphore = new Semaphore(writeConcurrency);
  const options = {
    bulkSize,
    maxRetries: maxBulkRetries,
    baseBackoffMs: backoffMs,
  };

  const indexSummaries = await Promise.all(
    indices.map(async (index) => {
      return syncIndex(
        remoteClient,
        localClient,
        index,
        mode,
        batchSize,
        effectiveSlices,
        options,
        writeSemaphore,
        startAfterIcn
      );
    })
  );

  const runSummary = indexSummaries.reduce(
    (acc, item) => ({
      totalSeen: acc.totalSeen + item.totalSeen,
      totalImported: acc.totalImported + item.totalImported,
      totalSkippedBeforeCheckpoint:
        acc.totalSkippedBeforeCheckpoint + item.totalSkippedBeforeCheckpoint,
      totalSkippedMissingIcn:
        acc.totalSkippedMissingIcn + item.totalSkippedMissingIcn,
      lastSyncedPropertyIcn: maxIcn(acc.lastSyncedPropertyIcn, item.highestIcn),
    }),
    {
      totalSeen: 0,
      totalImported: 0,
      totalSkippedBeforeCheckpoint: 0,
      totalSkippedMissingIcn: 0,
      lastSyncedPropertyIcn: "",
    }
  );

  await writeJsonAtomic(checkpointManifest, {
    generatedAt: new Date().toISOString(),
    mode,
    startAfterIcn: startAfterIcn || null,
    totalIndices: indices.length,
    ...runSummary,
    indices: indexSummaries.map((summary) => ({
      index: summary.index,
      sourceExists: summary.sourceExists,
      totalSeen: summary.totalSeen,
      totalImported: summary.totalImported,
      totalSkippedBeforeCheckpoint: summary.totalSkippedBeforeCheckpoint,
      totalSkippedMissingIcn: summary.totalSkippedMissingIcn,
      highestIcn: summary.highestIcn || null,
    })),
  });

  await remoteClient.close();
  await localClient.close();
  console.log("[es-sync] Completed.");
}

main().catch((error) => {
  console.error(`[es-sync] Failed: ${error.message}`);
  process.exit(1);
});
