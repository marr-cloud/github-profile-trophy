import { describe, expect, it } from "vitest";
import {
  abridgeScore,
  CACHE_CONTROL_HEADER,
  CONSTANTS,
  CustomURLSearchParams,
  RANK,
  RANK_ORDER,
} from "~/lib/trophy/utils.ts";

describe("RANK", () => {
  it("has the ten canonical rank values in order", () => {
    expect(RANK_ORDER).toEqual([
      "SECRET", "SSS", "SS", "S", "AAA", "AA", "A", "B", "C", "?",
    ]);
    expect(RANK.UNKNOWN).toBe("?");
  });
});

describe("CONSTANTS", () => {
  it("carries the parity constants", () => {
    expect(CONSTANTS.CACHE_MAX_AGE).toBe(18800);
    expect(CONSTANTS.CDN_CACHE_MAX_AGE).toBe(28800);
    expect(CONSTANTS.STALE_WHILE_REVALIDATE).toBe(86400);
    expect(CONSTANTS.DEFAULT_PANEL_SIZE).toBe(110);
    expect(CONSTANTS.DEFAULT_MAX_COLUMN).toBe(8);
    expect(CONSTANTS.DEFAULT_MAX_ROW).toBe(3);
    expect(CONSTANTS.CACHE_TTL_MS).toBe(4 * 3600 * 1000);
  });
});

describe("CACHE_CONTROL_HEADER", () => {
  it("matches the exact upstream header string", () => {
    expect(CACHE_CONTROL_HEADER).toBe(
      "public, max-age=18800, s-maxage=28800, stale-while-revalidate=86400",
    );
  });
});

describe("abridgeScore", () => {
  it("returns 0pt for |score| < 1", () => {
    expect(abridgeScore(0)).toBe("0pt");
    expect(abridgeScore(0.9)).toBe("0pt");
    expect(abridgeScore(-0.5)).toBe("0pt");
  });
  it("returns integer pt in [1, 999]", () => {
    expect(abridgeScore(1)).toBe("1pt");
    expect(abridgeScore(999)).toBe("999pt");
    expect(abridgeScore(-42)).toBe("-42pt");
  });
  it("returns kpt for |score| > 999", () => {
    expect(abridgeScore(1000)).toBe("1.0kpt");
    expect(abridgeScore(1234)).toBe("1.2kpt");
    expect(abridgeScore(-2500)).toBe("-2.5kpt");
  });
});

describe("CustomURLSearchParams", () => {
  const p = new CustomURLSearchParams("a=hello&n=42&bad=xx&flag=true&flag2=nope");
  it("getStringValue", () => {
    expect(p.getStringValue("a", "z")).toBe("hello");
    expect(p.getStringValue("missing", "z")).toBe("z");
  });
  it("getNumberValue", () => {
    expect(p.getNumberValue("n", 7)).toBe(42);
    expect(p.getNumberValue("bad", 7)).toBe(7);
    expect(p.getNumberValue("missing", 7)).toBe(7);
  });
  it("getBooleanValue", () => {
    expect(p.getBooleanValue("flag", false)).toBe(true);
    expect(p.getBooleanValue("flag2", true)).toBe(false);
    expect(p.getBooleanValue("missing", true)).toBe(true);
  });
});
