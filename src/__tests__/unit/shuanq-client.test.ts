import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { ShuanQClient, aesDecryptFromHex, aesEncryptToHex, getParamsSignString, md5 } from '../../lib/shuanq/client';
import type { ShuanQRawResponse } from '../../lib/shuanq/types';

const config = {
  host: 'https://example.test',
  appId: '21',
  appKey: 'app-key',
  aesKey: '1234567890abcdef',
  signatureTimeLimitMinimum: 90,
  signatureTimeLimitMaximum: 90,
  heartbeatFrequencySeconds: 300,
};

describe('ShuanQ protocol helpers', () => {
  it('matches Python parameter signing order and exclusions', () => {
    assert.equal(
      getParamsSignString({
        password: 'pw',
        account: 'alice',
        appid: '21',
        signature: 'ignored',
        empty: '',
        timestamp: '123',
      }),
      'account=alice&password=pw&timestamp=123',
    );
  });

  it('AES ECB encrypt/decrypt round trips hex payloads', () => {
    const encrypted = aesEncryptToHex('account=alice', config.aesKey);
    assert.match(encrypted, /^[0-9a-f]+$/);
    assert.equal(aesDecryptFromHex(encrypted, config.aesKey), 'account=alice');
  });

  it('MD5 helper returns lowercase hex', () => {
    assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  });
});

describe('ShuanQClient response validation', () => {
  it('decrypts AES app-info responses and validates safe code', () => {
    const client = new ShuanQClient(config);
    const params = client.paramsHandle({}, 1);
    const encryptedSafeCodeKey = Object.keys(params).find((key) => {
      if (key === 'appid') return false;
      try {
        return aesDecryptFromHex(key, config.aesKey) === 'request_safe_code';
      } catch {
        return false;
      }
    });
    assert.ok(encryptedSafeCodeKey);
    const safeCode = aesDecryptFromHex(params[encryptedSafeCodeKey], config.aesKey);
    const data = {
      info: { param_extend_config: { gonggao: 'hi' } },
      user_verify_mode: 1,
      moreOtherData: { request_safe_code: safeCode },
    };
    const encryptedData = aesEncryptToHex(JSON.stringify(data), config.aesKey);
    const response: ShuanQRawResponse = {
      code: 1,
      message: 'ok',
      data: encryptedData,
      signature: md5(encryptedData + config.appKey),
    };
    assert.deepEqual(client.checkResponse(response, 1).data, data);
  });

  it('rejects invalid response signatures', () => {
    const client = new ShuanQClient(config);
    const data = aesEncryptToHex(JSON.stringify({ moreOtherData: { request_safe_code: 'x' } }), config.aesKey);
    assert.throws(
      () => client.checkResponse({ code: 1, message: 'ok', data, signature: crypto.randomBytes(16).toString('hex') }, 1),
      /数据错误1/,
    );
  });
});
