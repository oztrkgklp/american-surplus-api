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
  const existing = await readJobState("cdn-hydrate");
  if (existing?.status === "running" && isPidRunning(existing.pid)) {
    console.log(`[cdn:hydrate] Already running (pid=${existing.pid}).`);
    console.log("[cdn:hydrate] Check: npm run cdn:hydrate:status");
    process.exit(1);
    return;
  }

  await writeJobState("cdn-hydrate", {
    status: "queued",
    queuedAt: new Date().toISOString(),
    pid: null,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    reason: null,
    error: null,
    logPath: path.join(ROOT, ".runtime", "logs", "cdn-hydrate.log"),
  });

  const { pid, logPath } = await spawnDetachedNode("cdn-hydrate", "scripts/cdn-hydrate.cjs");
  console.log(`[cdn:hydrate] Started async hydration (pid=${pid}).`);
  console.log(`[cdn:hydrate] Log: ${logPath}`);
  console.log("[cdn:hydrate] Status: npm run cdn:hydrate:status");
}

main().catch((error) => {
  console.error(`[cdn:hydrate] Failed to start: ${error.message}`);
  process.exit(1);
});
