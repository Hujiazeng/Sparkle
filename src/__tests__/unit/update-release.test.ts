import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSemver,
  isElectronUpdaterReleaseAsset,
  parseGenericUpdateInfo,
  parseUpdatePolicy,
  selectRecommendedReleaseAsset,
  shouldForceUpdate,
  type ReleaseAsset,
} from '../../lib/update-release';

const assets: ReleaseAsset[] = [
  {
    name: 'Sparkle-0.38.5-arm64.dmg',
    browser_download_url: 'https://example.com/Sparkle-0.38.5-arm64.dmg',
  },
  {
    name: 'Sparkle-0.38.5-x64.dmg',
    browser_download_url: 'https://example.com/Sparkle-0.38.5-x64.dmg',
  },
  {
    name: 'Sparkle-0.38.5-arm64.zip',
    browser_download_url: 'https://example.com/Sparkle-0.38.5-arm64.zip',
  },
  {
    name: 'Sparkle-0.38.5-x64.zip',
    browser_download_url: 'https://example.com/Sparkle-0.38.5-x64.zip',
  },
  {
    name: 'Sparkle-0.38.5.exe',
    browser_download_url: 'https://example.com/Sparkle-0.38.5.exe',
  },
];

describe('selectRecommendedReleaseAsset', () => {
  it('prefers the arm64 dmg for Apple Silicon Macs', () => {
    const selected = selectRecommendedReleaseAsset(assets, {
      platform: 'darwin',
      processArch: 'x64',
      hostArch: 'arm64',
    });

    assert.equal(selected?.name, 'Sparkle-0.38.5-arm64.dmg');
  });

  it('prefers the x64 dmg for Intel Macs', () => {
    const selected = selectRecommendedReleaseAsset(assets, {
      platform: 'darwin',
      processArch: 'x64',
      hostArch: 'x64',
    });

    assert.equal(selected?.name, 'Sparkle-0.38.5-x64.dmg');
  });

  it('falls back to the windows installer on Windows', () => {
    const selected = selectRecommendedReleaseAsset(assets, {
      platform: 'win32',
      processArch: 'x64',
      hostArch: 'x64',
    });

    assert.equal(selected?.name, 'Sparkle-0.38.5.exe');
  });

  it('returns null when no matching asset exists', () => {
    const selected = selectRecommendedReleaseAsset([], {
      platform: 'darwin',
      processArch: 'arm64',
      hostArch: 'arm64',
    });

    assert.equal(selected, null);
  });
});

describe('isElectronUpdaterReleaseAsset', () => {
  it('recognizes electron-updater metadata files required in GitHub Releases', () => {
    assert.equal(isElectronUpdaterReleaseAsset('latest.yml'), true);
    assert.equal(isElectronUpdaterReleaseAsset('latest-mac.yml'), true);
    assert.equal(isElectronUpdaterReleaseAsset('Sparkle.Setup.0.54.0.exe.blockmap'), true);
    assert.equal(isElectronUpdaterReleaseAsset('Sparkle-0.54.0-arm64.dmg.blockmap'), true);
  });

  it('does not classify installers or checksums as updater metadata', () => {
    assert.equal(isElectronUpdaterReleaseAsset('Sparkle.Setup.0.54.0.exe'), false);
    assert.equal(isElectronUpdaterReleaseAsset('Sparkle-0.54.0-arm64.dmg'), false);
    assert.equal(isElectronUpdaterReleaseAsset('SHA256SUMS.txt'), false);
  });
});

describe('parseGenericUpdateInfo', () => {
  it('parses electron-updater latest.yml fields used by the OSS fallback route', () => {
    const info = parseGenericUpdateInfo(`
version: 0.55.0
files:
  - url: Sparkle.Setup.0.55.0.exe
    sha512: abc
    size: 12345
path: Sparkle.Setup.0.55.0.exe
releaseDate: '2026-05-20T10:00:00.000Z'
`);

    assert.equal(info.version, '0.55.0');
    assert.equal(info.path, 'Sparkle.Setup.0.55.0.exe');
    assert.equal(info.releaseDate, '2026-05-20T10:00:00.000Z');
    assert.equal(info.files?.[0]?.url, 'Sparkle.Setup.0.55.0.exe');
    assert.equal(info.files?.[0]?.size, 12345);
  });
});

describe('update policy', () => {
  it('parses force update policy JSON', () => {
    const policy = parseUpdatePolicy(JSON.stringify({
      force: true,
      minSupportedVersion: 'v0.54.0',
      message: 'Please update',
    }));

    assert.equal(policy?.force, true);
    assert.equal(policy?.minSupportedVersion, '0.54.0');
    assert.equal(policy?.message, 'Please update');
  });

  it('returns null for invalid policy JSON', () => {
    assert.equal(parseUpdatePolicy('{not json'), null);
  });

  it('forces update only below the minimum supported version', () => {
    const policy = { force: true, minSupportedVersion: '0.54.0' };

    assert.equal(shouldForceUpdate('0.53.0', policy), true);
    assert.equal(shouldForceUpdate('0.54.0', policy), false);
    assert.equal(shouldForceUpdate('0.55.0', policy), false);
    assert.equal(shouldForceUpdate('0.53.0', { force: false, minSupportedVersion: '0.54.0' }), false);
  });

  it('compares semver-like versions consistently', () => {
    assert.equal(compareSemver('0.54.0', '0.53.9') > 0, true);
    assert.equal(compareSemver('v0.54.0', '0.54.0'), 0);
    assert.equal(compareSemver('0.54.0', '0.55.0') < 0, true);
  });
});
