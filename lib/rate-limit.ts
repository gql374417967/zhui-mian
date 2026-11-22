type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const maxBuckets = 2000;

function sweep(now: number) {
  if (buckets.size < maxBuckets) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// 单实例内存限流：同一浏览器会话在窗口期内超过上限时拒绝。
export function rateLimit(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const, retryAfter: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false as const, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true as const, retryAfter: 0 };
}

export function requestSessionKey(request: Request) {
  const session = request.headers.get("x-session-id")?.trim();
  if (session && session.length <= 100) return session;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "anonymous";
}
