import { beforeEach, describe, expect, it } from "vitest";
import { aiRequestTooLarge, checkAiRateLimit } from "@/lib/ai-guard";

describe("AI request protection", () => {
  it("limits repeated script requests from the same client", () => {
    const request = new Request("https://example.test/api/script", { headers: { "x-forwarded-for": "203.0.113.10" } });
    expect(checkAiRateLimit(request, "script", 2, 60_000, 1_000).allowed).toBe(true);
    expect(checkAiRateLimit(request, "script", 2, 60_000, 1_001).allowed).toBe(true);
    const blocked = checkAiRateLimit(request, "script", 2, 60_000, 1_002);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("keeps endpoint and client limits separate and resets expired windows", () => {
    const request = new Request("https://example.test/api/script", { headers: { "x-forwarded-for": "203.0.113.11" } });
    expect(checkAiRateLimit(request, "script", 1, 1_000, 1_000).allowed).toBe(true);
    expect(checkAiRateLimit(request, "delivery", 1, 1_000, 1_001).allowed).toBe(true);
    expect(checkAiRateLimit(request, "script", 1, 1_000, 2_001).allowed).toBe(true);
  });

  it("rejects requests whose declared body exceeds the endpoint cap", () => {
    const small = new Request("https://example.test", { headers: { "content-length": "100" } });
    const large = new Request("https://example.test", { headers: { "content-length": "12001" } });
    expect(aiRequestTooLarge(small, 12_000)).toBe(false);
    expect(aiRequestTooLarge(large, 12_000)).toBe(true);
  });
});
