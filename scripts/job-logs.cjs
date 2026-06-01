#!/usr/bin/env node

const fsp = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { jobLogPath, readJobState } = require("./lib/async-job.cjs");

function getArgValue(name, fallback = "") {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) return fallback;
  return arg.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function printLastLines(filePath, lines) {
  const raw = await fsp.readFile(filePath, "utf8");
  const all = raw.split(/\r?\n/);
  const subset = all.slice(Math.max(0, all.length - lines));
  console.log(subset.join("\n"));
}

async function main() {
  const job = getArgValue("job");
  const lines = Math.max(1, Number(getArgValue("lines", "200")) || 200);
  const follow = hasFlag("follow");

  if (!job) {
    console.error("[job-logs] Missing --job=<name>");
    process.exit(1);
    return;
  }

  const logPath = jobLogPath(job);
  try {
    await fsp.access(logPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      const state = await readJobState(job);
      const status = state?.status || "unknown";
      console.log(`[job-logs] No log file yet for '${job}' (status=${status}).`);
      return;
    }
    throw error;
  }

  if (!follow) {
    await printLastLines(logPath, lines);
    return;
  }

  const tail = spawn("tail", ["-n", String(lines), "-f", logPath], { stdio: "inherit" });
  tail.on("exit", (code) => process.exit(code || 0));
  tail.on("error", (error) => {
    console.error(`[job-logs] Failed to follow log: ${error.message}`);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(`[job-logs] Failed: ${error.message}`);
  process.exit(1);
});
