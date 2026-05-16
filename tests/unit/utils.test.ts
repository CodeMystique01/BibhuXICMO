import { describe, it, expect } from "vitest";
import { slugify, truncate, formatCurrency, formatNumber } from "@/shared/utils";

describe("utils", () => {
  it("slugify lowercases + hyphenates + strips punctuation", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("Foo  Bar — Baz")).toBe("foo-bar-baz");
    expect(slugify("  --weird--  ")).toBe("weird");
  });

  it("truncate respects the max length", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
    expect(truncate("short", 10)).toBe("short");
  });

  it("formatCurrency formats USD without cents", () => {
    expect(formatCurrency(99)).toBe("$99");
    expect(formatCurrency(14000)).toBe("$14,000");
  });

  it("formatNumber formats with thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});
