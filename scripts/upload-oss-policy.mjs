import { createHmac } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(rootDir, '.env.oss.local');
const policyPath = path.join(rootDir, 'update-policy.json');
const objectKey = 'sparkle/releases/update-policy.json';

loadEnvFile(envPath);

const accessKeyId = requiredEnv('ALIYUN_AK_ID');
const accessKeySecret = requiredEnv('ALIYUN_AK_SECRET');
const bucket = requiredEnv('OSS_BUCKET_NAME');
const endpoint = normalizeEndpoint(requiredEnv('OSS_ENDPOINT'));
const cdnBaseUrl = normalizeCdnBaseUrl(requiredEnv('CDN_BASE_URL'));

if (!existsSync(policyPath)) {
  throw new Error(`Missing ${policyPath}. Create it from update-policy.example.json before uploading.`);
}

JSON.parse(readFileSync(policyPath, 'utf8'));

await uploadFile({ filePath: policyPath, objectKey });

console.log(`uploaded update-policy.json -> ${cdnBaseUrl}/${objectKey}`);

async function uploadFile({ filePath, objectKey }) {
  const stats = statSync(filePath);
  const resourcePath = `/${bucket}/${objectKey}`;
  const contentType = 'application/json';
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
