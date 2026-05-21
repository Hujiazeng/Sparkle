# 强制自动更新

> 创建时间：2026-05-21
> 最后更新：2026-05-21

## 状态

| Phase | 内容 | 状态 | 备注 |
|-------|------|------|------|
| Phase 0 | 现有更新链路确认 | ✅ 已完成 | `electron-updater` 读取 OSS `latest.yml`，前端已有更新弹窗 |
| Phase 1 | OSS 策略文件解析与 fallback API | ✅ 已完成 | 新增 `update-policy.json`，保留 `latest.yml` 给 electron-updater |
| Phase 2 | 前端强制更新状态与 UI 锁定 | ✅ 已完成 | 强制更新时不可关闭、不可稍后、阻止继续使用主界面 |
| Phase 3 | 测试、文档与验证 | ✅ 已完成 | 单测、smoke、dev UI CDP、语法与 diff 检查已完成 |

## 决策日志

- 2026-05-21: 使用独立 `update-policy.json` 承载强制更新策略，不把自定义字段塞进 electron-builder 生成的 `latest.yml`，避免构建覆盖和 provider 兼容风险。
- 2026-05-21: `latest.yml` 继续只负责原生 updater 的版本、安装包、sha512、blockmap；应用层用策略文件决定是否必须更新。
- 2026-05-21: 强制更新仅在 `currentVersion < minSupportedVersion` 且 `force: true` 时生效；普通新版本仍允许用户稍后处理。
- 2026-05-21: `update-policy.json` 使用独立上传命令发布，避免普通安装包上传时误覆盖生产策略。

## 详细设计

### 目标

让 Sparkle 可以通过 OSS/CDN 上的策略文件远程要求旧客户端必须更新。强制更新时用户不能关闭更新弹窗，不能点击“稍后”，也不能继续使用主界面；原生 Electron 环境优先走 `electron-updater` 下载和重启安装，浏览器 fallback 则提供下载安装包入口。

### 策略文件

URL:

```text
https://cdn-oss.pilihu.vip/sparkle/releases/update-policy.json
```

格式:

```json
{
  "force": true,
  "minSupportedVersion": "0.54.0",
  "message": "此版本包含重要修复，请更新后继续使用。"
}
```

字段含义：

- `force`: 是否启用强制更新策略。
- `minSupportedVersion`: 低于该版本的客户端必须更新。
- `message`: 可选，显示在强制更新弹窗中。

### 数据流

1. `/api/app/updates` 拉取 `latest.yml` 和 `update-policy.json`。
2. API 返回普通更新字段，同时附带 `forceUpdate`、`minSupportedVersion`、`policyMessage`。
3. 原生 updater 事件只提供 `latest.yml` 信息，前端在收到 `available` 时额外调用 fallback API 补齐策略字段。
4. `useUpdateChecker` 根据策略字段控制 `showDialog` 和 dismiss 行为。
5. `UpdateDialog` 在强制模式下隐藏关闭按钮和“稍后”，拦截 Escape / outside click。
6. `AppShell` 在强制模式下展示全屏遮罩，防止用户绕过弹窗继续操作。

### 验收标准

- ✅ 无 `update-policy.json` 或策略拉取失败时，保持普通更新行为。
- ✅ `force: false` 时，普通更新可关闭。
- ✅ `force: true` 且当前版本低于 `minSupportedVersion` 时，弹窗不可关闭，主界面不可操作。
- ✅ native 模式可点击下载安装，下载后只允许重启更新。
- ✅ browser fallback 模式提供下载安装包入口。
- ✅ 单测覆盖策略解析和 semver 判断。

## 验证记录

- 2026-05-21: `npm run test` 通过，1149 tests / 272 suites。
- 2026-05-21: `npm run test:smoke` 通过，6 tests。由于本机 Playwright 内置 Chromium 缺失，使用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指向系统 Chrome。
- 2026-05-21: CDP mock `/api/app/updates` 返回 `forceUpdate: true`，验证强制更新弹窗出现、Escape 不关闭、无“稍后”按钮、console 无 error/warn。
