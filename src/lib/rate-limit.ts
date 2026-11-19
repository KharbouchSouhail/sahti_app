type Entry = {
  failures: number[];
  blockedUntil?: number;
};

const store = new Map<string, Entry>();

const WINDOW_MS = 60 * 1000;
const MAX_PER_MINUTE = 5;
const MAX_FAILURES = 10;
const BLOCK_MS = 15 * 60 * 1000;
const FAILURE_MEMORY_MS = 24 * 60 * 60 * 1000;

function getEntry(key: string) {
  const now = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { failures: [] };
    store.set(key, entry);
  }
  entry.failures = entry.failures.filter((t) => now - t < FAILURE_MEMORY_MS);
  if (entry.blockedUntil && entry.blockedUntil <= now) entry.blockedUntil = undefined;
  return entry;
}

export function isRateLimited(key: string) {
  const entry = getEntry(key);
  const now = Date.now();
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { limited: true, retryAfterMs: entry.blockedUntil - now };
  }
  const recent = entry.failures.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_MINUTE) {
    return { limited: true, retryAfterMs: WINDOW_MS - (now - recent[0]) };
  }
  return { limited: false, retryAfterMs: 0 };
}

export function registerFailure(key: string) {
  const entry = getEntry(key);
  const now = Date.now();
  entry.failures.push(now);
  if (entry.failures.length >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_MS;
  }
}

export function clearRateLimit(key: string) {
  store.delete(key);
}

export function rateLimitKey(userId: string, scope = 'link') {
  return `${scope}:${userId}`;
}

export function clientIp(headers: Headers) {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
