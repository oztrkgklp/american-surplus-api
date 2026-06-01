#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const dotenv = require("dotenv");
const {
  ROOT,
  ensureRuntimeDirs,
  jobLogPath,
  readJobState,
  writeJobState,
  nowIso,
} = require("./lib/async-job.cjs");

dotenv.config({ path: path.join(ROOT, ".env") });

const PIPELINE_JOB = "seed-local";
const STEP_DEFS = [
  { name: "seed-local-script", script: "scripts/seed-local.cjs", statusJob: "seed-local-script" },
  { name: "es-sync", script: "scripts/es-sync.cjs", args: ["--mode=replace"], statusJob: "es-sync" },
  { name: "cdn-hydrate", script: "scripts/cdn-hydrate.cjs", statusJob: "cdn-hydrate" },
];

function createTimestampedStream(logPath) {
  const stream = fs.createWriteStream(logPath, { flags: "a" });
  stream.write(`\n[${nowIso()}] --- log started ---\n`);
  return stream;
}

async function markQueuedSteps() {
  for (const step of STEP_DEFS) {
    await writeJobState(step.statusJob, {
      status: "queued",
      step: step.name,
      pid: null,
      startedAt: null,
      endedAt: null,
      exitCode: null,
      reason: null,
      error: null,
      parentJob: PIPELINE_JOB,
      logPath: jobLogPath(step.statusJob),
    });
  }
}

async function runStep(step, pipelineLogStream) {
  const stepLog = createTimestampedStream(jobLogPath(step.statusJob));
  const scriptAbs = path.join(ROOT, step.script);
  const args = step.args || [];

  await writeJobState(step.statusJob, {
    status: "running",
    step: step.name,
    pid: null,
    startedAt: nowIso(),
    endedAt: null,
    exitCode: null,
    reason: null,
    error: null,
    script: scriptAbs,
    args,
    parentJob: PIPELINE_JOB,
    logPath: jobLogPath(step.statusJob),
  });
  await writeJobState(PIPELINE_JOB, {
    status: "running",
    currentStep: step.name,
    lastStepStartedAt: nowIso(),
    error: null,
  });

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptAbs, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    writeJobState(step.statusJob, { pid: child.pid }).catch(() => {});

    child.stdout.on("data", (chunk) => {
      stepLog.write(chunk);
      pipelineLogStream.write(`[${step.name}] ${String(chunk)}`);
    });
    child.stderr.on("data", (chunk) => {
      stepLog.write(chunk);
      pipelineLogStream.write(`[${step.name}] ${String(chunk)}`);
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      resolve(code);
    });
  })
    .then(async (code) => {
      await writeJobState(step.statusJob, {
        status: code === 0 ? "completed" : "failed",
        endedAt: nowIso(),
        exitCode: code,
        reason: null,
        error: code === 0 ? null : `${step.name} exited with code ${code}`,
      });
      if (code !== 0) {
        throw new Error(`${step.name} exited with code ${code}`);
      }
    })
    .finally(() => {
      stepLog.end(`\n[${nowIso()}] --- log ended ---\n`);
    });
}

async function main() {
  await ensureRuntimeDirs();
  const pipelineLogPath = jobLogPath(PIPELINE_JOB);
  await fsp.writeFile(pipelineLogPath, "", "utf8");
  const pipelineLog = createTimestampedStream(pipelineLogPath);

  const currentPid = process.pid;
  await markQueuedSteps();
  await writeJobState(PIPELINE_JOB, {
    status: "running",
    pid: currentPid,
    startedAt: nowIso(),
    endedAt: null,
    exitCode: null,
    reason: null,
    error: null,
    currentStep: "seed-local-script",
    logPath: pipelineLogPath,
    steps: STEP_DEFS.map((step) => step.name),
  });

  pipelineLog.write(`[${nowIso()}] seed pipeline started (pid=${currentPid})\n`);

  try {
    for (const step of STEP_DEFS) {
      pipelineLog.write(`[${nowIso()}] starting step: ${step.name}\n`);
      await runStep(step, pipelineLog);
      pipelineLog.write(`[${nowIso()}] completed step: ${step.name}\n`);
    }

    await writeJobState(PIPELINE_JOB, {
      status: "completed",
      currentStep: null,
      endedAt: nowIso(),
      exitCode: 0,
      reason: null,
      error: null,
    });
    pipelineLog.write(`[${nowIso()}] seed pipeline completed\n`);
  } catch (error) {
    const pipelineState = await readJobState(PIPELINE_JOB);
    const failedStep = pipelineState?.currentStep || "unknown";
    for (const step of STEP_DEFS) {
      const currentState = await readJobState(step.statusJob);
      if (currentState?.status === "queued") {
        await writeJobState(step.statusJob, {
          status: "skipped",
          endedAt: nowIso(),
          exitCode: null,
          reason: `Skipped because pipeline failed at step '${failedStep}'.`,
          error: null,
        });
      }
    }
    await writeJobState(PIPELINE_JOB, {
      status: "failed",
      endedAt: nowIso(),
      exitCode: 1,
      error: error.message,
    });
    pipelineLog.write(`[${nowIso()}] seed pipeline failed: ${error.message}\n`);
    throw error;
  } finally {
    pipelineLog.end(`\n[${nowIso()}] --- log ended ---\n`);
  }
}

main().catch((error) => {
  console.error(`[seed-local-async] Failed: ${error.message}`);
  process.exit(1);
});
