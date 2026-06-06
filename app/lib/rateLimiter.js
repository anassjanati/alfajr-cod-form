const requestCounts = new Map();

export function checkRateLimit(key, limit = 10, windowSeconds = 60) {
  const now = Date.now();

  if (!requestCounts.has(key)) {
    requestCounts.set(key, { count: 1, resetTime: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, resetTime: requestCounts.get(key).resetTime };
  }

  const current = requestCounts.get(key);

  if (now > current.resetTime) {
    requestCounts.set(key, { count: 1, resetTime: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, resetTime: requestCounts.get(key).resetTime };
  }

  current.count++;
  const allowed = current.count <= limit;
  const remaining = Math.max(0, limit - current.count);

  return { allowed, remaining, resetTime: current.resetTime };
}

export function resetRateLimit(key) {
  requestCounts.delete(key);
}

export function cleanup() {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (now > value.resetTime) {
      requestCounts.delete(key);
    }
  }
}

setInterval(cleanup, 60 * 1000);
