export interface ShuanQAppInfo {
  id?: number | string;
  name?: string;
  title?: string;
  content?: string;
  version?: string;
  param_extend_config?: Record<string, string>;
  [key: string]: unknown;
}

export interface ShuanQUserInfo {
  id?: number | string;
  account?: string;
  nickname?: string;
  avatar?: string;
  point?: number;
  viptime?: number;
  is_forever_vip?: number;
  private_data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ShuanQLoginSession {
  authenticated: boolean;
  userId: string;
  account: string;
  userToken: string;
  expireTime: string;
  permissions: string[];
  score: number;
  verifyMode: number;
  lastHeartbeatAt: string | null;
}

export interface PublicShuanQStatus {
  bootstrapped: boolean;
  authenticated: boolean;
  verifyMode: number;
  appInfoUnavailable: boolean;
  message: string;
  gonggao: string;
  account: string;
  expireTime: string;
  permissions: string[];
  score: number;
  lastHeartbeatAt: string | null;
}

export interface ShuanQRawResponse {
  code: number;
  message: string;
  data?: string;
  signature?: string;
  timestamp?: number;
}

export interface ShuanQCheckedResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface ShuanQAppInfoResponse {
  info: ShuanQAppInfo;
  user_verify_mode: number;
  moreOtherData?: {
    request_safe_code?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ShuanQLoginResponse {
  user_token: string;
  user_id: number | string;
  data: {
    userInfo: ShuanQUserInfo;
    vipExpireTimeStr?: string;
    [key: string]: unknown;
  };
  moreOtherData?: {
    request_safe_code?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ShuanQUserInfoResponse {
  userInfo?: ShuanQUserInfo;
  vipExpireTimeStr?: string;
  moreOtherData?: {
    request_safe_code?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ShuanQCardInfoResponse {
  card?: string;
  status?: number;
  type?: number;
  time_type?: number;
  useuid?: number | string;
  value?: number;
  moreOtherData?: {
    request_safe_code?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type ShuanQVariableContent =
  | { kind: 'json'; value: unknown; raw: string }
  | { kind: 'text'; value: string; raw: string };
