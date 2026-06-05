import { getShuanQConfig } from './config';
import { ShuanQClient, ShuanQError } from './client';
import { getMachineCode } from './machine-code';
import {
  getRuntimeState,
  persistAppInfoState,
  persistSession,
  restorePersistedState,
  toPublicStatus,
  updateRuntimeState,
} from './state';
import type {
  PublicShuanQStatus,
  ShuanQAppInfoResponse,
  ShuanQCardInfoResponse,
  ShuanQLoginResponse,
  ShuanQLoginSession,
  ShuanQUserInfoResponse,
  ShuanQVariableContent,
} from './types';

let bootstrapPromise: Promise<PublicShuanQStatus> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let timeoutTimes = 0;

function normalizeCloudApi(value: string): string {
  if (!value) return '';
  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
}

function getKeys() {
  const state = getRuntimeState();
  return {
    clientPublicKey: state.clientPublicKey,
    serverPrivateKey: state.serverPrivateKey,
  };
}

function createClient(mode: 1 | 2 = 2): ShuanQClient {
  return new ShuanQClient(getShuanQConfig(), mode === 2 ? getKeys() : {});
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

function parsePermissions(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return ['普通'];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed.length > 0 ? parsed : ['普通'];
    }
  } catch {
    // ignore
  }
  return ['普通'];
}

function buildSession(account: string, response: ShuanQLoginResponse): ShuanQLoginSession {
  const userInfo = response.data.userInfo;
  const permissions = parsePermissions(userInfo.private_data?.quanxian);
  return {
    authenticated: true,
    userId: String(response.user_id),
    account,
    userToken: response.user_token,
    expireTime: response.data.vipExpireTimeStr || '',
    permissions,
    score: Number(userInfo.point || 0),
    verifyMode: getRuntimeState().verifyMode,
    lastHeartbeatAt: new Date().toISOString(),
  };
}

export async function bootstrapShuanQAuth(maxAttempts = 3): Promise<PublicShuanQStatus> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    restorePersistedState();

    let lastMessage = '';
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      try {
        const client = createClient(1);
        const result = await client.request<ShuanQAppInfoResponse>('/api/app/get_app_info', {}, 1);
        const appInfo = result.data.info || {};
        const extend = appInfo.param_extend_config || {};
        const clientPublicKey = extend.cp || '';
        const serverPrivateKey = extend.sp || '';
        const verifyMode = Number(result.data.user_verify_mode ?? 1);
        updateRuntimeState({
          bootstrapped: true,
          appInfoUnavailable: false,
          message: '',
          appInfo,
          verifyMode,
          gonggao: extend.gonggao || '',
          clientPublicKey,
          serverPrivateKey,
          apiKey: extend.api_key || '',
          cloudApiUrl: normalizeCloudApi(extend.cloud_api || ''),
        });
        if (verifyMode !== 0 && (!clientPublicKey || !serverPrivateKey)) {
          updateRuntimeState({ message: '应用密钥配置不完整' });
        }
        persistAppInfoState();
        if (getRuntimeState().session?.authenticated) {
          startHeartbeat();
        }
        return toPublicStatus();
      } catch (error) {
        lastMessage = errorMessage(error);
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    updateRuntimeState({
      bootstrapped: false,
      appInfoUnavailable: true,
      message: `获取应用信息失败，已重试 ${Math.max(1, maxAttempts)} 次: ${lastMessage}`,
    });
    return toPublicStatus();
  })().finally(() => {
    bootstrapPromise = null;
  });
  return bootstrapPromise;
}

export async function getShuanQStatus(): Promise<PublicShuanQStatus> {
  const state = getRuntimeState();
  if (!state.bootstrapped && !state.appInfoUnavailable) {
    return bootstrapShuanQAuth();
  }
  return toPublicStatus();
}

export async function registerShuanQUser(account: string, password: string, nickname: string): Promise<{ ok: boolean; message: string }> {
  await bootstrapShuanQAuth();
  const client = createClient();
  const result = await client.request('/api/member_app/register', {
    account,
    password,
    nickname,
    machine_code: getMachineCode(),
  });
  return { ok: true, message: result.message || '注册成功' };
}

