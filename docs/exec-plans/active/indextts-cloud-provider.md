# IndexTTS 云端 Provider 接入

> 创建时间：2026-06-05
> 最后更新：2026-06-05

## 状态

| Phase | 内容 | 状态 | 备注 |
|-------|------|------|------|
| Phase 0 | 梳理 `backend` 与 `other_app/front` 的 IndexTTS 调用方式 | ✅ 已完成 | 确认云端后端接口为 `/api/voice/*`，使用应用级共享 token |
| Phase 1 | 新增 IndexTTS 云端 client 与配置解析 | ✅ 已完成 | 从双Q应用扩展配置读取 backend URL/token/app_id |
| Phase 2 | 改造本地语音 API 代理 | ✅ 已完成 | SkyHuman 保留，IndexTTS 走云端 `zhinengti.pilihu.vip` |
| Phase 3 | 更新音色管理与数字人工作台 provider 选择 | ✅ 已完成 | 音色管理选择默认 TTS provider，工作台按默认 provider 合成 |
| Phase 4 | 测试与 UI 验证 | 🔄 进行中 | `npm run test`，UI 改动用 CDP 验证 |

## 决策日志

- 2026-06-05: 不在 Sparkle 本地实现 OSS 上传或 Gitee IndexTTS 调用，直接复用已部署云端 backend 的 `/api/voice/*`。
- 2026-06-05: IndexTTS 鉴权采用应用级共享 token，由双Q应用信息扩展配置下发，不使用当前 Sparkle 用户登录 token，也不要求用户手填 IndexTTS Key。
- 2026-06-05: SkyHuman 音色与 TTS 链路保留为独立 provider，IndexTTS 作为新增 provider，可在音色管理中切换默认语音服务。

## 详细设计

目标是在 Sparkle 中新增 `indextts` 语音合成 provider，调用模型参考 `other_app/front/src/api/voice.js`：

- `GET {baseUrl}/api/voice/custom-voices`
- `POST {baseUrl}/api/voice/synthesize`
- `POST {baseUrl}/api/voice/clone/upload`
- `DELETE {baseUrl}/api/voice/clone/{id}`

配置来源为双Q应用信息 `param_extend_config`，建议字段：

- `indextts_backend_url`：默认 `https://zhinengti.pilihu.vip`
- `indextts_backend_token`：应用级共享 Bearer token
- `indextts_backend_app_id`：云端 backend 需要的 `X-App-Id`

Sparkle 本地 API 层负责 provider 分流。UI 层继续优先调用本地 Next routes，避免组件直接散落云端鉴权细节。SkyHuman 保持当前实现；IndexTTS 上传参考音频时将 `FormData` 转发给云端 backend，由云端完成 OSS 上传、音色入库和合成。

验收标准：

- 音色管理能切换默认 provider：SkyHuman / IndexTTS。
- IndexTTS provider 下能获取云端自定义音色、上传新音色、删除音色、生成试听。
- 数字人工作台脚本生成音频时按默认 provider 合成；视频生成仍复用 SkyHuman `create_by_audio`。
- 不新增 OSS 密钥或 IndexTTS Key 本地输入。
- `npm run test` 通过；涉及 UI 的页面通过 CDP 检查无 console 报错。
