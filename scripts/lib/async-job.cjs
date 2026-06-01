const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const RUNTIME_DIR = path.join(ROOT, ".runtime");
const JOBS_DIR = path.join(RUNTIME_DIR, "jobs");
const LOGS_DIR = path.join(RUNTIME_DIR, "logs");

function nowIso() {
  return new Date().toISOString();
}

function jobStatePath(jobName) {
  return path.join(JOBS_DIR, `${jobName}.json`);
}

function jobLogPath(jobName) {
  return path.join(LOGS_DIR, `${jobName}.log`);
}

async function ensureRuntimeDirs() {
  await fsp.mkdir(JOBS_DIR, { recursive: true });
  await fsp.mkdir(LOGS_DIR, { recursive: true });
}

async function readJobState(jobName) {
  try {
    const raw = await fsp.readFile(jobStatePath(jobName), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJobState(jobName, patch) {
  await ensureRuntimeDirs();
  const current = (await readJobState(jobName)) || {};
  const next = {
    ...current,
    ...patch,
    job: jobName,
    updatedAt: nowIso(),
  };
  await fsp.writeFile(jobStatePath(jobName), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function isPidRunning(pid) {
  if (!pid || Number.isNaN(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    if (error && error.code === "EPERM") return true;
    return false;
  }
}

async function spawnDetachedNode(jobName, scriptPath, args = []) {
  await ensureRuntimeDirs();
  const absoluteScript = path.isAbsolute(scriptPath) ? scriptPath : path.join(ROOT, scriptPath);
  const logPath = jobLogPath(jobName);
  const outFd = fs.openSync(logPath, "a");
  const errFd = fs.openSync(logPath, "a");

  const child = spawn(process.execPath, [absoluteScript, ...args], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", outFd, errFd],
    detached: true,
  });

  fs.closeSync(outFd);
  fs.closeSync(errFd);
  child.unref();

  await writeJobState(jobName, {
    status: "running",
    pid: child.pid,
    startedAt: nowIso(),
    endedAt: null,
    exitCode: null,
    reason: null,
    error: null,
    script: absoluteScript,
    logPath,
  });

  return { pid: child.pid, logPath };
}

module.exports = {
  ROOT,
  RUNTIME_DIR,
  JOBS_DIR,
  LOGS_DIR,
  nowIso,
  ensureRuntimeDirs,
  jobStatePath,
  jobLogPath,
  readJobState,
  writeJobState,
  isPidRunning,
  spawnDetachedNode,
};
