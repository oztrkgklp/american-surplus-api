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

const LOCAL_SASP_USERS = [
  {
    email: 'ozturkgokalp000@gmail.com',
    name: 'Gokalp Ozturk',
    password: 'Test@1234567',
    typeId: 1,
  },
  {
    email: 'halit1as@gmail.com',
    name: 'Halit Ozkilic',
    password: 'Test@1234567',
    typeId: 1,
  },
];

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getYesterdayDateString() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const ORGANIZATION_CLEANUP_TABLES = [
  "application_attachments",
  "application_logs",
  "application_forms",
  "sba8a_certifications",
  "applications",
  "hao_role_invitations",
  "organization_invitations",
  "report_logs",
  "reports",
  "3040_mappings",
  "want_list_match_history",
  "want_list_matches",
  "want_list_keywords",
  "compliance_attachments",
  "compliance_activity_logs",
  "compliances",
  "invoice_activity_logs",
  "invoices",
  "logistics_packets",
  "sf97_packets",
  "properties",
  "request_comments",
  "request_attachments",
  "requests",
  "organization_users",
  "donee_accounts",
  "organization_addresses",
  "organizations",
];

const FLORIDA_STATE_ID = 1;
const BASELINE_FEE_EFFECTIVE_DATE = "2000-01-01";

const STATE_DISPOSAL_FEES = [
  { disposalConditionId: 1, code: "N", fee: 2.5 },
  { disposalConditionId: 2, code: "U", fee: 2 },
  { disposalConditionId: 3, code: "R", fee: 1 },
  { disposalConditionId: 4, code: "X", fee: 0.5 },
  { disposalConditionId: 5, code: "S", fee: 0.25 },
];

// InvoiceService also requires matching American Surplus fee rows.
const STATE_AMERICAN_SURPLUS_FEES = [
  { disposalConditionId: 1, code: "N", fee: 0 },
  { disposalConditionId: 2, code: "U", fee: 0 },
  { disposalConditionId: 3, code: "R", fee: 0 },
  { disposalConditionId: 4, code: "X", fee: 0 },
  { disposalConditionId: 5, code: "S", fee: 0 },
];

// UI invoice generation defaults to S2; also supports S3 and SC.
const FLORIDA_INVOICE_CONFIGS = [
  { series: "S2", starting_number: 1, current_number: 0, total_digit: 4 },
  { series: "S3", starting_number: 1, current_number: 0, total_digit: 4 },
  { series: "SC", starting_number: 1, current_number: 0, total_digit: 4 },
];

const LOCAL_DONEE_USERS = [
  {
    email: 'ozturkgokalp000+donee@gmail.com',
    name: 'Gokalp Ozturk',
    password: 'Test@1234567',
    typeId: 2,
  },
  {
    email: 'halit1as+donee@gmail.com',
    name: 'Halit Ozkilic',
    password: 'Test@1234567',
    typeId: 2,
  },
];

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

async function deleteAllIfTableExists(connection, tableName) {
  const exists = await tableExists(connection, tableName);
  if (!exists) {
    return 0;
  }
  const [result] = await connection.query(`DELETE FROM \`${tableName}\``);
  return Number(result?.affectedRows || 0);
}

async function cleanupOrganizations(connection) {
  const orgTableExists = await tableExists(connection, "organizations");
  if (!orgTableExists) {
    console.log("[db-seed-local] Skipping organization cleanup (organizations table not found).");
    return;
  }

  const [orgRows] = await connection.query("SELECT COUNT(*) AS count FROM organizations");
  const organizationCount = Number(orgRows?.[0]?.count || 0);
  if (organizationCount === 0) {
    console.log("[db-seed-local] No organizations to clean up.");
    return;
  }

  console.log(`[db-seed-local] Cleaning up ${organizationCount} organization(s) and related data...`);

  await connection.query("SET FOREIGN_KEY_CHECKS = 0");

  if (await tableExists(connection, "user_scopes")) {
    const [scopeResult] = await connection.query(
      `
        DELETE FROM user_scopes
        WHERE organization_user_id IS NOT NULL
           OR donee_account_id IS NOT NULL
      `
    );
    const scopeDeleted = Number(scopeResult?.affectedRows || 0);
    if (scopeDeleted > 0) {
      console.log(`[db-seed-local] Removed ${scopeDeleted} organization/donee user scope row(s).`);
    }
  }

  let totalDeleted = 0;
  for (const tableName of ORGANIZATION_CLEANUP_TABLES) {
    const deleted = await deleteAllIfTableExists(connection, tableName);
    if (deleted > 0) {
      console.log(`[db-seed-local] Deleted ${deleted} row(s) from ${tableName}.`);
      totalDeleted += deleted;
    }
  }

  await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  console.log(`[db-seed-local] Organization cleanup completed (${totalDeleted} related row(s) removed).`);
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

async function upsertUserRecord(connection, localUser) {
  const passwordHash = await bcrypt.hash(localUser.password, 10);
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
    [generatedUserId, localUser.email, passwordHash, localUser.name, localUser.typeId]
  );

  const [userRows] = await connection.query(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [localUser.email]
  );
  const userId = userRows?.[0]?.id;
  if (!userId) {
    throw new Error(`Failed to resolve local seed user after upsert: ${localUser.email}`);
  }

  return userId;
}

