# OSS Auto Update Release

Sparkle uses `electron-updater` with a generic provider. Release artifacts are built locally or by CI, uploaded to Aliyun OSS, and served through the CDN:

```text
https://cdn-oss.pilihu.vip/sparkle/releases/
```

The update feed is `latest.yml`. On Windows the minimum required files are:

- `latest.yml`
- `Sparkle.Setup.{version}.exe`
- `Sparkle.Setup.{version}.exe.blockmap`

## Code Paths

| Path | Purpose |
|------|---------|
| `electron-builder.yml` | `publish.provider: generic`, update base URL |
| `electron/updater.ts` | Native Electron updater IPC and startup check |
| `electron/preload.ts` | Exposes updater methods to renderer |
| `src/hooks/useUpdateChecker.ts` | Renderer update state, native first, browser fallback |
| `src/app/api/app/updates/route.ts` | Browser fallback, reads CDN `latest.yml` |
| `src/lib/update-release.ts` | Parses `latest.yml` for fallback API |
| `scripts/upload-oss-release.mjs` | Uploads release artifacts to OSS |
| `oss.env.example` | Non-secret template for local OSS config |

## Local OSS Config

Create `.env.oss.local` in the repo root. It is ignored by Git through `.env*`; never commit real access keys.

```env
ALIYUN_AK_ID=
ALIYUN_AK_SECRET=
OSS_ENDPOINT=https://oss-accelerate.aliyuncs.com
OSS_BUCKET_NAME=
CDN_BASE_URL=https://cdn-oss.pilihu.vip
```

The upload script stores objects under `sparkle/releases/`, so `CDN_BASE_URL` must serve that OSS bucket.

## Build And Upload

Before building, clean generated output:

```powershell
Remove-Item -Recurse -Force release, .next -ErrorAction SilentlyContinue
```

Build the app and package the installer:

```powershell
npm run electron:build
npx electron-builder --win nsis:x64 --config electron-builder.yml --publish never
```

If the environment cannot reach GitHub for NSIS downloads, reuse the local electron-builder cache:

```powershell
$env:ELECTRON_BUILDER_NSIS_DIR="$env:LOCALAPPDATA\electron-builder\Cache\nsis\nsis-3.0.4.1"
$env:ELECTRON_BUILDER_NSIS_RESOURCES_DIR="$env:LOCALAPPDATA\electron-builder\Cache\nsis\nsis-resources-3.4.1"
npx electron-builder --win nsis:x64 --config electron-builder.yml --publish never
```

Then upload:

```powershell
npm run release:upload:oss
```

The script uploads installer files, blockmaps, and `latest*.yml` from `release/`. It intentionally does not upload `builder-debug.yml`.

## Verification

Verify CDN reachability:

```powershell
Invoke-WebRequest https://cdn-oss.pilihu.vip/sparkle/releases/latest.yml -UseBasicParsing
Invoke-WebRequest https://cdn-oss.pilihu.vip/sparkle/releases/Sparkle.Setup.0.54.0.exe -Method Head -UseBasicParsing
Invoke-WebRequest https://cdn-oss.pilihu.vip/sparkle/releases/Sparkle.Setup.0.54.0.exe.blockmap -Method Head -UseBasicParsing
```

Verify that the updater would trigger by testing against a simulated lower installed version. The feed must contain a version greater than the simulated app version:

```powershell
$code = @'
const { NsisUpdater } = require('electron-updater');
const fs = require('fs');
const os = require('os');
const path = require('path');

class FetchExecutor {
  async request(options) {
    const protocol = options.protocol || 'https:';
    const host = options.hostname || options.host;
    const pathname = options.path || options.pathname || '/';
    const url = options.href || `${protocol}//${host}${pathname}`;
    const response = await fetch(url, { headers: options.headers || {} });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return response.text();
  }
}

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkle-updater-test-'));
const app = {
  version: '0.53.0',
  name: 'Sparkle',
  isPackaged: true,
  appUpdateConfigPath: path.join(userDataPath, 'app-update.yml'),
  userDataPath,
  baseCachePath: userDataPath,
  whenReady: async () => {},
  relaunch: () => {},
  quit: () => {},
  onQuit: () => {},
};

const updater = new NsisUpdater(null, app);
updater.httpExecutor = new FetchExecutor();
updater.autoDownload = false;
updater.setFeedURL({ provider: 'generic', url: 'https://cdn-oss.pilihu.vip/sparkle/releases/' });
updater.on('update-available', (info) => console.log('available', info.version, info.files?.[0]?.url));
updater.on('update-not-available', (info) => console.log('not-available', info.version));
updater.checkForUpdates().then((result) => console.log({ isUpdateAvailable: result?.isUpdateAvailable }));
'@
node -e $code
```

Expected result when CDN `latest.yml` is newer than `app.version`:

```text
available 0.54.0 Sparkle.Setup.0.54.0.exe
{ isUpdateAvailable: true }
```

For a full end-to-end installation test, install an older packaged Sparkle version, publish a higher version to OSS, start the old installed app, and use Settings -> Check for Updates. The native updater only runs when `app.isPackaged` is true; dev mode intentionally skips native update checks.

## Release Checklist

1. Update `package.json` version.
2. Run `npm install` if `package-lock.json` needs to sync.
3. Run `npm run test`.
4. Build the packaged app.
5. Confirm `release/latest.yml` points to the new installer and sha512.
6. Run `npm run release:upload:oss`.
7. Verify CDN `latest.yml`, installer, and blockmap return HTTP 200.
8. Run the simulated lower-version updater check.
9. Run `npm rebuild better-sqlite3` after packaging before local Node tests.
10. Commit source/script/doc changes only. Do not commit `.env.oss.local` or `release/`.

## Notes

- `electron-builder` writes `app-update.yml` into packaged resources based on `electron-builder.yml`.
- `electron/updater.ts` sets `autoDownload = false`, so the app first reports availability, then downloads only after the user chooses to install.
- Windows differential update uses the `.blockmap` when possible and falls back to the full installer if needed.
- If CDN caching delays `latest.yml`, verify OSS object freshness and CDN purge policy before declaring update checks broken.
