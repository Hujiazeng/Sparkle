import { createHmac } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release');
const envPath = path.join(rootDir, '.env.oss.local');
const ossPrefix = 'sparkle/releases/';

loadEnvFile(envPath);

const accessKeyId = requiredEnv('ALIYUN_AK_ID');
const accessKeySecret = requiredEnv('ALIYUN_AK_SECRET');
const bucket = requiredEnv('OSS_BUCKET_NAME');
const endpoint = normalizeEndpoint(requiredEnv('OSS_ENDPOINT'));
const cdnBaseUrl = normalizeCdnBaseUrl(requiredEnv('CDN_BASE_URL'));

const uploadNames = findReleaseFiles(releaseDir);

for (const name of uploadNames) {
  const filePath = path.join(releaseDir, name);
  const objectKey = `${ossPrefix}${name}`;
  await uploadFile({ filePath, objectKey });
  console.log(`uploaded ${name} -> ${cdnBaseUrl}/${objectKey}`);
}

console.log(`\nUpdate feed: ${cdnBaseUrl}/${ossPrefix}latest.yml`);

function findReleaseFiles(dir) {
  if (!existsSync(dir)) {
    throw new Error(`Release directory not found: ${dir}`);
  }

  const names = readdirSync(dir)
    .filter((name) => {
      const fullPath = path.join(dir, name);
      if (!statSync(fullPath).isFile()) return false;
      return (
        name.endsWith('.exe') ||
        name.endsWith('.dmg') ||
        name.endsWith('.zip') ||
        name.endsWith('.AppImage') ||
        name.endsWith('.deb') ||
        name.endsWith('.rpm') ||
        name.endsWith('.blockmap') ||
        /^latest.*\.yml$/i.test(name)
      );
    })
    .sort();

  if (!names.some((name) => /^latest.*\.yml$/i.test(name))) {
    throw new Error('No latest*.yml updater metadata found in release/. Build the installer before uploading.');
  }

  return names;
}

async function uploadFile({ filePath, objectKey }) {
  const stats = statSync(filePath);
  const resourcePath = `/${bucket}/${objectKey}`;
  const contentType = getContentType(filePath);
  const date = new Date().toUTCString();
  const headers = {
    'Content-Length': String(stats.size),
    'Content-Type': contentType,
    Date: date,
    Host: `${bucket}.${endpoint.host}`,
  };

  const signature = signOssRequest({
    method: 'PUT',
    contentType,
    date,
    resourcePath,
  });

  const url = new URL(`https://${bucket}.${endpoint.host}/${objectKey}`);
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      Authorization: `OSS ${accessKeyId}:${signature}`,
    },
    body: createReadStream(filePath),
    duplex: 'half',
  });

  if (!response.ok) {
    throw new Error(`Upload failed for ${objectKey}: HTTP ${response.status} ${await response.text()}`);
  }
}

function signOssRequest({ method, contentType, date, resourcePath }) {
  const canonicalString = [
    method,
    '',
    contentType,
    date,
    resourcePath,
  ].join('\n');

  return createHmac('sha1', accessKeySecret).update(canonicalString).digest('base64');
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${filePath}. Create it from oss.env.example and fill in OSS credentials.`);
  }

  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function normalizeEndpoint(value) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(withProtocol);
}

function normalizeCdnBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function getContentType(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'application/x-yaml';
  if (name.endsWith('.blockmap')) return 'application/octet-stream';
  if (name.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
  if (name.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (name.endsWith('.zip')) return 'application/zip';
  if (name.endsWith('.deb')) return 'application/vnd.debian.binary-package';
  if (name.endsWith('.rpm')) return 'application/x-rpm';
  return 'application/octet-stream';
}
