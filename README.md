# Sparkle

Sparkle 是一个面向数字人内容生产的桌面创作中心。当前主入口已经收敛到「创作中心」：连接 SkyHuman / 飞天数字人 API 后，可以管理数字人形象和音色资产，并把文案或本地音频批量生成数字人视频。

项目基于 Electron + Next.js，数据保存在本机 SQLite 中，适合本地运行、调试和继续扩展数字人视频生产流程。

## 当前重点

- 创作中心：按批次维护口播任务，支持文案任务和音频任务两种输入。
- 数字人形象库：同步 SkyHuman 形象，上传视频创建克隆任务，轮询任务状态，支持详情查看和删除。
- 音色库：同步个人/公共音色，上传音频创建音色克隆任务，支持试听、编辑参数和任务轮询。
- 批量生成：为每条任务选择数字人形象、音色、输出目录和并发数量，一键处理当前批次。
- 本地落盘：生成完成的视频会下载到本地输出目录，工作台状态会持久化到本机。

## 创作中心功能

创作中心页面位于 `src/app/creation-center/page.tsx`，实际工作台组件为 `src/components/digital-human/DigitalHumanWorkbench.tsx`。

### 任务输入

每条任务属于一个批次，支持两种来源：

| 来源 | 流程 |
| --- | --- |
| 文案 | 文案 -> SkyHuman TTS 音频任务 -> 音频完成后创建数字人视频任务 |
| 音频 | 上传或选择本地音频 -> 上传到 SkyHuman -> 创建数字人视频任务 |

任务行可以设置：

- 数字人形象
- 音色
- 文案内容或音频文件
- 任务状态筛选
- 搜索关键词

### 批次与队列

- 批次名按日期和序号生成，例如 `2026052002`。
- 支持新建批次、给批次追加任务、删除任务、失败后重试。
- 支持按状态查看草稿、排队中、生成语音、生成视频、已完成和失败任务。
- 支持分页和页码跳转，默认每页 10 条任务。
- 支持配置并发数量，默认并发为 3，最多限制到 10。

### 生成状态

工作台会把任务推进为以下状态：

| 状态 | 含义 |
| --- | --- |
| 草稿 | 任务尚未提交 |
| 排队中 | 已加入当前批次生成队列 |
| 生成语音 | 文案任务正在等待 TTS 音频 |
| 生成视频 | 正在等待数字人视频任务完成 |
| 已完成 | 视频已生成并下载到本地 |
| 失败 | SkyHuman 调用、轮询或下载过程中出现错误 |

### 输出目录

默认输出目录为仓库下的 `results/`。在 Electron 环境中可以通过文件夹选择器改为其他目录。

生成完成后，视频会按批次保存为类似结构：

```text
results/
  2026-05-20/
    2026052002/
      001.mp4
      002.mp4
```

相关接口：

- `POST /api/digital-human/videos`：提交文案或音频任务。
- `GET /api/digital-human/videos?kind=audio|video&taskId=...`：轮询音频或视频任务。
- `PUT /api/digital-human/videos`：用已生成音频 URL 创建视频任务。
- `POST /api/digital-human/videos/download`：下载生成视频到本地。
- `GET /api/digital-human/output-root`：初始化和返回默认输出目录。
- `GET/PUT /api/digital-human/workbench-state`：读取和保存工作台状态。

## 资产管理

### SkyHuman API 配置

设置页的 `APIKEY` 区域用于保存 SkyHuman API Token。Token 存在本地 SQLite 的 `settings` 表中，读取时会做掩码展示。

相关接口：

- `GET /api/settings/digital-human`
- `PUT /api/settings/digital-human`
- `POST /api/settings/digital-human/verify`

验证接口会调用 SkyHuman 积分接口，用于确认 Token 是否可用。

### 数字人形象

数字人页面位于 `/digital-human`，组件为 `src/components/digital-human/DigitalHumanLibrary.tsx`。

已接入能力：

- 同步 SkyHuman 数字人列表。
- 仅看收藏、按状态筛选、按日期筛选和排序。
- 上传视频创建数字人克隆任务。
- 每 6 秒轮询克隆任务状态。
- 删除已同步的数字人形象。
- 将可用形象同步给创作中心下拉选择。

### 音色

