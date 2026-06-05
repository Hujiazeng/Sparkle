import { getSetting, setSetting } from '@/lib/db';
import { SHUANQ_SETTINGS_KEYS } from './config';
import type { PublicShuanQStatus, ShuanQAppInfo, ShuanQLoginSession } from './types';

export interface ShuanQRuntimeState {
  bootstrapped: boolean;
  appInfoUnavailable: boolean;
  message: string;
  verifyMode: number;
  appInfo: ShuanQAppInfo | null;
  gonggao: string;
  clientPublicKey: string;
  serverPrivateKey: string;
  apiKey: string;
  cloudApiUrl: string;
  session: ShuanQLoginSession | null;
}

export const defaultShuanQState: ShuanQRuntimeState = {
  bootstrapped: false,
  appInfoUnavailable: false,
  message: '',
  verifyMode: 1,
  appInfo: null,
  gonggao: '',
  clientPublicKey: '',
  serverPrivateKey: '',
  apiKey: '',
  cloudApiUrl: '',
  session: null,
};

let runtimeState: ShuanQRuntimeState = { ...defaultShuanQState };

export function getRuntimeState(): ShuanQRuntimeState {
  return runtimeState;
}

export function updateRuntimeState(patch: Partial<ShuanQRuntimeState>): ShuanQRuntimeState {
  runtimeState = { ...runtimeState, ...patch };
  return runtimeState;
}

export function toPublicStatus(state: ShuanQRuntimeState = runtimeState): PublicShuanQStatus {
  return {
    bootstrapped: state.bootstrapped,
    authenticated: !!state.session?.authenticated,
    verifyMode: state.verifyMode,
    appInfoUnavailable: state.appInfoUnavailable,
    message: state.message,
    gonggao: state.gonggao,
    account: state.session?.account || '',
    expireTime: state.session?.expireTime || '',
    permissions: state.session?.permissions || [],
    score: state.session?.score || 0,
    lastHeartbeatAt: state.session?.lastHeartbeatAt || null,
  };
}

function parseJsonSetting<T>(key: string): T | null {
  const raw = getSetting(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function restorePersistedState(): ShuanQRuntimeState {
  const session = parseJsonSetting<ShuanQLoginSession>(SHUANQ_SETTINGS_KEYS.state);
  const appInfo = parseJsonSetting<Pick<ShuanQRuntimeState, 'appInfo' | 'verifyMode' | 'gonggao' | 'clientPublicKey' | 'serverPrivateKey' | 'apiKey' | 'cloudApiUrl'>>(SHUANQ_SETTINGS_KEYS.appInfo);
  runtimeState = {
    ...runtimeState,
    ...(appInfo || {}),
    bootstrapped: !!appInfo,
    session: session?.authenticated ? session : null,
  };
  return runtimeState;
}

export function persistAppInfoState(state: ShuanQRuntimeState = runtimeState): void {
  setSetting(SHUANQ_SETTINGS_KEYS.appInfo, JSON.stringify({
    appInfo: state.appInfo,
    verifyMode: state.verifyMode,
    gonggao: state.gonggao,
    clientPublicKey: state.clientPublicKey,
    serverPrivateKey: state.serverPrivateKey,
    apiKey: state.apiKey,
    cloudApiUrl: state.cloudApiUrl,
  }));
}

export function persistSession(session: ShuanQLoginSession | null): void {
  if (!session) {
    setSetting(SHUANQ_SETTINGS_KEYS.state, '');
    runtimeState = { ...runtimeState, session: null };
    return;
  }
  setSetting(SHUANQ_SETTINGS_KEYS.state, JSON.stringify(session));
  runtimeState = { ...runtimeState, session };
}
