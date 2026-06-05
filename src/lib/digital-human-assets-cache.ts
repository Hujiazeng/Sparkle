"use client";

export type WorkbenchAssetStatus = "ready" | "training" | "failed";

export interface CachedWorkbenchVoice {
  id: string;
  name: string;
  kind: number;
  status: WorkbenchAssetStatus;
}

export interface CachedWorkbenchAvatar {
  id: string;
  name: string;
  coverImageUrl: string;
  status: WorkbenchAssetStatus;
}

interface AssetCacheState {
  voices: CachedWorkbenchVoice[];
  avatars: CachedWorkbenchAvatar[];
  voiceProvider: string;
  voicesLoading: boolean;
  avatarsLoading: boolean;
  voicesLoaded: boolean;
  avatarsLoaded: boolean;
}

type Listener = () => void;
type AssetKind = "voices" | "avatars" | "all";

const listeners = new Set<Listener>();

let state: AssetCacheState = {
  voices: [],
  avatars: [],
  voiceProvider: "skyhuman",
  voicesLoading: true,
  avatarsLoading: true,
  voicesLoaded: false,
  avatarsLoaded: false,
};

let voicesRequest: Promise<void> | null = null;
let avatarsRequest: Promise<void> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(patch: Partial<AssetCacheState>) {
  state = { ...state, ...patch };
  emit();
}

function normalizeStatus(status: unknown): WorkbenchAssetStatus {
  const value = String(status || "").toLowerCase();
  if (["failed", "fail", "error", "cancelled", "canceled"].includes(value) || value === "4") return "failed";
  if (["ready", "success", "succeeded", "done", "completed", "finish", "finished", "3"].includes(value)) return "ready";
  return value ? "training" : "ready";
}

export function getDigitalHumanAssetsSnapshot(): AssetCacheState {
  return state;
}

export function subscribeDigitalHumanAssets(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function loadVoices(force = false) {
  if (voicesRequest) return voicesRequest;
  if (!force && state.voicesLoaded) return;

  setState({ voicesLoading: true });
  voicesRequest = fetch("/api/voices/provider", { cache: "no-store" })
    .then((res) => res.ok ? res.json() : null)
    .then((providerData) => {
      const provider = String(providerData?.provider || "skyhuman");
      setState({ voiceProvider: provider });
      return fetch(`/api/voices?provider=${encodeURIComponent(provider)}&kind=all&page=1&size=300`);
    })
    .then((res) => res.ok ? res.json() : null)
    .then((data) => {
      const rawVoices = Array.isArray(data?.voices) ? data.voices as Record<string, unknown>[] : [];
      const voices = rawVoices
        .map((voice): CachedWorkbenchVoice => ({
          id: String(voice.voice || voice.id || ""),
          name: String(voice.title || ""),
          kind: Number(voice.kind ?? 1) === 2 ? 2 : 1,
          status: normalizeStatus(voice.status),
        }))
        .filter((voice) => voice.id && voice.name && voice.status === "ready");
      setState({ voices, voicesLoaded: true });
    })
    .catch(() => {
      setState({ voices: [], voicesLoaded: true });
    })
    .finally(() => {
      voicesRequest = null;
      setState({ voicesLoading: false });
    });

  return voicesRequest;
}

async function loadAvatars(force = false) {
  if (avatarsRequest) return avatarsRequest;
  if (!force && state.avatarsLoaded) return;

  setState({ avatarsLoading: true });
  avatarsRequest = fetch("/api/digital-human/avatars")
    .then((res) => res.ok ? res.json() : null)
    .then((data) => {
      const rawAvatars = Array.isArray(data?.avatars) ? data.avatars as Record<string, unknown>[] : [];
      const avatars = rawAvatars
        .map((avatar): CachedWorkbenchAvatar => ({
          id: String(avatar.avatarCode || avatar.id || ""),
          name: String(avatar.title || ""),
          coverImageUrl: String(avatar.coverImageUrl || avatar.cover_image_url || ""),
          status: normalizeStatus(avatar.status),
        }))
        .filter((avatar) => avatar.id && avatar.name && avatar.coverImageUrl && avatar.status === "ready");
      setState({ avatars, avatarsLoaded: true });
    })
    .catch(() => {
      setState({ avatars: [], avatarsLoaded: true });
    })
    .finally(() => {
      avatarsRequest = null;
      setState({ avatarsLoading: false });
    });

  return avatarsRequest;
}

export async function loadDigitalHumanAssets(force = false) {
  await Promise.all([loadVoices(force), loadAvatars(force)]);
}

export async function refreshDigitalHumanAssets(kind: AssetKind = "all") {
  if (kind === "voices") {
    await loadVoices(true);
    return;
  }
  if (kind === "avatars") {
    await loadAvatars(true);
    return;
  }
  await loadDigitalHumanAssets(true);
}