音色页面位于 `/voices`，组件为 `src/components/voices/VoiceLibrary.tsx`。

已接入能力：

- 同步个人音色和公共音色。
- 上传音频创建音色克隆任务。
- 每 6 秒轮询音色任务状态。
- 使用 TTS 文本试听音色。
- 编辑音色标题、语速、音量和音高。
- 将可用音色同步给创作中心下拉选择。

## 媒体与图库

项目仍保留媒体管线和 Gallery。AI 生成图片、MCP/CLI 导入媒体、视频和音频素材会进入本地媒体库，Gallery 支持查看、收藏、筛选和删除。

更多细节见：

- `docs/handover/media-pipeline.md`
- `src/lib/media-saver.ts`
- `src/app/api/media/gallery/route.ts`

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面外壳 | Electron 40 |
| 前端 | Next.js 16 App Router, React 19 |
| 样式 | Tailwind CSS 4, Radix UI |
| 本地数据库 | better-sqlite3 |
| 数字人服务 | SkyHuman / 飞天数字人 API |
| AI / Agent 能力 | Claude Agent SDK, AI SDK providers, MCP, Skills |
| 测试 | TypeScript, node:test, Playwright |
| 打包 | electron-builder |

## 本地开发

### 环境要求

- Node.js 18+
- npm 9+

### 安装依赖

```bash
npm install
```

### 启动 Web 开发环境

```bash
npm run dev
```

默认地址为 `http://localhost:3000`，根路径会跳转到 `/creation-center`。

### 启动 Electron 开发环境

```bash
npm run electron:dev
```

需要验证本地文件路径、选择输出目录、打开输出文件夹等桌面能力时，应使用 Electron 开发环境。

## 配置流程

1. 启动应用。
2. 打开设置页的 `APIKEY` 区域。
3. 填写 SkyHuman API Token 并点击验证。
4. 打开 `/digital-human`，确认数字人形象已同步，或上传视频创建形象。
5. 打开 `/voices`，确认音色已同步，或上传音频创建音色。
6. 回到 `/creation-center`，选择批次、形象、音色和输出目录。
7. 添加文案或音频任务，点击批量生成。

## 常用命令

```bash
npm run test          # typecheck + 单元测试
npm run test:smoke    # Playwright 冒烟测试，需要 dev server
npm run test:e2e      # 完整 E2E 测试，需要 dev server
npm run build         # Next.js 构建
npm run electron:pack # Electron 打包
```

## 关键目录

```text
src/app/creation-center/          # 创作中心页面
src/components/digital-human/     # 创作中心和数字人形象库
src/components/voices/            # 音色库
src/app/api/digital-human/        # 数字人形象、视频、输出目录接口
src/app/api/voices/               # 音色和试听接口
src/app/api/settings/digital-human/ # SkyHuman Token 配置接口
src/lib/skyhuman.ts               # SkyHuman API client
src/lib/digital-human-assets-cache.ts # 创作中心可用资产缓存
src/lib/db.ts                     # SQLite schema 和设置持久化
docs/handover/                    # 交接文档
docs/exec-plans/                  # 执行计划
docs/research/                    # 调研文档
```

## 开发注意事项

- UI 改动必须启动开发环境，并通过 chrome-devtools MCP 实际截图和检查 console。
- 提交前至少运行 `npm run test`。
- 涉及构建或打包的改动需要完整执行对应打包流程。
- 涉及新增数据库字段时，需要同步更新 `src/lib/db.ts` 的 schema 和迁移逻辑。
- 涉及类型变更时，需要同步更新 `src/types/index.ts`。
- 涉及用户可见文案或页面结构时，检查是否需要同步 i18n。
- Worktree 任务只能在当前 Worktree 内修改和启动服务。

## 文档索引

- `ARCHITECTURE.md`：项目架构、目录结构和数据流。
- `docs/handover/media-pipeline.md`：媒体保存、内联渲染、Gallery 和 MCP 媒体工具。
- `docs/exec-plans/active/digital-human-skyhuman-config.md`：SkyHuman 配置和数字人链路执行计划。
- `docs/exec-plans/README.md`：执行计划索引。
- `docs/research/README.md`：调研文档索引。

## License

本项目使用 `BUSL-1.1` 许可证，详见 `LICENSE`。
