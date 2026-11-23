const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 10;

const store = new Map<string, number[]>();

export function checkRegenerateLimit(key: string, now = Date.now()) {
  const history = (store.get(key) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (history.length >= MAX_PER_HOUR) {
    const retryAfterMs = WINDOW_MS - (now - history[0]);
    store.set(key, history);
    return { allowed: false as const, retryAfterMs };
  }
  history.push(now);
  store.set(key, history);
  return { allowed: true as const, remaining: MAX_PER_HOUR - history.length };
}

export function resetRegenerateLimit(key?: string) {
  if (key) store.delete(key);
  else store.clear();
}
