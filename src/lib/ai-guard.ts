type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/**
 * Best-effort per-instance protection. This is not a distributed limiter:
 * serverless instances can have separate counters, so platform-level WAF
 * protection requires a Vercel plan that supports IP-based rate-limit keys.
 */
export function checkAiRateLimit(
  request: Request,
  endpoint: "script" | "delivery",
  limit: number,
  windowMs = 60_000,
  now = Date.now(),
): RateLimitResult {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  const key = `${endpoint}:${address}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    if (buckets.size > 5_000) {
      for (const [candidate, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(candidate);
      }
      if (buckets.size > 5_000) buckets.clear();
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function aiRateLimitResponse(retryAfterSeconds: number) {
  return Response.json(
    { error: "Too many AI requests. Please wait a moment and try again." },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterSeconds) } },
  );
}

export function aiRequestTooLarge(request: Request, maxBytes: number) {
  const length = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(length) && length > maxBytes;
}

export function aiRequestSignal(request: Request, timeoutMs = 45_000): AbortSignal {
  return AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
}


/** Browser AI calls must originate from the same host as the app. */
export function isSameOriginAiRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
