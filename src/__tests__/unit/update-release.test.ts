import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isElectronUpdaterReleaseAsset,
  selectRecommendedReleaseAsset,
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
