#!/usr/bin/env node

const path = require("node:path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "american_surplus_pass123",
};

const MIN_IDLE_SECONDS = Number(process.env.MYSQL_UNLOCK_MIN_IDLE_SECONDS || 30);

async function main() {
  const connection = await mysql.createConnection(DB_CONFIG);

  try {
    const [rows] = await connection.query("SHOW FULL PROCESSLIST");
    const candidates = rows.filter((row) => {
      if (!row.Id || row.Id === connection.threadId) return false;
      if (row.Command === "Daemon") return false;
      if (Number(row.Time || 0) < MIN_IDLE_SECONDS) return false;
      return row.Command === "Sleep" || String(row.State || "").includes("lock") || String(row.Info || "").length > 0;
    });

    if (candidates.length === 0) {
      console.log("[mysql-unlock-local] No long-running connections to terminate.");
      return;
    }

    for (const row of candidates) {
      try {
        await connection.query(`KILL ${row.Id}`);
        console.log(
          `[mysql-unlock-local] Killed connection id=${row.Id} command=${row.Command} time=${row.Time}s db=${row.db || "null"}`
        );
      } catch (error) {
        console.warn(`[mysql-unlock-local] Failed to kill id=${row.Id}: ${error.message}`);
      }
    }

    console.log(`[mysql-unlock-local] Cleared ${candidates.length} connection(s).`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`[mysql-unlock-local] Failed: ${error.message}`);
  process.exit(1);
});
