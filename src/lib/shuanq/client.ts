import crypto from 'crypto';
import { getShuanQConfig, type ShuanQConfig } from './config';
import type { ShuanQCheckedResponse, ShuanQRawResponse } from './types';

export class ShuanQError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'ShuanQError';
    this.code = code;
  }
}

export function md5(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex');
}

export function getParamsSignString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .filter((key) => key !== 'appid' && key !== 'signature' && params[key] !== '')
    .map((key) => `${key}=${params[key]}`)
    .join('&');
}

function normalizeAesKey(key: string): Buffer {
  return Buffer.from(key.length === 16 ? key : key.slice(0, 16), 'utf8');
}

export function aesEncryptToHex(data: string, key: string): string {
  const cipher = crypto.createCipheriv('aes-128-ecb', normalizeAesKey(key), null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(String(data), 'utf8'), cipher.final()]).toString('hex');
}

export function aesDecryptFromHex(data: string, key: string): string {
  const decipher = crypto.createDecipheriv('aes-128-ecb', normalizeAesKey(key), null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
}

function rsaEncryptToHex(data: string, publicKey: string): string {
  const buffer = Buffer.from(String(data), 'utf8');
  const keyObject = crypto.createPublicKey(publicKey);
  const keySize = Math.ceil((keyObject.asymmetricKeyDetails?.modulusLength || 2048) / 8);
  const maxLength = keySize - 11;
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += maxLength) {
    chunks.push(crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, buffer.subarray(offset, offset + maxLength)));
  }
  return Buffer.concat(chunks).toString('hex');
}

function rsaDecryptFromHex(data: string, privateKey: string): string {
  const buffer = Buffer.from(data, 'hex');
  const keyObject = crypto.createPrivateKey(privateKey);
  const keySize = Math.ceil((keyObject.asymmetricKeyDetails?.modulusLength || 2048) / 8);
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += keySize) {
    chunks.push(crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, buffer.subarray(offset, offset + keySize)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function randomString(length: number): string {
  const base = 'ADCHOHIHIGKLMNOPXRSKLJWXQZabcgrtghfdslmnfgarshubwvyz0124452286';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += base[crypto.randomInt(0, base.length)];
  }
  return result;
}

export interface ShuanQClientKeys {
  clientPublicKey?: string;
  serverPrivateKey?: string;
}

export class ShuanQClient {
  private readonly config: ShuanQConfig;
  private readonly requestSafeCode: string;
  private readonly keys: ShuanQClientKeys;

  constructor(config: ShuanQConfig = getShuanQConfig(), keys: ShuanQClientKeys = {}) {
    this.config = config;
    this.keys = keys;
    this.requestSafeCode = randomString(32);
  }

  async request<T>(api: string, params: Record<string, string | number> = {}, mode: 1 | 2 = 2): Promise<ShuanQCheckedResponse<T>> {
    const actualParams = this.paramsHandle(params, mode);
    const body = new URLSearchParams(actualParams);
    const response = await fetch(`${this.config.host}${api}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new ShuanQError(text || `HTTP ${response.status}`);
    }

    let json: ShuanQRawResponse;
    try {
      json = JSON.parse(text) as ShuanQRawResponse;
    } catch {
      throw new ShuanQError('栓Q响应不是有效 JSON');
    }

    return this.checkResponse<T>(json, mode);
  }

  paramsHandle(params: Record<string, string | number>, mode: 1 | 2): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      normalized[key] = String(value);
    }
    normalized.appid = this.config.appId;
    normalized.timestamp = String(Math.floor(Date.now() / 1000));
    normalized.request_safe_code = this.requestSafeCode;
    normalized.signature = md5(getParamsSignString(normalized) + this.config.appKey);

    const encrypted: Record<string, string> = { appid: normalized.appid };
    for (const [key, value] of Object.entries(normalized)) {
      if (key === 'appid') continue;
      if (mode === 1) {
        encrypted[aesEncryptToHex(key, this.config.aesKey)] = aesEncryptToHex(value, this.config.aesKey);
      } else {
        if (!this.keys.clientPublicKey) {
          throw new ShuanQError('应用公钥未初始化');
        }
        encrypted[rsaEncryptToHex(key, this.keys.clientPublicKey)] = rsaEncryptToHex(value, this.keys.clientPublicKey);
      }
    }
    return encrypted;
  }

  checkResponse<T>(json: ShuanQRawResponse, mode: 1 | 2): ShuanQCheckedResponse<T> {
    if (!json) {
      throw new ShuanQError('未知错误');
    }
    const code = Number(json.code);
    const message = json.message || '';
    if (code !== 1) {
      throw new ShuanQError(message || '栓Q接口返回失败', code);
    }
    if (!json.data || !json.signature) {
      throw new ShuanQError('栓Q响应缺少数据');
    }
    if (md5(json.data + this.config.appKey) !== json.signature) {
      throw new ShuanQError('数据错误1');
    }

    const dataText = mode === 1
      ? aesDecryptFromHex(json.data, this.config.aesKey)
      : this.decryptRsaData(json.data);
    let data: T & { moreOtherData?: { request_safe_code?: string } };
    try {
      data = JSON.parse(dataText) as T & { moreOtherData?: { request_safe_code?: string } };
    } catch {
      throw new ShuanQError('栓Q响应 data 不是有效 JSON');
    }
    if (data.moreOtherData?.request_safe_code !== this.requestSafeCode) {
      throw new ShuanQError('数据错误2');
    }

    return { code, message, data };
  }

  private decryptRsaData(data: string): string {
    if (!this.keys.serverPrivateKey) {
      throw new ShuanQError('应用私钥未初始化');
    }
    return rsaDecryptFromHex(data, this.keys.serverPrivateKey);
  }
}
