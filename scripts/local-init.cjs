#!/usr/bin/env node

const path = require("node:path");
const dotenv = require("dotenv");
const { run, runCapture } = require("./lib/process.cjs");
const { waitForHealthy } = require("./lib/docker.cjs");

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function preflight() {
  await runCapture("docker", ["--version"]);
  await runCapture("docker", ["compose", "version"]);
}

async function composeUp() {
  console.log("[local-init] Starting docker compose services...");
  // Keep CDN up for UI access during long-running sync/hydration phases.
  const serviceSet = ["mysql", "redis", "elasticsearch", "logstash", "kibana", "cdn"];
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await run("docker", ["compose", "up", "-d", ...serviceSet]);
      return;
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }
      console.warn(
        `[local-init] compose up attempt ${attempt}/${maxAttempts} failed, retrying... (${error.message})`
      );
      await run("docker", ["compose", "down", "--remove-orphans"]).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function composeDownWithVolumes() {
  console.log("[local-init] Reset requested: tearing down compose volumes and containers...");
  await run("docker", ["compose", "down", "-v"]);
}

async function waitInfra() {
  console.log("[local-init] Waiting for required infra services (mysql, redis, elasticsearch)...");
  await waitForHealthy("mysql");
  await waitForHealthy("redis");
  await waitForHealthy("elasticsearch");
  console.log("[local-init] Required infra services are ready.");

  // ELK companions are best-effort; do not block setup chain if they are slow.
  try {
    console.log("[local-init] Checking optional services (logstash, kibana, cdn)...");
    await waitForHealthy("logstash", 60000);
    await waitForHealthy("kibana", 60000);
    await waitForHealthy("cdn", 60000);
  } catch (error) {
    console.warn(`[local-init] Optional service check skipped: ${error.message}`);
  }
}

async function initializeDatabase() {
  console.log("[local-init] Syncing database schema from Sequelize models...");
  await run("node", ["scripts/db-sync-local.cjs"]);
  console.log("[local-init] Running local DB seeds...");
  await run("node", ["scripts/db-seed-local.cjs"]);
  console.log("[local-init] Local DB seed completed.");
}

async function printSummary() {
  console.log("\n[local-init] Bootstrap complete.");
  console.log("[local-init] Services:");
  console.log("  - MySQL:         localhost:3306");
  console.log("  - Redis:         localhost:6379");
  console.log("  - Elasticsearch: http://localhost:9200");
  console.log("  - Kibana:        http://localhost:5601");
  console.log("  - CDN:           http://localhost:8088");
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const reset = hasFlag("reset");
  const skipEs = hasFlag("skip-es-sync");
  const skipCdn = hasFlag("skip-cdn");

  console.log(`[local-init] Project root: ${ROOT}`);
  console.log(`[local-init] dryRun=${dryRun} reset=${reset} skipEs=${skipEs} skipCdn=${skipCdn}`);

  await preflight();
  if (dryRun) {
    console.log("[local-init] Preflight successful (dry-run).");
    return;
  }

  if (reset) {
    await composeDownWithVolumes();
  }

  await composeUp();
  await waitInfra();
  await initializeDatabase();
  console.log("[local-init] Running local seed step...");
  await run("node", ["scripts/seed-local.cjs"]);
  console.log("[local-init] Local seed step completed.");

  if (!skipEs) {
    await run("node", ["scripts/es-sync.cjs", "--mode=replace"]);
  }

  if (!skipCdn) {
    await run("node", ["scripts/cdn-hydrate.cjs"]);
  }

  await printSummary();
}

main().catch((error) => {
  console.error(`[local-init] Failed: ${error.message}`);
  process.exit(1);
});
