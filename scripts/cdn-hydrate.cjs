#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const dotenv = require("dotenv");
const { Client } = require("@elastic/elasticsearch");
const { run, runCapture } = require("./lib/process.cjs");

const APP_INDICES = ["ppms-service-details", "ppms-details"];
const CDN_CONTAINER = "american-surplus-cdn";
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });
const BLOCKED_PATH_SEGMENT = "/gw/property-reporting/ppms/api/v1/property/icn/";
const IMAGE_EXTENSION_RE = /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif)(?:\?.*)?$/i;

function getArgValue(name, fallback) {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!found) return fallback;
  return found.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeRemotePrefix(value) {
  const fallback = "https://dev-portal.sdnexus.app/api";
  if (!value || typeof value !== "string") return fallback;
  const sanitized = value.replace(/["']/g, "").replace(/\s+/g, "").trim();
  if (!sanitized) return fallback;
  return sanitized.replace(/\/+$/, "");
}

function toAbsoluteRemoteUrl(uri, basePrefix) {
  if (!uri) return null;
  if (/^https?:\/\//i.test(uri)) return uri;
  const apiBase = basePrefix.endsWith("/api") ? basePrefix : `${basePrefix}/api`;
  const originBase = apiBase.replace(/\/api$/, "");
  if (uri.startsWith("property-uploads/")) return `${originBase}/${uri}`;
  if (uri.startsWith("/property-uploads/")) return `${originBase}${uri}`;
  if (uri.startsWith("/api/")) return `${apiBase}${uri.slice(4)}`;
  if (uri.startsWith("/")) return `${apiBase}${uri}`;
  return `${apiBase}/${uri}`;
}

function shouldSkipUri(uri) {
  if (!uri || typeof uri !== "string") return true;
  const value = uri.trim();
  if (!value) return true;
  return value.toLowerCase().includes(BLOCKED_PATH_SEGMENT);
}

function isImagePath(value) {
  if (!value || typeof value !== "string") return false;
  return IMAGE_EXTENSION_RE.test(value.trim());
}

function normalizeIcn(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function compareIcn(a, b) {
  return normalizeIcn(a).localeCompare(normalizeIcn(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function maxIcn(a, b) {
  if (!a) return b || "";
  if (!b) return a || "";
  return compareIcn(a, b) >= 0 ? a : b;
}

async function writeJsonAtomic(filePath, payload) {
  if (!filePath) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

function buildImageIndex(downloaded) {
  const imageItems = downloaded
    .filter((item) => isImagePath(item.cdnPath))
    .map((item) => ({
      cdnPath: item.cdnPath,
      sourceUri: item.sourceUri,
      fileName: path.posix.basename(item.cdnPath || ""),
    }));

  return {
    generatedAt: new Date().toISOString(),
    totalImages: imageItems.length,
    images: imageItems,
  };
}

async function publishImageIndex(tmpDir, downloaded) {
  const imageIndexPath = path.join(tmpDir, "image-index.json");
  const imageIndex = buildImageIndex(downloaded);
  await fs.writeFile(imageIndexPath, JSON.stringify(imageIndex, null, 2), "utf8");
  await run("docker", ["cp", imageIndexPath, `${CDN_CONTAINER}:/usr/share/nginx/html/image-index.json`]);
  return imageIndex;
}

function getApiBase(remotePrefix) {
  return remotePrefix.endsWith("/api") ? remotePrefix : `${remotePrefix}/api`;
}

function getOriginBase(remotePrefix) {
  return getApiBase(remotePrefix).replace(/\/api$/, "");
}

function getNestedValue(obj, pathParts) {
  let current = obj;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function extractAuthToken(payload) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = [
    ["accessToken"],
    ["token"],
    ["jwt"],
    ["idToken"],
    ["result", "accessToken"],
    ["result", "token"],
    ["data", "accessToken"],
    ["data", "token"],
    ["response", "accessToken"],
    ["response", "token"],
  ];
  for (const candidate of candidates) {
    const value = getNestedValue(payload, candidate);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function extractUserScopeId(payload) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = [
    ["userScopeId"],
    ["user_scope_id"],
    ["result", "userScopeId"],
    ["result", "user_scope_id"],
    ["result", "user", "userScopeId"],
    ["result", "user", "user_scope_id"],
    ["data", "userScopeId"],
    ["data", "user_scope_id"],
    ["data", "user", "userScopeId"],
    ["data", "user", "user_scope_id"],
  ];
  for (const candidate of candidates) {
    const value = getNestedValue(payload, candidate);
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function extractTokenExpiration(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    ["tokenExpirationDate"],
    ["expiresAt"],
    ["expires_at"],
    ["result", "tokenExpirationDate"],
    ["result", "expiresAt"],
    ["result", "expires_at"],
    ["data", "tokenExpirationDate"],
    ["data", "expiresAt"],
    ["data", "expires_at"],
  ];
  for (const candidate of candidates) {
    const value = getNestedValue(payload, candidate);
    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 10_000_000_000 ? value : value * 1000;
    }
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric > 10_000_000_000 ? numeric : numeric * 1000;
      }
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function extractCookieHeader(rawHeaders) {
  if (!rawHeaders) return "";
  const lines = String(rawHeaders).split(/\r?\n/);
  const cookieMap = new Map();
  for (const line of lines) {
    const match = line.match(/^set-cookie:\s*([^;]+)/i);
    if (match && match[1]) {
      const pair = match[1].trim();
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      // Prefer non-empty values while still allowing later updates.
      if (value || !cookieMap.has(name)) {
        cookieMap.set(name, value);
      }
    }
  }
  const normalizedPairs = [...cookieMap.entries()]
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`);
  return normalizedPairs.join("; ");
}

function extractTokenFromCookieHeader(cookieHeader) {
  if (!cookieHeader) return "";
  const match = cookieHeader.match(/(?:^|;\s*)accessToken=([^;]+)/);
  return match?.[1]?.trim() || "";
}

async function loginForRemoteAuth(remotePrefix, email, password) {
  const originBase = getOriginBase(remotePrefix);
  const apiBase = getApiBase(remotePrefix);
  const loginUrl = `${apiBase}/auth/login`;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "as-cdn-login-"));
  const headerPath = path.join(tmpDir, "headers.txt");
  const bodyPath = path.join(tmpDir, "body.json");
  await runCapture("curl", [
    "-fsSL",
    "-D",
    headerPath,
    "-o",
    bodyPath,
    loginUrl,
    "-H",
    "accept: */*",
    "-H",
    "content-type: application/json",
    "-H",
    `origin: ${originBase}`,
    "-H",
    `referer: ${originBase}/login`,
    "--data-raw",
    JSON.stringify({ email, password }),
  ]);
  const [rawHeaders, rawBody] = await Promise.all([
    fs.readFile(headerPath, "utf8"),
    fs.readFile(bodyPath, "utf8"),
  ]);
  const payload = JSON.parse(rawBody);
  const cookieHeader = extractCookieHeader(rawHeaders);
  const token = extractAuthToken(payload) || extractTokenFromCookieHeader(cookieHeader);
  if (!token && !cookieHeader) {
    throw new Error("Auth login succeeded but no access token or session cookie was found");
  }
  const userScopeId = extractUserScopeId(payload);
  const tokenExpirationMs = extractTokenExpiration(payload);
  return { token, userScopeId, cookieHeader, tokenExpirationMs };
}

function getCandidateRemoteUrls(sourceUri, remotePrefix) {
  const urls = [];
  const primary = toAbsoluteRemoteUrl(sourceUri, remotePrefix);
  if (primary) urls.push(primary);

  const normalized = String(sourceUri || "").trim().replace(/^\/+/, "");
  const propertyUploadMatch = normalized.match(/^property-uploads\/([^/]+)\/([^/?#]+)$/i);
  if (propertyUploadMatch) {
    const [, icn, fileName] = propertyUploadMatch;
    const apiBase = getApiBase(remotePrefix);
    urls.push(
      `${apiBase}/properties/listing/${encodeURIComponent(icn)}/images/${encodeURIComponent(fileName)}`
    );
  }

  return [...new Set(urls)];
}

async function looksLikeImageFile(filePath) {
  const data = await fs.readFile(filePath);
  if (!data || data.length < 4) return false;

  // JPEG
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return true;
  // PNG
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return true;
  // GIF
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return true;
  // BMP
  if (data[0] === 0x42 && data[1] === 0x4d) return true;
  // WEBP (RIFF....WEBP)
  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return true;
  }
  // AVIF/HEIF family (ftyp)
  if (String.fromCharCode(...data.slice(4, 8)) === "ftyp") return true;

  const prefix = data.slice(0, 1024).toString("utf8").trim().toLowerCase();
  if (prefix.startsWith("<!doctype html") || prefix.startsWith("<html")) return false;
  if (prefix.startsWith("{") || prefix.startsWith("[")) return false;
  if (prefix.includes("<svg")) return true;
  return false;
}

async function extractUris(client, index, limitPerIndex, scrollBatchSize, startAfterIcn) {
  const uris = new Map();
  let skippedBeforeCheckpoint = 0;
  let skippedMissingIcn = 0;
  let maxSeenIcn = "";
  let response = await client.search({
    index,
    scroll: "2m",
    size: scrollBatchSize,
    query: { match_all: {} },
    _source: [
      "icn",
      "property_data.uploadItemList.uri",
      "property_data.uploadItemList.name",
      "property_data.uploadItemList.deleted",
    ],
    sort: ["_doc"],
  });

  while (true) {
    const hits = response.hits?.hits || [];
    if (hits.length === 0) break;

    for (const hit of hits) {
      const icn = normalizeIcn(hit?._source?.icn);
      if (startAfterIcn) {
        if (!icn) {
          skippedMissingIcn += 1;
          continue;
        }
        if (compareIcn(icn, startAfterIcn) <= 0) {
          skippedBeforeCheckpoint += 1;
          continue;
        }
      }
      maxSeenIcn = maxIcn(maxSeenIcn, icn);
      const uploadList = hit?._source?.property_data?.uploadItemList || [];
      for (const item of uploadList) {
        if (item?.deleted === true) {
          continue;
        }
        if (item && typeof item.uri === "string" && item.uri.trim()) {
          const normalized = item.uri.trim();
          if (shouldSkipUri(normalized)) {
            continue;
          }
          uris.set(normalized, { sourceUri: normalized, icn });
          if (limitPerIndex > 0 && uris.size >= limitPerIndex) break;
        }
      }
      if (limitPerIndex > 0 && uris.size >= limitPerIndex) break;
    }

    if (limitPerIndex > 0 && uris.size >= limitPerIndex) break;
    if (!response._scroll_id) break;
    response = await client.scroll({ scroll_id: response._scroll_id, scroll: "2m" });
  }

  if (response._scroll_id) {
    await client.clearScroll({ scroll_id: response._scroll_id }).catch(() => {});
  }

  return {
    items: [...uris.values()],
    skippedBeforeCheckpoint,
    skippedMissingIcn,
    maxSeenIcn,
  };
}

async function ensureCdnContainerExists() {
  // Keep CDN available so UI can reflect hydrate progress in real time.
  await run("docker", ["compose", "up", "-d", "cdn"], { cwd: ROOT });

  const { stdout } = await runCapture("docker", ["ps", "--format", "{{.Names}}"]);
  const names = stdout.split("\n").map((v) => v.trim()).filter(Boolean);
  if (!names.includes(CDN_CONTAINER)) {
    throw new Error(`CDN container '${CDN_CONTAINER}' is not running. Start docker compose first.`);
  }
}

async function main() {
  const localNode = getArgValue("local-node", process.env.LOCAL_ELASTICSEARCH_NODE || "http://localhost:9200");
  const remotePrefix = normalizeRemotePrefix(
    getArgValue("remote-prefix", process.env.REMOTE_API_PREFIX || "https://dev-portal.sdnexus.app/api")
  );
  // max-files=0 means no cap (hydrate everything discovered in ES).
  const maxFiles = Number(getArgValue("max-files", "0"));
  const limitPerIndex = Number(getArgValue("limit-per-index", "0"));
  const scrollBatchSize = Math.max(
    100,
    Number(getArgValue("scroll-batch-size", "10000")) || 10000
  );
  const chunkSize = Math.max(1, Number(getArgValue("chunk-size", "10000")) || 10000);
  const concurrency = Math.max(1, Number(getArgValue("concurrency", "32")) || 32);
  const progressEvery = Math.max(
    1,
    Number(getArgValue("progress-every", "10000")) || 10000
  );
  const publishEveryItems = Math.max(
    1,
    Number(getArgValue("publish-every-items", "100")) || 100
  );
  const publishEveryChunks = Math.max(
    1,
    Number(getArgValue("publish-every-chunks", "1")) || 1
  );
  const remoteBearerArg = getArgValue("remote-bearer", process.env.REMOTE_AUTH_BEARER || "");
  const remoteUserScopeIdArg = getArgValue("remote-user-scope-id", process.env.REMOTE_USER_SCOPE_ID || "");
  const remoteAuthEmail = getArgValue("remote-auth-email", process.env.REMOTE_AUTH_EMAIL || "");
  const remoteAuthPassword = getArgValue("remote-auth-password", process.env.REMOTE_AUTH_PASSWORD || "");
  const manifestDir = path.join(ROOT, ".runtime", "manifests");
  const startAfterIcn = normalizeIcn(getArgValue("start-after-icn", ""));
  const checkpointManifest = getArgValue(
    "checkpoint-manifest",
    path.join(manifestDir, "cdn-hydration.json")
  );
  const dryRun = hasFlag("dry-run");
  let remoteBearer = remoteBearerArg;
  let remoteCookie = getArgValue("remote-cookie", process.env.REMOTE_AUTH_COOKIE || "");
  let remoteUserScopeId = remoteUserScopeIdArg;
  let tokenExpirationMs = null;

  const canAutoLogin = Boolean(remoteAuthEmail && remoteAuthPassword);
  let refreshInFlight = null;

  async function refreshAuth(force = false) {
    if (!canAutoLogin) return false;
    const bufferMs = 60_000;
    const shouldRefresh =
      force ||
      !remoteBearer ||
      (!remoteCookie && !remoteBearer) ||
      (tokenExpirationMs && Date.now() >= tokenExpirationMs - bufferMs);
    if (!shouldRefresh) return false;

    if (refreshInFlight) {
      await refreshInFlight;
      return true;
    }

    refreshInFlight = (async () => {
      console.log(`[cdn-hydrate] Refreshing auth as ${remoteAuthEmail}...`);
      const loginResult = await loginForRemoteAuth(
        remotePrefix,
        remoteAuthEmail,
        remoteAuthPassword
      );
      if (loginResult.token) {
        remoteBearer = loginResult.token;
      }
      if (loginResult.cookieHeader) {
        remoteCookie = loginResult.cookieHeader;
      }
      if (!remoteUserScopeId && loginResult.userScopeId) {
        remoteUserScopeId = loginResult.userScopeId;
      }
      tokenExpirationMs = loginResult.tokenExpirationMs || null;
      console.log("[cdn-hydrate] Auth refresh successful.");
    })();

    try {
      await refreshInFlight;
      return true;
    } finally {
      refreshInFlight = null;
    }
  }

  function getAuthHeaders() {
    const headers = [];
    if (remoteBearer) headers.push(`Authorization: Bearer ${remoteBearer}`);
    if (remoteCookie) headers.push(`Cookie: ${remoteCookie}`);
    if (remoteUserScopeId) headers.push(`user-scope-id: ${remoteUserScopeId}`);
    return headers;
  }

  if (!remoteBearer && remoteAuthEmail && remoteAuthPassword) {
    await refreshAuth(true);
  }
  const authHeaders = getAuthHeaders();

  console.log(`[cdn-hydrate] Local ES node: ${localNode}`);
  console.log(`[cdn-hydrate] Remote prefix: ${remotePrefix}`);
  console.log(`[cdn-hydrate] Max files: ${maxFiles}`);
  console.log(`[cdn-hydrate] Scroll batch size: ${scrollBatchSize}`);
  console.log(`[cdn-hydrate] Chunk size: ${chunkSize}`);
  console.log(`[cdn-hydrate] Concurrency: ${concurrency}`);
  console.log(`[cdn-hydrate] Progress interval: ${progressEvery}`);
  console.log(`[cdn-hydrate] Publish interval (items): ${publishEveryItems}`);
  console.log(`[cdn-hydrate] Publish interval (chunks): ${publishEveryChunks}`);
  console.log(`[cdn-hydrate] Auth headers: ${authHeaders.length > 0 ? "enabled" : "none"}`);
  console.log(`[cdn-hydrate] Start after ICN: ${startAfterIcn || "none"}`);
  console.log(`[cdn-hydrate] Checkpoint manifest: ${checkpointManifest}`);
  if (dryRun) {
    console.log("[cdn-hydrate] Dry run complete.");
    return;
  }

  await ensureCdnContainerExists();

  const client = new Client({ node: localNode });
  const allUris = new Map();
  let totalSkippedBeforeCheckpoint = 0;
  let totalSkippedMissingIcn = 0;
  let maxDiscoveredIcn = "";
  for (const index of APP_INDICES) {
    const result = await extractUris(
      client,
      index,
      limitPerIndex,
      scrollBatchSize,
      startAfterIcn
    );
    totalSkippedBeforeCheckpoint += result.skippedBeforeCheckpoint;
    totalSkippedMissingIcn += result.skippedMissingIcn;
    maxDiscoveredIcn = maxIcn(maxDiscoveredIcn, result.maxSeenIcn);
    result.items.forEach((item) => {
      const existing = allUris.get(item.sourceUri);
      if (!existing || compareIcn(item.icn, existing.icn) > 0) {
        allUris.set(item.sourceUri, item);
      }
    });
  }
  await client.close();

  const allUriList = [...allUris.values()];
  const uriList = maxFiles > 0 ? allUriList.slice(0, maxFiles) : allUriList;
  console.log(`[cdn-hydrate] Candidate URIs: ${uriList.length}`);
  if (startAfterIcn) {
    console.log(
      `[cdn-hydrate] Resume checkpoint=${startAfterIcn}, skipped-before-checkpoint=${totalSkippedBeforeCheckpoint}, skipped-missing-icn=${totalSkippedMissingIcn}`
    );
  }

  await fs.mkdir(manifestDir, { recursive: true });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "as-cdn-hydrate-"));
  const downloaded = [];
  const skipped = [];
  const processedIcns = new Set();
  let highestProcessedIcn = "";
  const totalChunks = Math.ceil(uriList.length / chunkSize) || 0;
  let processed = 0;
  let lastPublishedProcessed = -1;
  let publishInFlight = Promise.resolve();

  async function schedulePublish(force = false) {
    if (!force && processed - lastPublishedProcessed < publishEveryItems) {
      return publishInFlight;
    }
    if (processed === lastPublishedProcessed && !force) {
      return publishInFlight;
    }
    lastPublishedProcessed = processed;
    const publishAt = processed;
    publishInFlight = publishInFlight
      .then(async () => {
        const index = await publishImageIndex(tmpDir, downloaded);
        console.log(
          `[cdn-hydrate] Published image-index.json (${index.totalImages} images, processed=${publishAt}/${uriList.length})`
        );
      })
      .catch((error) => {
        console.warn(`[cdn-hydrate] Publish warning: ${error.message}`);
      });
    return publishInFlight;
  }

  // Ensure UI has an index immediately (avoid 404 until first batch completes).
  await schedulePublish(true);

  async function processSourceUri(item) {
    const sourceUri = item.sourceUri;
    const sourceIcn = normalizeIcn(item.icn);
    if (shouldSkipUri(sourceUri)) {
      skipped.push({ sourceUri, icn: sourceIcn || null, remoteUrl: null, reason: "blocked-uri-pattern" });
      return;
    }
    const candidateUrls = getCandidateRemoteUrls(sourceUri, remotePrefix).filter(
      (url) => !shouldSkipUri(url)
    );
    if (candidateUrls.length === 0) {
      skipped.push({ sourceUri, icn: sourceIcn || null, remoteUrl: null, reason: "blocked-uri-pattern" });
      return;
    }

    const rel = sourceUri.replace(/^https?:\/\/[^/]+/, "").replace(/^\/+/, "");
    const safeRel = rel.replace(/\.\./g, "").replace(/^api\//, "");
    const localFile = path.join(tmpDir, safeRel);
    await fs.mkdir(path.dirname(localFile), { recursive: true });

    try {
      await refreshAuth(false);
      let successfulRemoteUrl = null;
      let lastError = null;
      for (const remoteUrl of candidateUrls) {
        let hasRetriedWithRefresh = false;
        try {
          while (true) {
            const curlArgs = ["-fsSL", "--connect-timeout", "10", "--max-time", "45"];
            for (const header of getAuthHeaders()) {
              curlArgs.push("-H", header);
            }
            curlArgs.push(remoteUrl, "-o", localFile);
            try {
              await run("curl", curlArgs, { stdio: "ignore" });
              break;
            } catch (curlError) {
              if (!hasRetriedWithRefresh && canAutoLogin) {
                hasRetriedWithRefresh = true;
                await refreshAuth(true);
                continue;
              }
              throw curlError;
            }
          }
          const validImage = await looksLikeImageFile(localFile);
          if (!validImage) {
            lastError = new Error("Downloaded payload is not an image (likely HTML/auth response)");
            continue;
          }
          successfulRemoteUrl = remoteUrl;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!successfulRemoteUrl) {
        throw lastError || new Error("No candidate image URL succeeded");
      }

      await run("docker", ["exec", CDN_CONTAINER, "mkdir", "-p", path.posix.dirname(`/usr/share/nginx/html/${safeRel}`)]);
      await run("docker", ["cp", localFile, `${CDN_CONTAINER}:/usr/share/nginx/html/${safeRel}`]);
      downloaded.push({
        sourceUri,
        icn: sourceIcn || null,
        remoteUrl: successfulRemoteUrl,
        cdnPath: `/${safeRel}`,
      });
      if (sourceIcn) {
        processedIcns.add(sourceIcn);
        highestProcessedIcn = maxIcn(highestProcessedIcn, sourceIcn);
      }
    } catch (error) {
      skipped.push({
        sourceUri,
        icn: sourceIcn || null,
        remoteUrl: candidateUrls[0],
        reason: error.message,
      });
    }
  }

  for (let chunkStart = 0; chunkStart < uriList.length; chunkStart += chunkSize) {
    const chunkIndex = Math.floor(chunkStart / chunkSize) + 1;
    const chunk = uriList.slice(chunkStart, chunkStart + chunkSize);
    console.log(
      `[cdn-hydrate] Processing chunk ${chunkIndex}/${totalChunks} (${chunk.length} files)`
    );

    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, chunk.length) },
      () => (async () => {
        while (true) {
          const idx = cursor;
          cursor += 1;
          if (idx >= chunk.length) break;
          await processSourceUri(chunk[idx]);
          processed += 1;
          if (processed % progressEvery === 0 || processed === uriList.length) {
            console.log(
              `[cdn-hydrate] Progress ${processed}/${uriList.length} (downloaded=${downloaded.length}, skipped=${skipped.length})`
            );
          }
          if (processed % publishEveryItems === 0 || processed === uriList.length) {
            void schedulePublish(false);
          }
        }
      })()
    );
    await Promise.all(workers);

    if (chunkIndex % publishEveryChunks === 0 || chunkIndex === totalChunks) {
      await schedulePublish(true);
    }
  }
  await publishInFlight;

  const manifestPath = checkpointManifest;
  await writeJsonAtomic(manifestPath, {
    generatedAt: new Date().toISOString(),
    remotePrefix,
    startAfterIcn: startAfterIcn || null,
    lastSyncedPropertyIcn: highestProcessedIcn || null,
    discoveredMaxPropertyIcn: maxDiscoveredIcn || null,
    totalCandidates: uriList.length,
    totalProcessedProperties: processedIcns.size,
    skippedBeforeCheckpoint: totalSkippedBeforeCheckpoint,
    skippedMissingIcn: totalSkippedMissingIcn,
    downloadedCount: downloaded.length,
    skippedCount: skipped.length,
    downloaded,
    skipped,
  });
  const finalIndex = await publishImageIndex(tmpDir, downloaded);

  console.log(`[cdn-hydrate] Downloaded: ${downloaded.length}`);
  console.log(`[cdn-hydrate] Skipped: ${skipped.length}`);
  console.log(`[cdn-hydrate] Indexed images: ${finalIndex.totalImages}`);
  console.log(`[cdn-hydrate] Manifest: ${manifestPath}`);
  console.log("[cdn-hydrate] Image index: /image-index.json");
}

main().catch((error) => {
  console.error(`[cdn-hydrate] Failed: ${error.message}`);
  process.exit(1);
});
