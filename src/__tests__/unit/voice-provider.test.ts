import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVoiceProvider } from '../../lib/voice-provider';

describe('voice provider helpers', () => {
  it('normalizes supported provider names', () => {
    assert.equal(normalizeVoiceProvider('indextts'), 'indextts');
    assert.equal(normalizeVoiceProvider('skyhuman'), 'skyhuman');
  });

  it('defaults unknown values to SkyHuman', () => {
    assert.equal(normalizeVoiceProvider(''), 'skyhuman');
    assert.equal(normalizeVoiceProvider('gitee'), 'skyhuman');
    assert.equal(normalizeVoiceProvider(undefined), 'skyhuman');
  });
});
