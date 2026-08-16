import { describe, expect, it } from "vitest";
import { parseTrophyParams } from "~/lib/trophy/params.ts";

describe("parseTrophyParams", () => {
  it("returns defaults when only username present", () => {
    const p = parseTrophyParams("https://x/?username=alice");
    expect(p).toEqual({
      username: "alice",
      theme: "default",
      column: 8,
      row: 3,
      marginW: 0,
      marginH: 0,
      noBackground: false,
      noFrame: false,
      titles: [],
      ranks: [],
    });
  });
  it("username missing → null", () => {
    expect(parseTrophyParams("https://x/").username).toBe(null);
  });
  it("column=-1 accepted (adaptive)", () => {
    expect(parseTrophyParams("https://x/?username=a&column=-1").column).toBe(-1);
  });
  it("titles CSV expands and trims", () => {
    const p = parseTrophyParams("https://x/?username=a&title=Stars,%20Followers&title=Issues");
    expect(p.titles).toEqual(["Stars", "Followers", "Issues"]);
  });
  it("ranks with negations preserved", () => {
    const p = parseTrophyParams("https://x/?username=a&rank=-?,S");
    expect(p.ranks).toEqual(["-?", "S"]);
  });
  it("no-bg=true and no-frame=true", () => {
    const p = parseTrophyParams("https://x/?username=a&no-bg=true&no-frame=true");
    expect(p.noBackground).toBe(true);
    expect(p.noFrame).toBe(true);
  });
  it("margin-w and margin-h numeric", () => {
    const p = parseTrophyParams("https://x/?username=a&margin-w=15&margin-h=25");
    expect(p.marginW).toBe(15);
    expect(p.marginH).toBe(25);
  });
  it("invalid integer falls back to default", () => {
    expect(parseTrophyParams("https://x/?username=a&column=abc").column).toBe(8);
  });
  it("accepts a URLSearchParams directly", () => {
    const usp = new URLSearchParams("username=bob&theme=dracula");
    expect(parseTrophyParams(usp).theme).toBe("dracula");
    expect(parseTrophyParams(usp).username).toBe("bob");
  });
});
