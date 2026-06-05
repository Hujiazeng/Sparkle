export interface ShuanQConfig {
  host: string;
  appId: string;
  appKey: string;
  aesKey: string;
  signatureTimeLimitMinimum: number;
  signatureTimeLimitMaximum: number;
  heartbeatFrequencySeconds: number;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getShuanQConfig(): ShuanQConfig {
  return {
    host: trimTrailingSlash(process.env.SHUANQ_HOST || 'https://pilihu.vip'),
    appId: process.env.SHUANQ_APP_ID || '22',
    appKey: process.env.SHUANQ_APP_KEY || '7786aeee1c4185fdb92494e6ed46bab8',
    aesKey: process.env.SHUANQ_AES_KEY || '66c9f23616b7f9931117c1ce296aacbf',
    signatureTimeLimitMinimum: Number(process.env.SHUANQ_SIGNATURE_TIME_MINIMUM || 90),
    signatureTimeLimitMaximum: Number(process.env.SHUANQ_SIGNATURE_TIME_MAXIMUM || 90),
    heartbeatFrequencySeconds: Number(process.env.SHUANQ_HEARTBEAT_SECONDS || 120),
  };
}

export const SHUANQ_SETTINGS_KEYS = {
  state: 'shuanq_auth_state',
  appInfo: 'shuanq_app_info',
} as const;