async function clearUserAuthState(connection, userId) {
  await deleteIfTableExists(connection, "user_sessions", "userId = ?", [userId]);
  await deleteIfTableExists(connection, "mfa_audit_logs", "user_id = ?", [userId]);
  await deleteIfTableExists(connection, "password_reset_tokens", "user_id = ?", [userId]);
}

async function removeSaspScopeForUser(connection, userId) {
  await deleteIfTableExists(connection, "user_scopes", "user_id = ? AND sasp_user_id IS NOT NULL", [userId]);
  await deleteIfTableExists(connection, "sasp_users", "userId = ?", [userId]);
}

async function resetSaspUserScopes(connection, userId) {
  await deleteIfTableExists(connection, "user_scopes", "user_id = ?", [userId]);
  await deleteIfTableExists(connection, "sasp_users", "userId = ?", [userId]);
}

async function seedLocalDoneeUser(connection, localUser) {
  const userId = await upsertUserRecord(connection, localUser);
  await clearUserAuthState(connection, userId);
  await removeSaspScopeForUser(connection, userId);
  console.log(`[db-seed-local] Seeded local donee user (no SASP scope): ${localUser.email}`);
}

async function seedLocalSaspUser(connection, localUser, scopeId, roleId) {
  const userId = await upsertUserRecord(connection, localUser);
  await clearUserAuthState(connection, userId);
  await resetSaspUserScopes(connection, userId);

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
    throw new Error(`Failed to create sasp_users row for local user: ${localUser.email}`);
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

  console.log(`[db-seed-local] Seeded local SASP user: ${localUser.email}`);
}

async function seedFeeRows(connection, effectiveDate, entries, insertSql) {
  for (const entry of entries) {
    await connection.query(insertSql, [
      FLORIDA_STATE_ID,
      entry.disposalConditionId,
      entry.fee,
      effectiveDate,
    ]);
  }
}

async function seedStateFeeSchedules(connection) {
  const hasDisposalFees = await tableExists(connection, "state_disposal_fees");
  const hasAmericanSurplusFees = await tableExists(connection, "state_american_surplus_fees");
  if (!hasDisposalFees || !hasAmericanSurplusFees) {
    console.log("[db-seed-local] Skipping state fee schedules (fee tables not found).");
    return;
  }

  const yesterday = getYesterdayDateString();
  const effectiveDates = [BASELINE_FEE_EFFECTIVE_DATE, yesterday];

  for (const effectiveDate of effectiveDates) {
    await deleteIfTableExists(
      connection,
      "state_disposal_fees",
      "stateId = ? AND DATE(effective_date) = ?",
      [FLORIDA_STATE_ID, effectiveDate]
    );
    await deleteIfTableExists(
      connection,
      "state_american_surplus_fees",
      "state_id = ? AND DATE(effective_date) = ?",
      [FLORIDA_STATE_ID, effectiveDate]
    );

    await seedFeeRows(
      connection,
      effectiveDate,
      STATE_DISPOSAL_FEES,
      `
        INSERT INTO state_disposal_fees (
          stateId, disposalConditionId, fee, effective_date
        ) VALUES (?, ?, ?, ?)
      `
    );

    await seedFeeRows(
      connection,
      effectiveDate,
      STATE_AMERICAN_SURPLUS_FEES,
      `
        INSERT INTO state_american_surplus_fees (
          state_id, disposal_condition_id, fee, effective_date
        ) VALUES (?, ?, ?, ?)
      `
    );
  }

  console.log(
    `[db-seed-local] Seeded Florida disposal + American Surplus fees for ${effectiveDates.join(", ")}.`
  );
}

async function seedInvoiceConfigs(connection) {
  if (!(await tableExists(connection, "invoice_config"))) {
    console.log("[db-seed-local] Skipping invoice config (table not found).");
    return;
  }

  for (const config of FLORIDA_INVOICE_CONFIGS) {
    await deleteIfTableExists(
      connection,
      "invoice_config",
      "state_id = ? AND series = ?",
      [FLORIDA_STATE_ID, config.series]
    );

    await connection.query(
      `
        INSERT INTO invoice_config (
          state_id, series, starting_number, current_number, total_digit, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        FLORIDA_STATE_ID,
        config.series,
        config.starting_number,
        config.current_number,
        config.total_digit,
      ]
    );
  }

  console.log(
    `[db-seed-local] Seeded Florida invoice config series: ${FLORIDA_INVOICE_CONFIGS.map((c) => c.series).join(", ")}.`
  );
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

  await seedStateFeeSchedules(connection);
  await seedInvoiceConfigs(connection);

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

  for (const localUser of LOCAL_SASP_USERS) {
    await seedLocalSaspUser(connection, localUser, scopeId, roleId);
  }

  for (const localUser of LOCAL_DONEE_USERS) {
    await seedLocalDoneeUser(connection, localUser);
  }

  console.log(
    `[db-seed-local] Seeded ${LOCAL_SASP_USERS.length} SASP user(s) with Florida SASP scope and ${LOCAL_DONEE_USERS.length} donee user(s) without SASP scope.`
  );
}

async function main() {
  const cleanOrganizations = hasFlag("clean-organizations");

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
    if (cleanOrganizations) {
      await cleanupOrganizations(connection);
    }
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
