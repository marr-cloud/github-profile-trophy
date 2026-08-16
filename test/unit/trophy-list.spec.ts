import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TrophyList } from "~/lib/trophy/trophy-list.ts";
import { UserInfo } from "~/lib/trophy/user-info.ts";

function load(name: string) {
  return UserInfo.fromCombined(
    JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${name}.json`, import.meta.url)), "utf8")),
  );
}

describe("TrophyList", () => {
  it("constructs with 15 trophies", () => {
    expect(new TrophyList(load("user-empty")).length).toBe(15);
  });
  it("filterByHidden hides secret trophies with UNKNOWN rank", () => {
    const list = new TrophyList(load("user-empty"));
    list.filterByHidden();
    expect(list.length).toBe(7); // only the 7 non-hidden base trophies remain
    for (const t of list.getArray) expect(t.hidden).toBe(false);
  });
  it("filterByTitles keeps only requested titles", () => {
    const list = new TrophyList(load("user-torvalds"));
    list.filterByTitles(["Stars", "Followers"]);
    expect(list.getArray.map((t) => t.title).sort()).toEqual(["Followers", "Stars"]);
  });
  it("filterByExclusionTitles drops the '-Title' entries", () => {
    const list = new TrophyList(load("user-torvalds"));
    list.filterByExclusionTitles(["-Stars"]);
    expect(list.getArray.map((t) => t.title)).not.toContain("Stars");
  });
  it("filterByRanks with negation keeps trophies NOT matching", () => {
    const list = new TrophyList(load("user-torvalds"));
    list.filterByRanks(["-?"]);
    for (const t of list.getArray) expect(t.rank).not.toBe("?");
  });
  it("sortByRank orders by RANK_ORDER index (SECRET first)", () => {
    const list = new TrophyList(load("user-torvalds"));
    list.sortByRank();
    const ranks = list.getArray.map((t) => t.rank);
    const order = ["SECRET","SSS","SS","S","AAA","AA","A","B","C","?"];
    for (let i = 1; i < ranks.length; i++) {
      expect(order.indexOf(ranks[i])).toBeGreaterThanOrEqual(order.indexOf(ranks[i - 1]));
    }
  });
});
