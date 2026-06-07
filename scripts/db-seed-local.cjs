#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const LOCAL_DB_NAME =
  process.env.LOCAL_DB_NAME || process.env.MYSQL_DATABASE || "americansurplus";

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "american_surplus_pass123",
  multipleStatements: true,
};

const LOCAL_USER = {
  email: "ozturkgokalp000@gmail.com",
  name: "Gokalp Ozturk",
  password: "Test@1234567",
  typeId: 1,
};

async function ensureDatabase() {
  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${LOCAL_DB_NAME}\`;`);
  } finally {
    await connection.end();
  }
}

async function applySeedSql(connection) {
  const sqlPath = path.join(ROOT, "db", "1_db_data.sql");
  const sql = await fs.readFile(sqlPath, "utf8");
  await connection.query(sql);
  console.log("[db-seed-local] Applied db/1_db_data.sql");
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query("SHOW TABLES LIKE ?", [tableName]);
  return Array.isArray(rows) && rows.length > 0;
}

async function deleteIfTableExists(connection, tableName, whereClause, params = []) {
  const exists = await tableExists(connection, tableName);
  if (!exists) {
    return;
  }
  await connection.query(`DELETE FROM ${tableName} WHERE ${whereClause}`, params);
}

async function ensureSchema(connection) {
  const requiredTables = ["users", "states", "request_statuses"];
  for (const tableName of requiredTables) {
    const exists = await tableExists(connection, tableName);
    if (!exists) {
      console.log(
        `[db-seed-local] Missing table '${tableName}', running db:sync:local first...`
      );
      const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "db-sync-local.cjs")], {
        cwd: ROOT,
        stdio: "inherit",
        env: process.env,
      });
      if (result.status !== 0) {
        throw new Error("Schema sync failed before local seeding.");
      }
      return;
    }
  }
}

async function seedStateAndUser(connection) {
  await connection.query(
    `
      INSERT INTO states (
        stateId, allow_request, stateName, addressLine1, addressLine2, city, stateCode, zip, phone
      ) VALUES (
        1, 1, 'Florida', 'Unknown', 'Unknown', 'Tallahassee', 'FL', '32301', '0000000000'
      )
      ON DUPLICATE KEY UPDATE
        allow_request = VALUES(allow_request),
        stateName = VALUES(stateName),
        stateCode = VALUES(stateCode);
    `
  );

  const passwordHash = await bcrypt.hash(LOCAL_USER.password, 10);
  const generatedUserId = crypto.randomUUID();

  await connection.query(
    `
      INSERT INTO users (
        id, email, password, name, typeId, isActive, mfa_enabled, is_email_verified, createdAt, updatedAt
      ) VALUES (
        ?, ?, ?, ?, ?, 1, 0, 1, NOW(), NOW()
      )
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        password = VALUES(password),
        typeId = VALUES(typeId),
        isActive = VALUES(isActive),
        mfa_enabled = VALUES(mfa_enabled),
        is_email_verified = VALUES(is_email_verified),
        updatedAt = NOW();
    `,
    [generatedUserId, LOCAL_USER.email, passwordHash, LOCAL_USER.name, LOCAL_USER.typeId]
  );

  const [userRows] = await connection.query(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [LOCAL_USER.email]
  );
  const userId = userRows?.[0]?.id;
  if (!userId) {
    throw new Error("Failed to resolve local seed user after upsert.");
  }

  // Reset prior auth/scope rows for this local user so seed is deterministic.
  await deleteIfTableExists(connection, "user_scopes", "user_id = ?", [userId]);
  await deleteIfTableExists(connection, "user_sessions", "userId = ?", [userId]);
  await deleteIfTableExists(connection, "mfa_audit_logs", "user_id = ?", [userId]);
  await deleteIfTableExists(connection, "password_reset_tokens", "user_id = ?", [userId]);
  await deleteIfTableExists(connection, "sasp_users", "userId = ?", [userId]);

  const [scopeRows] = await connection.query(
    "SELECT scope_id FROM scopes WHERE type = 'sasp' LIMIT 1"
  );
  let scopeId = scopeRows?.[0]?.scope_id;
  if (!scopeId) {
    await connection.query("INSERT INTO scopes (scope_id, type) VALUES (1, 'sasp')");
    scopeId = 1;
  }

  const [roleRows] = await connection.query(
    "SELECT role_id FROM roles WHERE role_name = 'SASP Admin' ORDER BY role_id LIMIT 1"
  );
  const roleId = roleRows?.[0]?.role_id;
  if (!roleId) {
    throw new Error("Missing 'SASP Admin' role required for local seed.");
  }

  const [saspInsert] = await connection.query(
    `
      INSERT INTO sasp_users (
        userId, stateId, title, is_active, deactivatedAt, createdAt, updatedAt
      ) VALUES (
        ?, 1, 'Local SASP User', 1, NULL, NOW(), NOW()
      )
    `,
    [userId]
  );

  const saspUserId = saspInsert?.insertId;
  if (!saspUserId) {
    throw new Error("Failed to create sasp_users row for local user.");
  }

  await connection.query(
    `
      INSERT INTO user_scopes (
        user_id, scope_id, role_id, sasp_user_id, is_primary_contact, is_head_representative
      ) VALUES (
        ?, ?, ?, ?, 1, 1
      )
    `,
    [userId, scopeId, roleId, saspUserId]
  );

  console.log("[db-seed-local] Seeded local user, Florida state, and SASP scope.");
}

async function main() {
  await ensureDatabase();

  const connection = await mysql.createConnection({
    ...DB_CONFIG,
    database: LOCAL_DB_NAME,
  });

  try {
    await connection.query("SET SQL_SAFE_UPDATES = 0");
    await ensureSchema(connection);
    await applySeedSql(connection);
    await connection.query("SET SQL_SAFE_UPDATES = 0");
    await seedStateAndUser(connection);
  } finally {
    await connection.end();
  }

  console.log("[db-seed-local] Completed.");
}

main().catch((error) => {
  console.error(`[db-seed-local] Failed: ${error.message}`);
  process.exit(1);
});
