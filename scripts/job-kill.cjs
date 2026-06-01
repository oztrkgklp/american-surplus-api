#!/usr/bin/env node

const { readJobState, isPidRunning, writeJobState } = require("./lib/async-job.cjs");

function getArgValue(name, fallback = "") {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return arg.slice(name.length + 3);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(pid, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isPidRunning(pid)) return true;
    await sleep(250);
  }
  return !isPidRunning(pid);
}

async function main() {
  const job = getArgValue("job");
  if (!job) {
    console.error("[job-kill] Missing --job=<name>");
    process.exit(1);
    return;
  }

  const state = await readJobState(job);
  if (!state) {
    console.log(`[job-kill] No state found for '${job}'.`);
    return;
  }

  const pid = Number(state.pid);
  if (!pid || !Number.isFinite(pid)) {
    console.log(`[job-kill] '${job}' has no active pid.`);
    return;
  }

  if (!isPidRunning(pid)) {
    await writeJobState(job, {
      status: "killed",
      endedAt: new Date().toISOString(),
      exitCode: null,
      reason: "Marked killed; process was already not running.",
    });
    console.log(`[job-kill] '${job}' pid=${pid} was already stopped. State updated.`);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    console.warn(`[job-kill] SIGTERM failed for pid=${pid}: ${error.message}`);
  }

  let exited = await waitForExit(pid, 8000);
  if (!exited) {
    console.warn(`[job-kill] pid=${pid} did not exit on SIGTERM, sending SIGKILL.`);
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      console.warn(`[job-kill] SIGKILL failed for pid=${pid}: ${error.message}`);
    }
    exited = await waitForExit(pid, 2000);
  }

  if (!exited) {
    console.error(`[job-kill] Failed to stop pid=${pid}.`);
    process.exit(1);
    return;
  }

  await writeJobState(job, {
    status: "killed",
    endedAt: new Date().toISOString(),
    exitCode: null,
    reason: "Stopped manually via job-kill.",
  });
  console.log(`[job-kill] Stopped '${job}' (pid=${pid}).`);
}

main().catch((error) => {
  console.error(`[job-kill] Failed: ${error.message}`);
  process.exit(1);
});
