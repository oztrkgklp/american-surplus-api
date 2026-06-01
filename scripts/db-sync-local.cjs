#!/usr/bin/env node

const path = require("node:path");
const dotenv = require("dotenv");

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

require("ts-node/register/transpile-only");
require("tsconfig-paths/register");

async function main() {
  const env = process.env.ENVIRONMENT || process.env.NODE_ENV || "unknown";
  console.log(`[db-sync-local] Environment: ${env}`);

  // Ensure standalone metadata tables are registered before sync.
  require("../src/metadata/models/RequestStatus");
  require("../src/metadata/models/RequestAttachmentType");
  require("../src/metadata/models/PropertyType");
  require("../src/metadata/models/DemilCondition");
  require("../src/metadata/models/DisposalCondition");
  require("../src/metadata/models/SupplyCondition");

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
