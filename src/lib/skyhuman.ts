import { getSetting } from '@/lib/db';

export const SKYHUMAN_BASE_URL = 'https://skyhumanapi.pilihu.vip';
export const SKYHUMAN_TOKEN_KEY = 'skyhuman_api_token';

interface SkyHumanEnvelope {
  code?: number;
  message?: string;
  request_id?: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface SkyHumanAvatar {
  id?: number | string;
  avatar_code?: string;
  avatarCode?: string;
  title?: string;
  name?: string;
  cover_image_url?: string;
  coverImageUrl?: string;
  cover_url?: string;
  cover?: string;
  is_favorite?: boolean;
  isFavorite?: boolean;
  human_type?: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
}

export interface SkyHumanVoice {
  id?: number | string;
  voice?: string;
  title?: string;
  type?: string | number;
  rate?: string | number;
  volume?: string | number;
  pitch?: string | number;
  demo_url?: string;
  demoUrl?: string;
  audio_url?: string;
  audioUrl?: string;
  language?: string;
  kind?: number | string;
  status?: string | number;
  created_at?: string;
  createdAt?: string;
}

export interface SkyHumanUploadInfo {
  upload_url: string;
  content_type: string;
  file_id: string;
}

type UnknownRecord = Record<string, unknown>;

export class SkyHumanError extends Error {
  status: number;
  code?: number;
  requestId?: string;

