/**
 * Lightweight in-process fixed-window limiter.
 *
 * This is intentionally used as a fast first line of defence. For a single
 * VPS instance it is sufficient; Cloudflare/Nginx should enforce a second
 * network-level limit in production.
 */
const buckets = new Map();

export function checkRateLimit(key, limit = 10, windowSeconds = 60) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetTime) {
    const bucket = {
      count: 1,
      resetTime: now + windowSeconds * 1000,
    };
    buckets.set(key, bucket);

    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetTime: bucket.resetTime,
    };
  }

  existing.count += 1;

  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    resetTime: existing.resetTime,
  };
}

export function checkCodRateLimits({ shop, clientIp }) {
  const perClient = checkRateLimit(`cod:client:${shop}:${clientIp}`, 60, 60);
  if (!perClient.allowed) return perClient;

  // Emergency circuit breaker. This does not restrict normal paid traffic.
  return checkRateLimit(`cod:shop:${shop}`, 1200, 60);
}

export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const forwardedIp = forwarded?.split(",")[0]?.trim();

  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    forwardedIp ||
    "unknown"
  );
}

export function resetRateLimit(key) {
  buckets.delete(key);
}

function cleanup() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetTime) buckets.delete(key);
  }
}

const cleanupTimer = setInterval(cleanup, 60_000);
cleanupTimer.unref?.();
