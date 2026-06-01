#!/usr/bin/env node

const { readJobState, isPidRunning } = require("./lib/async-job.cjs");

function getArgValue(name, fallback = "") {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return arg.slice(name.length + 3);
}

async function main() {
  const job = getArgValue("job");
  if (!job) {
    console.error("[job-status] Missing --job=<name>");
    process.exit(1);
    return;
  }

  const state = await readJobState(job);
  if (!state) {
    console.log(`[job-status] No status found for '${job}'.`);
    process.exit(0);
    return;
  }

  const running = state.status === "running";
  const alive = running ? isPidRunning(state.pid) : false;
  const effectiveStatus = running && !alive ? "stale" : state.status;
  const sanitizedState = { ...state };
  if (effectiveStatus !== "skipped") {
    sanitizedState.reason = null;
  }
  if (effectiveStatus !== "failed") {
    sanitizedState.error = null;
  }

  console.log(`[job-status] ${job}: ${effectiveStatus}`);
  console.log(JSON.stringify({ ...sanitizedState, effectiveStatus }, null, 2));
}

main().catch((error) => {
  console.error(`[job-status] Failed: ${error.message}`);
  process.exit(1);
});
