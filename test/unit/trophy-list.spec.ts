import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { splitFilterValues, TrophyList } from "~/lib/trophy/trophy-list.ts";
import { UserInfo } from "~/lib/trophy/user-info.ts";

function load(name: string) {
  return UserInfo.fromCombined(
    JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${name}.json`, import.meta.url)), "utf8")),
  );
}

function filtered() {
  const list = new TrophyList(load("user-torvalds"));
  list.filterByHidden();
  return list;
}
const titles = (list: TrophyList) => list.getArray.map((t) => t.title);

describe("TrophyList", () => {
  it("constructs with 15 trophies", () => {
    expect(new TrophyList(load("user-empty")).length).toBe(15);
  });
  it("filterByHidden hides secret trophies with UNKNOWN rank", () => {
    const list = new TrophyList(load("user-empty"));
    list.filterByHidden();
    expect(list.length).toBe(8); // 7 base + Experience (non-hidden, has rank)
    for (const t of list.getArray) expect(t.hidden).toBe(false);
  });
  it("filterByTitles keeps only requested titles", () => {
    const list = new TrophyList(load("user-torvalds"));
    list.filterByTitles(["Stars", "Followers"]);
    expect(list.getArray.map((t) => t.title).sort()).toEqual(["Followers", "Stars"]);
  });
  it("splitFilterValues separates includes and excludes, dropping empties", () => {
    expect(splitFilterValues(["S", "-C", "-", "", "-SS"])).toEqual({ include: ["S"], exclude: ["C", "SS"] });
  });
  it("filterByTitles excludes via alias", () => {
    const list = filtered();
    list.filterByTitles(["-Star"]);
    expect(titles(list)).not.toContain("Stars");
    expect(list.length).toBe(9);
  });
  it("filterByTitles excludes via main name", () => {
    const list = filtered();
    list.filterByTitles(["-Stars"]);
    expect(titles(list)).not.toContain("Stars");
    expect(list.length).toBe(9);
  });
  it("filterByTitles exclude wins over include", () => {
    const list = filtered();
    list.filterByTitles(["Star", "-Stars"]);
    expect(list.length).toBe(0);
  });
  it("filterByTitles mixes includes with an alias exclude", () => {
    const list = filtered();
    list.filterByTitles(["Stars", "Followers", "-Follower"]);
    expect(titles(list)).toEqual(["Stars"]);
  });
  it("filterByTitles includes by alias", () => {
    const list = filtered();
    list.filterByTitles(["Repo", "PR"]);
    expect(titles(list).sort()).toEqual(["PullRequest", "Repositories"]);
  });
  it("filterByRanks exclude-only removes those ranks", () => {
    const list = filtered();
    list.filterByRanks(["-C"]);
    expect(list.length).toBe(9);
    for (const t of list.getArray) expect(t.rank).not.toBe("C");
  });
  it("filterByRanks include restricts, exclude removes", () => {
    const list = filtered();
    list.filterByRanks(["S", "-C"]);
    expect(list.length).toBe(1);
    for (const t of list.getArray) expect(t.rank).toBe("S");
  });
  it("filterByRanks exclude wins over include", () => {
    const list = filtered();
    list.filterByRanks(["C", "-C"]);
    expect(list.length).toBe(0);
  });
  it("filterByRanks ignores a bare '-'", () => {
    const list = filtered();
    list.filterByRanks(["-"]);
    expect(list.length).toBe(10);
  });
  it("filterByRanks is case-sensitive", () => {
    const list = filtered();
    list.filterByRanks(["s"]);
    expect(list.length).toBe(0);
  });
  it("filterByRanks S matches S only, not SS/SSS", () => {
    const list = filtered();
    list.filterByRanks(["S"]);
    expect(list.length).toBe(1);
    expect(list.getArray[0].rank).toBe("S");
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
