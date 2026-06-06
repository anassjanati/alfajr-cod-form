import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimit } from "./rateLimiter";

describe("Rate Limiter", () => {
  beforeEach(() => {
    resetRateLimit("test-key");
  });

  it("should allow first request", () => {
    const result = checkRateLimit("test-key", 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("should allow requests within limit", () => {
    const key = "test-key";
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, 5, 60);
      expect(result.allowed).toBe(true);
    }
  });

  it("should block request when limit exceeded", () => {
    const key = "test-key";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60);
    }
    const result = checkRateLimit(key, 5, 60);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should track remaining count correctly", () => {
    const key = "test-key";
    checkRateLimit(key, 10, 60);
    const result = checkRateLimit(key, 10, 60);
    expect(result.remaining).toBe(8);
  });

  it("should use default limit of 10", () => {
    const key = "test-key-2";
    for (let i = 0; i < 10; i++) {
      checkRateLimit(key);
    }
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(false);
  });

  it("should track different keys separately", () => {
    const result1 = checkRateLimit("key-1", 2, 60);
    const result2 = checkRateLimit("key-2", 2, 60);
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result1.remaining).toBe(1);
    expect(result2.remaining).toBe(1);
  });

  it("should return resetTime", () => {
    const result = checkRateLimit("test-key", 5, 60);
    expect(result.resetTime).toBeDefined();
    expect(result.resetTime).toBeGreaterThan(Date.now());
  });
});
