# 栓Q验证 TypeScript 迁移

> 创建时间：2026-06-05
> 最后更新：2026-06-05

## 状态

| Phase | 内容 | 状态 | 备注 |
|-------|------|------|------|
| Phase 0 | 参考实现梳理与执行计划 | ✅ 已完成 | 已确认迁移范围：完整登录、注册、卡密、心跳 |
| Phase 1 | TypeScript 协议层与机器码 | ✅ 已完成 | AES/RSA/MD5/安全码/签名 |
| Phase 2 | Auth 服务、持久化状态、心跳 | ✅ 已完成 | 服务端内存状态 + SQLite settings 恢复 |
| Phase 3 | Next API 路由 | ✅ 已完成 | status/login/register/use-card/card-info/private-data/variable/heartbeat/logout |
| Phase 4 | 前端验证 Gate | ✅ 已完成 | 未验证阻断主界面，登录/注册/卡密 UI |
| Phase 5 | 测试与 CDP 验证 | ✅ 已完成 | `npm run test` 通过；CDP 截图与 console 验证通过 |

## 决策日志

- 2026-06-05: 不调用 Python 子进程，不复制 Python 运行链路；以 `other_app/app` 为协议参考，改为当前项目的 TypeScript 服务端实现。
- 2026-06-05: `get_variable_info` 迁移时禁止执行远端代码。Python 版使用 `exec(responseDataJson['content'], env)`，TypeScript 版只返回文本，并在内容是 JSON 时解析 JSON。
- 2026-06-05: 栓Q AppKey/AesKey 放在服务端 TypeScript 模块中，避免进入浏览器 bundle；但桌面客户端密钥仍会随安装包分发，不能视为服务端级保密。
- 2026-06-05: 前端只拿到必要展示状态，不暴露 `user_token`。
- 2026-06-05: CDP 验证使用现有 `http://127.0.0.1:3000` dev server；尝试 3001 时发现同目录已有 dev server 进程占用 Next 开发锁。

## 详细设计

### 目标

把 `other_app/app` 的栓Q验证体系完整迁移到当前 Electron + Next.js 项目中，支持应用信息初始化、注册、登录、卡密、登录态、心跳、权限/积分/到期时间同步，并在未验证或心跳失效时阻断主界面使用。

### 参考 Python 能力映射

| Python 文件/函数 | TypeScript 目标 |
|------------------|-----------------|
| `auth/ShuanQClass.py` | `src/lib/shuanq/client.ts` |
| `common/machine_code.py` | `src/lib/shuanq/machine-code.ts` |
| `common/global_params.py` | `src/lib/shuanq/state.ts` |
| `common/auth_bootstrap.py` | `src/lib/shuanq/service.ts bootstrapShuanQAuth()` |
| `auth/user_auth.py userRegister/userLogin/useCard/heartbeat/getAppInfo/getUpdateInfo/...` | `src/lib/shuanq/service.ts` |
| `common/license_service.py` | API route handlers |
| `view/register_window.py` | `src/components/auth/ShuanQAuthGate.tsx` |

### 技术方案

- 协议层使用 Node `crypto` 实现 MD5、AES-ECB、RSA PKCS#1 v1.5；使用内置 `fetch` 调用栓Q接口。
- 服务端状态保存在模块级内存中，必要字段同步到 SQLite `settings` 表，刷新页面后可恢复登录态并继续心跳验证。
- 心跳由服务端 service 单例维护，登录成功后启动，登出或失效后停止。心跳失败按 Python 逻辑累计超时，业务错误或过期立即失效。
- 前端 `AppShell` 外层增加 `ShuanQAuthGate`，对主界面进行阻断。Gate 通过 `/api/auth/shuanq/status` 获取状态，支持登录、注册、卡密、重试。
- 所有 UI 文案进入 `src/i18n/en.ts` 和 `src/i18n/zh.ts`。

### API 设计

| Route | Method | 行为 |
|-------|--------|------|
| `/api/auth/shuanq/status` | GET | 初始化应用信息、恢复状态、返回是否已验证 |
| `/api/auth/shuanq/login` | POST | 账号密码登录，启动心跳 |
| `/api/auth/shuanq/register` | POST | 注册账号 |
| `/api/auth/shuanq/use-card` | POST | 对账号使用卡密 |
| `/api/auth/shuanq/logout` | POST | 清理本地登录态并停止心跳 |

### 验收标准

- `npm run test` 通过。
- UI 改动后 `npm run dev` 启动，使用 chrome-devtools MCP 打开 `http://localhost:3000` 截图验证登录 gate 渲染正常，并确认 console 无新报错。
- 不存在浏览器 bundle 直接导入 `src/lib/shuanq/client.ts` 的路径。
- API 不返回 `user_token`、RSA 私钥或 AppKey/AesKey。
- 心跳失败后 `status` 返回未验证，前端回到验证界面。
