#!/usr/bin/env node

const { run } = require("./lib/process.cjs");
const { readJobState, isPidRunning, writeJobState } = require("./lib/async-job.cjs");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function waitForExit(pid, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isPidRunning(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return !isPidRunning(pid);
}

async function stopRunningCdnHydrateIfNeeded(dryRun) {
  const state = await readJobState("cdn-hydrate");
  if (!state || state.status !== "running" || !isPidRunning(state.pid)) {
    return;
  }

  console.log(`[setup:local] Existing cdn-hydrate is running (pid=${state.pid}).`);
  if (dryRun) {
    console.log("[setup:local] Dry run: would terminate running cdn-hydrate process.");
    return;
  }

  try {
    process.kill(Number(state.pid), "SIGTERM");
  } catch (error) {
    console.warn(`[setup:local] SIGTERM failed for pid=${state.pid}: ${error.message}`);
  }

  const exited = await waitForExit(Number(state.pid), 8000);
  if (!exited) {
    console.warn(`[setup:local] cdn-hydrate pid=${state.pid} did not exit after SIGTERM, sending SIGKILL.`);
    try {
      process.kill(Number(state.pid), "SIGKILL");
    } catch (error) {
      console.warn(`[setup:local] SIGKILL failed for pid=${state.pid}: ${error.message}`);
    }
    await waitForExit(Number(state.pid), 2000);
  }

  await writeJobState("cdn-hydrate", {
    status: "killed",
    endedAt: new Date().toISOString(),
    exitCode: null,
    reason: "Stopped by setup:local before starting a new run.",
  });
  console.log("[setup:local] Previous cdn-hydrate process stopped.");
}

async function main() {
  const dryRun = hasFlag("dry-run");
  console.log(`[setup:local] dryRun=${dryRun}`);

  await stopRunningCdnHydrateIfNeeded(dryRun);

  if (dryRun) {
    console.log("[setup:local] Dry run complete.");
    return;
  }

  await run("node", ["scripts/local-init.cjs", "--reset", "--skip-es-sync", "--skip-cdn"]);
  await run("npm", ["run", "es:sync"]);
  await run("npm", ["run", "cdn:hydrate:async"]);
}

main().catch((error) => {
  console.error(`[setup:local] Failed: ${error.message}`);
  process.exit(1);
});
