import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import envvars from '@/config/envvars';
import { AppError } from '@/utils/response/appError';
import { ensureDirExists, writeFile } from '@/utils/storage/fileSystem';

const execFileAsync = promisify(execFile);

const CDN_CONTAINER = envvars.cdn.dockerContainer;
const CDN_ROOT = '/usr/share/nginx/html';

function sanitizeRelativePath(relativePath: string): string {
  return relativePath.replace(/^\/+/, '').replace(/\.\./g, '');
}

async function uploadViaDocker(relativePath: string, buffer: Buffer): Promise<void> {
  const safeRel = sanitizeRelativePath(relativePath);
  const fullCdnPath = `${CDN_ROOT}/${safeRel}`;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'as-cdn-upload-'));
  const tmpFile = path.join(tmpDir, path.basename(safeRel));

  try {
    await fs.writeFile(tmpFile, buffer);
    await execFileAsync('docker', ['exec', CDN_CONTAINER, 'mkdir', '-p', path.posix.dirname(fullCdnPath)]);
    await execFileAsync('docker', ['cp', tmpFile, `${CDN_CONTAINER}:${fullCdnPath}`]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(
      503,
      `Failed to upload file to CDN (${CDN_CONTAINER}). Ensure the CDN container is running. ${message}`,
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function uploadViaFilesystem(relativePath: string, buffer: Buffer): Promise<void> {
  const safeRel = sanitizeRelativePath(relativePath);
  const root = envvars.cdn.filesystemRoot.replace(/\/+$/, '');
  const targetPath = path.join(root, safeRel);
  await ensureDirExists(path.dirname(targetPath));
  await writeFile(targetPath, buffer);
}

/**
 * Uploads a binary asset to the CDN and returns its public URL.
 */
export async function uploadToCdn(relativePath: string, buffer: Buffer): Promise<string> {
  if (!relativePath?.trim()) {
    throw new AppError(400, 'CDN path is required');
  }

  if (envvars.cdn.filesystemRoot) {
    await uploadViaFilesystem(relativePath, buffer);
  } else {
    await uploadViaDocker(relativePath, buffer);
  }

  const baseUrl = envvars.cdn.baseUrl.replace(/\/+$/, '');
  return `${baseUrl}/${sanitizeRelativePath(relativePath)}`;
}