  constructor(message: string, status = 500, code?: number, requestId?: string) {
    super(message);
    this.name = 'SkyHumanError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function getSkyHumanToken(): string {
  return getSetting(SKYHUMAN_TOKEN_KEY) || '';
}

export function maskSkyHumanToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '***';
  return `***${token.slice(-8)}`;
}

function getHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseSkyHumanResponse(res: Response, action: string): Promise<SkyHumanEnvelope> {
  let payload: SkyHumanEnvelope = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  if (res.status === 401) {
    throw new SkyHumanError('SkyHuman API Token 无效，请检查数字人配置。', 401);
  }

  if (!res.ok) {
    throw new SkyHumanError(`${action}失败，HTTP ${res.status}`, res.status);
  }

  if (payload.code !== 0) {
    throw new SkyHumanError(
      String(payload.message || `${action}失败`),
      400,
      typeof payload.code === 'number' ? payload.code : undefined,
      typeof payload.request_id === 'string' ? payload.request_id : undefined,
    );
  }

  return payload;
}

export async function skyHumanRequest(
  token: string,
  path: string,
  init: RequestInit = {},
  action = '请求 SkyHuman',
): Promise<SkyHumanEnvelope> {
  if (!token) {
    throw new SkyHumanError('请先配置 SkyHuman API Token。', 400);
  }

  const res = await fetch(`${SKYHUMAN_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getHeaders(token),
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(30_000),
  });

  return parseSkyHumanResponse(res, action);
}

export async function getSkyHumanCredit(token: string): Promise<number> {
  const data = await skyHumanRequest(token, '/api/v2/fly/account/credit', { method: 'GET' }, '查询账户积分');
  const payload = isRecord(data.data) ? data.data : data;
  const credit = payload.left ?? payload.credit ?? payload.balance;
  return typeof credit === 'number' ? credit : Number(credit || 0);
}

export async function listSkyHumanAvatars(token: string, favoriteOnly = false): Promise<SkyHumanAvatar[]> {
  const data = await skyHumanRequest(
    token,
    `/api/v2/fly/avatar/list?favorite_only=${favoriteOnly ? 'true' : 'false'}`,
    { method: 'GET' },
    '获取数字人列表',
  );
  const payload = data.data;
  if (Array.isArray(payload)) return payload as SkyHumanAvatar[];
  if (!isRecord(payload)) return [];
  const avatars = payload.avatars ?? payload.list ?? payload.items ?? payload.records;
  return Array.isArray(avatars) ? avatars as SkyHumanAvatar[] : [];
}

export async function createSkyHumanUploadUrl(token: string, fileExtension: string): Promise<SkyHumanUploadInfo> {
  const data = await skyHumanRequest(
    token,
    '/api/v2/fly/upload/create_upload_url',
    {
      method: 'POST',
      body: JSON.stringify({ file_extension: fileExtension }),
    },
    '获取上传地址',
  );
  const info = data.data as Partial<SkyHumanUploadInfo> | undefined;
  if (!info?.upload_url || !info.file_id) {
    throw new SkyHumanError('上传地址返回不完整。', 500);
  }
  return {
    upload_url: info.upload_url,
    content_type: info.content_type || 'application/octet-stream',
    file_id: info.file_id,
  };
}

export async function uploadFileToSkyHuman(uploadInfo: SkyHumanUploadInfo, file: File): Promise<void> {
  await uploadBlobToSkyHuman(uploadInfo, file, '上传音频');
}

export async function uploadBlobToSkyHuman(uploadInfo: SkyHumanUploadInfo, body: Blob, action = '上传文件'): Promise<void> {
  const res = await fetch(uploadInfo.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': uploadInfo.content_type },
    body,
    signal: AbortSignal.timeout(120_000),
  });

  if (res.status !== 200 && res.status !== 201) {
    throw new SkyHumanError(`${action}失败，HTTP ${res.status}`, res.status);
  }
}

export async function createSkyHumanAvatarByFile(token: string, title: string, fileId: string): Promise<string> {
  const data = await skyHumanRequest(
    token,
    '/api/v2/fly/avatar/create_by_video',
    {
      method: 'POST',
      body: JSON.stringify({ title: title || '未命名数字人', file_id: fileId }),
    },
    '创建数字人',
  );
  const payload = isRecord(data.data) ? data.data : data;
  const taskId = payload.task_id ?? payload.taskId;
  if (typeof taskId !== 'string' || !taskId) {
    throw new SkyHumanError('创建数字人成功但未返回 task_id。', 500);
  }
  return taskId;
}

export async function querySkyHumanAvatarTask(token: string, taskId: string) {
  return skyHumanRequest(
    token,
    `/api/v2/fly/avatar/task?task_id=${encodeURIComponent(taskId)}`,
    { method: 'GET' },
    '查询数字人任务',
  );
}

export async function deleteSkyHumanAvatar(token: string, avatarCode: string): Promise<void> {
  await skyHumanRequest(
    token,
    '/api/v2/fly/avatar/delete',
    {
      method: 'POST',
      body: JSON.stringify({ avatar_code: avatarCode }),
    },
    '删除数字人',
  );
}

export async function listSkyHumanVoices(token: string, kind = 1, page = 1, size = 20): Promise<SkyHumanVoice[]> {
  const data = await skyHumanRequest(
    token,
    `/api/v2/fly/voice/list?page=${encodeURIComponent(String(page))}&size=${encodeURIComponent(String(size))}&kind=${encodeURIComponent(String(kind))}`,
    { method: 'GET' },
    '获取音色列表',
  );
  const payload = data.data;
  if (Array.isArray(payload)) return payload as SkyHumanVoice[];
  if (!isRecord(payload)) return [];
  const voices = payload.voices ?? payload.list ?? payload.items ?? payload.records ?? payload.data;
  return Array.isArray(voices) ? voices as SkyHumanVoice[] : [];
}

export async function createSkyHumanVoiceByAudio(
  token: string,
  title: string,
  fileId: string,
  language?: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    title: title || '未命名',
    file_id: fileId,
    voice_type: 8,
  };
  if (language) body.language = language;

  const data = await skyHumanRequest(
    token,
    '/api/v2/fly/voice/create',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    '创建音色',
  );
  const payload = isRecord(data.data) ? data.data : data;
  const taskId = payload.task_id ?? payload.taskId;
  if (typeof taskId !== 'string' || !taskId) {
    throw new SkyHumanError('创建音色成功但未返回 task_id。', 500);
  }
  return taskId;
}

export async function querySkyHumanVoiceTask(token: string, taskId: string) {
  return skyHumanRequest(
    token,
    `/api/v2/fly/voice/task?task_id=${encodeURIComponent(taskId)}`,
    { method: 'GET' },
    '查询音色任务',
  );
}

export async function editSkyHumanVoice(
  token: string,
  voice: string,
  patch: { title?: string; rate?: string | number; volume?: string | number; pitch?: string | number },
): Promise<void> {
  const body: Record<string, unknown> = { voice };
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.rate !== undefined) body.rate = String(patch.rate);
  if (patch.volume !== undefined) body.volume = String(patch.volume);
  if (patch.pitch !== undefined) body.pitch = String(patch.pitch);

  await skyHumanRequest(
    token,
    '/api/v2/fly/voice/edit',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    '编辑音色',
  );
}

export async function createSkyHumanAudioByTTS(
  token: string,
  voice: string,
  text: string,
  title = '未命名',
  aigcFlag = 0,
): Promise<string> {
  const data = await skyHumanRequest(
    token,
    '/api/v2/fly/audio/create_by_tts',
    {
      method: 'POST',
      body: JSON.stringify({
        voice,
        text,
        title,
        aigc_flag: aigcFlag,
      }),
    },
    '生成音频',
  );
  const payload = isRecord(data.data) ? data.data : data;
  const taskId = payload.task_id ?? payload.taskId;
  if (typeof taskId !== 'string' || !taskId) {
    throw new SkyHumanError('生成音频成功但未返回 task_id。', 500);
  }
  return taskId;
}

export async function querySkyHumanAudioTask(token: string, taskId: string) {
  return skyHumanRequest(
    token,
    `/api/v2/fly/audio/task?task_id=${encodeURIComponent(taskId)}`,
    { method: 'GET' },
    '查询音频任务',
  );
}

export async function createSkyHumanVideoByAudio(
  token: string,
  avatar: string,
  title: string,
  input: { audioUrl?: string; fileId?: string },
): Promise<string> {
  const body: Record<string, unknown> = {
    title: title || '未命名',
    avatar,
  };
  if (input.audioUrl) body.audio_url = input.audioUrl;
  if (input.fileId) body.file_id = input.fileId;

  if (!body.audio_url && !body.file_id) {
    throw new SkyHumanError('请提供音频 URL 或音频 file_id。', 400);
  }

  const data = await skyHumanRequest(
    token,
    '/api/v2/fly/video/create_by_audio',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    '创建数字人视频',
  );
  const payload = isRecord(data.data) ? data.data : data;
  const taskId = payload.task_id ?? payload.taskId;
  if (typeof taskId !== 'string' || !taskId) {
    throw new SkyHumanError('创建数字人视频成功但未返回 task_id。', 500);
  }
  return taskId;
}

export async function querySkyHumanVideoTask(token: string, taskId: string) {
  return skyHumanRequest(
    token,
    `/api/v2/fly/video/task?task_id=${encodeURIComponent(taskId)}`,
    { method: 'GET' },
    '查询数字人视频任务',
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}
