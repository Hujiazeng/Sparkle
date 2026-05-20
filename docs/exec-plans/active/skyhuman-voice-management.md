# SkyHuman 音色管理

> 创建时间：2026-05-20
> 最后更新：2026-05-20

## 状态

| Phase | 内容 | 状态 | 备注 |
|-------|------|------|------|
| Phase 0 | 梳理 `skyhuman_api.py` 音色接口、数字人页面和侧边栏入口 | ✅ 已完成 | 已确认 `voice/list`, `voice/create`, `voice/task`, `voice/edit`, `audio/create_by_tts`, `audio/task` |
| Phase 1 | 新增服务端 SkyHuman 音色路由与音频试听路由 | ✅ 已完成 | 复用数字人同一 token |
| Phase 2 | 新增音色管理页面、卡片、详情、试听和创建任务 | ✅ 已完成 | 卡片支持参数展示与试听播放 |
| Phase 3 | 补侧边栏入口、i18n 和文档索引 | ✅ 已完成 | Desktop rail 和展开侧栏都已接入 |
| Phase 4 | typecheck / UI 验证 / 修复残余问题 | ✅ 已完成 | `npm run typecheck` 通过；CDP 已验证 `/voices` 首屏和详情弹窗 |

## 决策日志

- 2026-05-20: 音色管理与数字人共享同一 SkyHuman API Token，不新增独立配置项。
- 2026-05-20: 音色页面以“卡片 + 详情抽屉 + 试听”呈现，和数字人管理页保持同一操作节奏，降低学习成本。
- 2026-05-20: 试听流程通过服务端 `/api/voices/tts` 提交并轮询结果，避免前端直连 SkyHuman token。

## 详细设计

音色页面采用双层结构：

- 顶部统计条展示我的音色、公共音色、可试听和创建中数量。
- 主区使用两列卡片网格，每张卡片展示名称、音色标识、语速/音量/语调、语种和状态。
- 详情弹窗提供更完整参数、试听文本编辑、原始试听链接和本地移除操作。
- 创建音色支持上传参考音频，提交后轮询任务状态，完成后刷新列表。

接口层复用 `src/lib/skyhuman.ts`，通过 Next.js route 对外暴露：

- `GET /api/voices`
- `POST /api/voices`
- `GET /api/voices/task`
- `POST /api/voices/edit`
- `POST /api/voices/tts`
- `GET /api/voices/tts`

验收标准：

- 音色页可从侧边栏进入。
- 能看到真实音色列表并按卡片浏览。
- 能对单个音色发起试听并播放结果。
- 能上传参考音频并提交创建音色任务。
- `npm run typecheck` 通过，UI 在 dev server 中可正常渲染。
