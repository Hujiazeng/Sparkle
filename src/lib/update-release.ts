import type { RuntimeArchitectureInfo } from './platform';

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface GenericUpdateFile {
  url: string;
  size?: number;
}

export interface GenericUpdateInfo {
  version?: string;
  path?: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseDate?: string;
  files?: GenericUpdateFile[];
}

export function isElectronUpdaterReleaseAsset(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized.endsWith('.blockmap') ||
    /^latest.*\.yml$/.test(normalized)
  );
}

export function parseGenericUpdateInfo(content: string): GenericUpdateInfo {
  const info: GenericUpdateInfo = {};
  const files: GenericUpdateFile[] = [];
  let inFiles = false;
  let currentFile: GenericUpdateFile | null = null;

  const commitFile = () => {
    if (currentFile?.url) files.push(currentFile);
    currentFile = null;
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line === 'files:') {
      inFiles = true;
      continue;
    }

    const fileUrlMatch = line.match(/^-\s+url:\s*(.+)$/);
    if (fileUrlMatch) {
      commitFile();
      currentFile = { url: unquoteYamlScalar(fileUrlMatch[1]) };
      inFiles = true;
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!keyValueMatch) continue;

    const [, key, rawValue] = keyValueMatch;
    const value = unquoteYamlScalar(rawValue);

    if (inFiles && currentFile && key === 'url') {
      currentFile.url = value;
    } else if (inFiles && currentFile && key === 'size') {
      currentFile.size = Number(value) || undefined;
    } else if (!inFiles && key === 'version') {
      info.version = value;
    } else if (!inFiles && key === 'path') {
      info.path = value;
    } else if (!inFiles && key === 'releaseName') {
      info.releaseName = value;
    } else if (!inFiles && key === 'releaseNotes') {
      info.releaseNotes = value;
    } else if (!inFiles && key === 'releaseDate') {
      info.releaseDate = value;
    }
  }

  commitFile();
  if (files.length > 0) info.files = files;
  return info;
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeArch(value: string | undefined): string {
  if (!value) return '';
  const normalized = value.toLowerCase();
  if (normalized === 'aarch64') return 'arm64';
  if (normalized === 'amd64' || normalized === 'x86_64') return 'x64';
  return normalized;
}

function scoreMacAsset(name: string, targetArch: string): number {
  if (!name.endsWith('.dmg') && !name.endsWith('.zip')) return -1;

  let score = name.endsWith('.dmg') ? 40 : 20;
  if (name.includes(`-${targetArch}.`)) score += 100;
  else if (name.includes(targetArch)) score += 50;

  if (targetArch === 'arm64' && name.includes('universal')) score += 80;
  return score;
}

function scoreWindowsAsset(name: string): number {
  return name.endsWith('.exe') ? 100 : -1;
}

function scoreLinuxAsset(name: string, targetArch: string): number {
  if (!name.endsWith('.appimage') && !name.endsWith('.deb') && !name.endsWith('.rpm')) {
    return -1;
  }

  let score = 0;
  if (name.endsWith('.appimage')) score += 40;
  else if (name.endsWith('.deb')) score += 30;
  else if (name.endsWith('.rpm')) score += 20;

  if (name.includes(targetArch)) score += 100;
  return score;
}

export function selectRecommendedReleaseAsset(
  assets: ReleaseAsset[],
  runtime: Pick<RuntimeArchitectureInfo, 'platform' | 'hostArch' | 'processArch'>,
): ReleaseAsset | null {
  const targetArch = normalizeArch(runtime.hostArch || runtime.processArch);
  const normalizedAssets = assets.filter(
    (asset) => typeof asset.name === 'string' && typeof asset.browser_download_url === 'string',
  );

  let best: ReleaseAsset | null = null;
  let bestScore = -1;

  for (const asset of normalizedAssets) {
    const name = asset.name.toLowerCase();
    let score = -1;

    if (runtime.platform === 'darwin') {
      score = scoreMacAsset(name, targetArch);
    } else if (runtime.platform === 'win32') {
      score = scoreWindowsAsset(name);
    } else if (runtime.platform === 'linux') {
      score = scoreLinuxAsset(name, targetArch);
    }

    if (score > bestScore) {
      best = asset;
      bestScore = score;
    }
  }

  return bestScore >= 0 ? best : null;
}
