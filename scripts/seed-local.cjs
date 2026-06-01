#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const seedPath = path.join(ROOT, "scripts", "seed", "local-seed.json");
const outputPath = path.join(ROOT, ".runtime", "manifests", "local-seed-applied.json");

async function main() {
  const raw = await fs.readFile(seedPath, "utf8");
  const parsed = JSON.parse(raw);
  const whitelistedEmails = Array.isArray(parsed.whitelistedEmails)
    ? parsed.whitelistedEmails.filter((v) => typeof v === "string" && v.includes("@"))
    : [];

  const payload = {
    generatedAt: new Date().toISOString(),
    whitelistedEmails,
    count: whitelistedEmails.length,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[seed-local] Whitelisted emails loaded: ${whitelistedEmails.length}`);
  console.log(`[seed-local] Manifest: ${outputPath}`);
}

main().catch((error) => {
  console.error(`[seed-local] Failed: ${error.message}`);
  process.exit(1);
});
