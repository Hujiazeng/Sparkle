import { getRuntimeState, restorePersistedState } from '@/lib/shuanq/state';
import { getShuanQConfig } from '@/lib/shuanq/config';

const DEFAULT_INDEXTTS_BACKEND_URL = 'https://zhinengti.pilihu.vip';

interface IndexTTSCloudConfig {
  baseUrl: string;
  token: string;
  appId: string;
  indexttsApiKey: string;
  indexttsPaidApiKey: string;
  userToken: string;
  sharedIdentity: boolean;
}

interface CloudEnvelope {
  code?: number | string;
  message?: string;
  data?: unknown;
  request_id?: string;
  [key: string]: unknown;
}

export interface IndexTTSCloudVoice {
  id?: number | string;
  name?: string;
  audio_url?: string;
  audioUrl?: string;
  created_at?: string;
  createdAt?: string;
}

export interface IndexTTSSynthesizeInput {
  text: string;
  voiceId: number | string;
  emotion?: string | null;
  emoAlpha?: number;
  speed?: number;
}

export interface IndexTTSSynthesizeResult {
  audioUrl: string;
  taskId: string;
  duration: number;
}

export class IndexTTSCloudError extends Error {
  status: number;
  code?: number;
  requestId?: string;

  constructor(message: string, status = 500, code?: number, requestId?: string) {
    super(message);
    this.name = 'IndexTTSCloudError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readShuanQState() {
  let state = getRuntimeState();
  if (!state.bootstrapped && !state.appInfo) {
    state = restorePersistedState();
  }
  return state;
}

function readExtendConfig(): Record<string, unknown> {
  const state = readShuanQState();
  const extend = state.appInfo?.param_extend_config;
  return extend && typeof extend === 'object' ? extend : {};
}

function readString(extend: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = extend[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function createSharedUserToken(userId: string | number): string {
  return Buffer.from(JSON.stringify({
    id: Number(userId) || 0,
    startTime: 0,
  }), 'utf8').toString('hex');
}

export function getIndexTTSCloudConfig(): IndexTTSCloudConfig {
  const state = readShuanQState();
  const extend = readExtendConfig();
  const baseUrl = readString(extend, [
    'indextts_backend_url',
    'index_tts_backend_url',
    'voice_backend_url',
  ]) || DEFAULT_INDEXTTS_BACKEND_URL;
  const token = readString(extend, [
    'indextts_backend_token',
    'index_tts_backend_token',
    'voice_backend_token',
  ]);
  const appId = readString(extend, [
    'indextts_backend_app_id',
    'index_tts_backend_app_id',
    'voice_backend_app_id',
  ]) || getShuanQConfig().appId;
  const indexttsApiKey = readString(extend, [
    'indextts_api_key',
    'index_tts_api_key',
    'index_tts_key',
  ]);
  const indexttsPaidApiKey = readString(extend, [
    'indextts_api_key_paid',
    'index_tts_api_key_paid',
    'index_tts_paid_key',
  ]);
  const sharedUserId = readString(extend, [
    'indextts_backend_user_id',
    'index_tts_backend_user_id',
    'voice_backend_user_id',
    'indextts_shared_user_id',
    'index_tts_shared_user_id',
  ]) || '0';
  const sessionUserToken = state.session?.authenticated ? state.session.userToken : '';

  return {
    baseUrl: trimTrailingSlash(baseUrl),
    token,
    appId,
    indexttsApiKey,
    indexttsPaidApiKey,
    userToken: sessionUserToken || createSharedUserToken(sharedUserId),
    sharedIdentity: !token && !sessionUserToken,
  };
}

export function isIndexTTSCloudConfigured(): boolean {
  const config = getIndexTTSCloudConfig();
  return !!config.baseUrl && !!config.appId && !!config.indexttsApiKey && (!!config.token || !!config.userToken);
}

function getHeaders(config: IndexTTSCloudConfig, json = true): HeadersInit {
  const bearerToken = config.token || config.userToken;
  if ((!bearerToken || !config.indexttsApiKey) || !config.appId) {
    throw new IndexTTSCloudError('当前语音服务暂不可用，请联系管理员处理。', 400);
  }
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(config.sharedIdentity ? {} : { 'X-App-Id': config.appId }),
    Authorization: `Bearer ${bearerToken}`,
    ...(config.indexttsApiKey ? { 'X-IndexTTS-Api-Key': config.indexttsApiKey } : {}),
    ...(config.indexttsPaidApiKey ? { 'X-IndexTTS-Paid-Api-Key': config.indexttsPaidApiKey } : {}),
  };
}

async function parseCloudResponse(res: Response, action: string): Promise<CloudEnvelope> {
  let payload: CloudEnvelope = {};
  try {
    payload = await res.json() as CloudEnvelope;
  } catch {
    payload = {};
  }

  if (!res.ok) {
    throw new IndexTTSCloudError(String(payload.message || `${action}失败，HTTP ${res.status}`), res.status);
  }

  const code = payload.code;
  const isSuccessCode = code === undefined || code === 0 || code === '0';
  if (!isSuccessCode) {
    throw new IndexTTSCloudError(
      String(payload.message || `${action}失败`),
      400,
      typeof code === 'number' ? code : Number.isFinite(Number(code)) ? Number(code) : undefined,
      typeof payload.request_id === 'string' ? payload.request_id : undefined,
    );
  }

  return payload;
}

async function cloudRequest(path: string, init: RequestInit, action: string): Promise<CloudEnvelope> {
  const config = getIndexTTSCloudConfig();
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      ...getHeaders(config, init.body instanceof FormData ? false : true),
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(120_000),
  });
  return parseCloudResponse(res, action);
}

export async function listIndexTTSCloudVoices(): Promise<IndexTTSCloudVoice[]> {
  const payload = await cloudRequest('/api/voice/custom-voices', { method: 'GET' }, '获取 IndexTTS 音色列表');
  return Array.isArray(payload.data) ? payload.data as IndexTTSCloudVoice[] : [];
}

export async function uploadIndexTTSCloudVoice(file: File, name: string): Promise<IndexTTSCloudVoice> {
  const formData = new FormData();
  formData.append('audio', file, file.name || 'recording.webm');
  formData.append('name', name);
  formData.append('language', 'zh');
  const payload = await cloudRequest('/api/voice/clone/upload', { method: 'POST', body: formData }, '上传 IndexTTS 音色');
  return (payload.data && typeof payload.data === 'object' ? payload.data : {}) as IndexTTSCloudVoice;
}

export async function synthesizeIndexTTSCloudAudio(input: IndexTTSSynthesizeInput): Promise<IndexTTSSynthesizeResult> {
  const payload = await cloudRequest(
    '/api/voice/synthesize',
    {
      method: 'POST',
      body: JSON.stringify({
        text: input.text,
        voice_id: Number(input.voiceId),
        emotion: input.emotion || null,
        emo_alpha: input.emoAlpha ?? 0.5,
        speed: input.speed ?? 1.0,
        speech_rate: input.speed ?? 1.0,
      }),
    },
    'IndexTTS 语音合成',
  );
  const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : {};
  return {
    audioUrl: String(data.url || data.audio_url || data.audioUrl || ''),
    taskId: String(data.task_id || data.taskId || ''),
    duration: Number(data.duration || 0),
  };
}

export async function deleteIndexTTSCloudVoice(voiceId: string | number): Promise<void> {
  await cloudRequest(`/api/voice/clone/${encodeURIComponent(String(voiceId))}`, { method: 'DELETE' }, '删除 IndexTTS 音色');
}
