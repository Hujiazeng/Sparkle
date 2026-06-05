interface CachedTtsResult {
  audioUrl: string;
  duration: number;
  message?: string;
  createdAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CachedTtsResult>();

function cleanup(now = Date.now()) {
  for (const [key, value] of cache.entries()) {
    if (now - value.createdAt > TTL_MS) cache.delete(key);
  }
}

export function putCachedTtsResult(result: Omit<CachedTtsResult, 'createdAt'>): string {
  cleanup();
  const id = `indextts:${crypto.randomUUID()}`;
  cache.set(id, { ...result, createdAt: Date.now() });
  return id;
}

export function getCachedTtsResult(id: string): CachedTtsResult | undefined {
  cleanup();
  return cache.get(id);
}
