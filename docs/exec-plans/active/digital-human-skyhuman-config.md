# Digital Human SkyHuman Config

> 创建时间：2026-05-20
> 最后更新：2026-05-20

## 状态

| Phase | 内容 | 状态 | 备注 |
|-------|------|------|------|
| Phase 0 | 梳理现有设置页、首次引导、数字人 UI 和 SkyHuman API | 🔄 进行中 | 仅移除产品入口，不物理删除 provider 底层代码 |
| Phase 1 | 增加 SkyHuman token 配置和验证接口 | 📋 待开始 | Base URL 写死为官方地址 |
| Phase 2 | 将设置页/首次引导从服务商配置改为数字人配置 | 📋 待开始 | 保持现有设置卡片视觉语言 |
| Phase 3 | 数字人页面接入配置检查、列表、创建、轮询 | 📋 待开始 | 保留素材库式卡片体验 |
| Phase 4 | 创作中心接入真实视频生成链路 | 🔄 进行中 | 先做无 DB 持久化 MVP：TTS/音频上传 -> 视频任务 -> 轮询 -> 临时 URL |
| Phase 5 | 类型检查、测试和 UI 验证 | 📋 待开始 | 记录已有测试残留风险 |

## 决策日志

- 2026-05-20: SkyHuman 属于批量视频业务能力，不再放入 `api_providers` 模型服务商体系；使用 SQLite `settings` 表保存 `skyhuman_api_token`。
- 2026-05-20: `https://skyhumanapi.pilihu.vip` 写死在服务端 SkyHuman client 中，不在 UI 暴露 Base URL 配置。
- 2026-05-20: 原服务商配置先从设置页和首次引导移除，不物理删除 provider API/DB 代码，降低对历史模型相关代码的破坏范围。
- 2026-05-20: 创作中心先接入真实 SkyHuman 视频任务，但暂不新增批次/任务数据库表；完成后展示临时视频 URL，后续再做本地自动转存。

## 详细设计

目标是把 Sparkle 当前产品入口收敛到批量视频生成场景：服务商配置不再出现在用户设置和首次引导中；数字人 API Token 作为业务配置独立管理；数字人页面在有 token 时自动同步 SkyHuman 数字人列表，没有 token 时引导用户进入设置。

实现拆分：

- 新增 SkyHuman client/helper，统一处理 Bearer token、统一响应格式、账号积分验证、头像列表、上传 URL、头像克隆任务查询。
- 新增 `/api/settings/digital-human` 保存和读取 token，读取时掩码；新增 `/api/settings/digital-human/verify` 调用积分接口测试连接。
- 设置页新增 `数字人` tab 和配置卡片，移除 `服务商` tab。
- 首次引导移除 ProviderCard，新增 DigitalHumanApiCard，引导用户保存/验证 SkyHuman token。
- 数字人页面调用 Next API 路由，不在浏览器直接拼接 SkyHuman token；创建时上传本地视频并创建克隆任务，轮询只针对克隆中任务，间隔 6 秒。
- 创作中心新增视频生成路由：文案任务先创建 TTS 音频并轮询，音频任务先上传音频文件；两者最终都调用 `video/create_by_audio` 并轮询 `video/task`。

验收标准：

- 设置页不再显示服务商配置入口。
- 首次引导不再要求配置模型服务商，而是配置数字人 API。
- 未配置 token 时，数字人页面有清晰的设置入口。
- 配置 token 后，数字人页面能同步列表、创建克隆任务、按状态显示卡片。
- `npm run typecheck` 通过；UI 尽量通过 dev server + CDP 验证。
