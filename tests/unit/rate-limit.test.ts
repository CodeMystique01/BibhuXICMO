import { describe, it, expect } from "vitest";
import { rateLimit } from "@/backend/rate-limit";

describe("rate-limit", () => {
  it("allows up to the limit in a single burst", () => {
    const key = `test:${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const r = rateLimit(key, { limit: 5, windowMs: 1000 });
      expect(r.ok).toBe(true);
    }
    const r = rateLimit(key, { limit: 5, windowMs: 1000 });
    expect(r.ok).toBe(false);
  });

  it("refills over time", async () => {
    const key = `refill:${Date.now()}`;
    for (let i = 0; i < 5; i++) rateLimit(key, { limit: 5, windowMs: 100 });
    await new Promise((r) => setTimeout(r, 120));
    const r = rateLimit(key, { limit: 5, windowMs: 100 });
    expect(r.ok).toBe(true);
  });
});
