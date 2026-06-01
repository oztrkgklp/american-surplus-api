#!/usr/bin/env node

const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

require("ts-node/register/transpile-only");
require("tsconfig-paths/register");

function collectModelFiles(dirPath, acc = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectModelFiles(absPath, acc);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!absPath.endsWith(".ts") || absPath.endsWith(".d.ts")) {
      continue;
    }

    // Load all model definitions under src/**/models/*.ts
    if (absPath.includes(`${path.sep}models${path.sep}`)) {
      acc.push(absPath);
    }
  }
  return acc;
}

function loadAllModels() {
  const srcDir = path.join(ROOT, "src");
  const modelFiles = collectModelFiles(srcDir).sort();
  for (const modelFile of modelFiles) {
    require(modelFile);
  }
  console.log(`[db-sync-local] Loaded model definitions: ${modelFiles.length}`);
}

async function main() {
  const env = process.env.ENVIRONMENT || process.env.NODE_ENV || "unknown";
  console.log(`[db-sync-local] Environment: ${env}`);

  loadAllModels();

  const { setupAssociations } = require("../src/utils/modelAssociations");
  const { database, syncDatabaseForLocalDevelopment } = require("../src/utils/database");

  setupAssociations();
  await database.connect();
  await syncDatabaseForLocalDevelopment();
  await database.sequelize.close();

  console.log("[db-sync-local] Database schema synced from Sequelize models.");
}

main().catch((error) => {
  console.error(`[db-sync-local] Failed: ${error.message}`);
  process.exit(1);
});
