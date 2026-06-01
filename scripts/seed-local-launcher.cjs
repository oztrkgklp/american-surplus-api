#!/usr/bin/env node

const path = require("node:path");
const {
  ROOT,
  readJobState,
  isPidRunning,
  writeJobState,
  spawnDetachedNode,
} = require("./lib/async-job.cjs");

async function main() {
  const existing = await readJobState("seed-local");
  if (existing?.status === "running" && isPidRunning(existing.pid)) {
    console.log(`[seed:local] Already running (pid=${existing.pid}).`);
    console.log("[seed:local] Check: npm run seed:local:status");
    process.exit(1);
    return;
  }

  await writeJobState("seed-local", {
    status: "queued",
    queuedAt: new Date().toISOString(),
    pid: null,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    reason: null,
    error: null,
    currentStep: null,
    logPath: path.join(ROOT, ".runtime", "logs", "seed-local.log"),
  });

  const { pid, logPath } = await spawnDetachedNode("seed-local", "scripts/seed-local-async.cjs");
  console.log(`[seed:local] Started async pipeline (pid=${pid}).`);
  console.log(`[seed:local] Log: ${logPath}`);
  console.log("[seed:local] Status: npm run seed:local:status");
}

main().catch((error) => {
  console.error(`[seed:local] Failed to start: ${error.message}`);
  process.exit(1);
});
