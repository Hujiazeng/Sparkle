import { getSetting, setSetting } from '@/lib/db';

export type VoiceProvider = 'skyhuman' | 'indextts';

export const DEFAULT_VOICE_PROVIDER_KEY = 'default_voice_provider';

export function normalizeVoiceProvider(value: unknown): VoiceProvider {
  return value === 'indextts' ? 'indextts' : 'skyhuman';
}

export function getDefaultVoiceProvider(): VoiceProvider {
  return normalizeVoiceProvider(getSetting(DEFAULT_VOICE_PROVIDER_KEY));
}

export function setDefaultVoiceProvider(provider: VoiceProvider): void {
  setSetting(DEFAULT_VOICE_PROVIDER_KEY, normalizeVoiceProvider(provider));
}