export async function loginShuanQUser(account: string, password: string): Promise<PublicShuanQStatus> {
  await bootstrapShuanQAuth();
  const state = getRuntimeState();
  if (state.verifyMode !== 0 && (!state.clientPublicKey || !state.serverPrivateKey)) {
    throw new ShuanQError(state.message || '应用密钥配置不完整');
  }
  const client = createClient();
  const result = await client.request<ShuanQLoginResponse>('/api/member_app/login', {
    account,
    password,
    machine_code: getMachineCode(),
  });
  const session = buildSession(account, result.data);
  persistSession(session);
  timeoutTimes = 0;
  startHeartbeat();
  updateRuntimeState({ message: '登录成功' });
  return toPublicStatus();
}

export async function useShuanQCard(account: string, card: string): Promise<{ ok: boolean; message: string }> {
  await bootstrapShuanQAuth();
  const client = createClient();
  const result = await client.request('/api/member_app/use_card', { account, card });
  return { ok: true, message: result.message || '卡密使用成功' };
}

export async function getShuanQCardInfo(card: string): Promise<{ ok: boolean; message: string; data: ShuanQCardInfoResponse }> {
  await bootstrapShuanQAuth();
  const client = createClient();
  const result = await client.request<ShuanQCardInfoResponse>('/api/member_app/get_card_info', { card });
  return { ok: true, message: result.message, data: result.data };
}

export async function reviseShuanQPrivateData(field: string, content: string): Promise<{ ok: boolean; message: string }> {
  await bootstrapShuanQAuth();
  const session = getRuntimeState().session;
  if (!session?.authenticated) throw new ShuanQError('未登录');
  const client = createClient();
  const result = await client.request('/api/member_app/revise_private_data', {
    user_id: session.userId,
    user_token: session.userToken,
    field,
    content,
  });
  return { ok: true, message: result.message || '修改成功' };
}

export async function getShuanQVariableInfo(variableName: string): Promise<{ ok: boolean; message: string; content: ShuanQVariableContent }> {
  await bootstrapShuanQAuth();
  const session = getRuntimeState().session;
  if (!session?.authenticated) throw new ShuanQError('未登录');
  const client = createClient();
  const result = await client.request<{ content: string }>('/api/app/get_variable_info', {
    user_id: session.userId,
    user_token: session.userToken,
    variable_name: variableName,
  });
  const raw = String(result.data.content || '');
  try {
    return { ok: true, message: result.message, content: { kind: 'json', value: JSON.parse(raw), raw } };
  } catch {
    return { ok: true, message: result.message, content: { kind: 'text', value: raw, raw } };
  }
}

export async function heartbeatShuanQOnce(): Promise<PublicShuanQStatus> {
  const session = getRuntimeState().session;
  if (!session?.authenticated) {
    throw new ShuanQError('未登录');
  }
  const client = createClient();
  const result = await client.request<ShuanQUserInfoResponse>('/api/member_app/get_user_info', {
    user_id: session.userId,
    user_token: session.userToken,
    machine_code: getMachineCode(),
    update_active: '1',
  });

  if (getRuntimeState().verifyMode === 1 && result.data.vipExpireTimeStr === '非会员') {
    clearShuanQSession('会员已过期');
    throw new ShuanQError('会员已过期');
  }

  timeoutTimes = 0;
  const nextSession: ShuanQLoginSession = {
    ...session,
    expireTime: result.data.vipExpireTimeStr || session.expireTime,
    score: Number(result.data.userInfo?.point ?? session.score),
    lastHeartbeatAt: new Date().toISOString(),
  };
  persistSession(nextSession);
  return toPublicStatus();
}

export function startHeartbeat(): void {
  if (heartbeatTimer) return;
  const seconds = Math.max(30, getShuanQConfig().heartbeatFrequencySeconds);
  heartbeatTimer = setInterval(() => {
    heartbeatShuanQOnce().catch(() => {
      timeoutTimes += 1;
      if (timeoutTimes >= 5) {
        clearShuanQSession('心跳验证失败');
      }
    });
  }, seconds * 1000);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function clearShuanQSession(message = ''): PublicShuanQStatus {
  stopHeartbeat();
  timeoutTimes = 0;
  persistSession(null);
  updateRuntimeState({ message });
  return toPublicStatus();
}
