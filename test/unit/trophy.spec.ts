import { describe, expect, it } from "vitest";
import {
  AccountDurationTrophy,
  AllSuperRankTrophy,
  AncientAccountTrophy,
  Joined2020Trophy,
  LongTimeAccountTrophy,
  MultipleLangTrophy,
  MultipleOrganizationsTrophy,
  OGAccountTrophy,
  TotalCommitTrophy,
  TotalFollowerTrophy,
  TotalIssueTrophy,
  TotalPullRequestTrophy,
  TotalRepositoryTrophy,
  TotalReviewsTrophy,
  TotalStarTrophy,
} from "~/lib/trophy/trophy.ts";
import { RANK } from "~/lib/trophy/utils.ts";

describe("TotalStarTrophy thresholds", () => {
  it.each([
    [0, RANK.UNKNOWN],
    [1, RANK.C],
    [9, RANK.C],
    [10, RANK.B],
    [29, RANK.B],
    [30, RANK.A],
    [49, RANK.A],
    [50, RANK.AA],
    [99, RANK.AA],
    [100, RANK.AAA],
    [199, RANK.AAA],
    [200, RANK.S],
    [699, RANK.S],
    [700, RANK.SS],
    [1999, RANK.SS],
    [2000, RANK.SSS],
    [10000, RANK.SSS],
  ])("score=%i → rank=%s", (score, expected) => {
    expect(new TotalStarTrophy(score).rank).toBe(expected);
  });
});

describe("titles and filterTitles", () => {
  const cases: Array<[new (n: number) => { title: string; filterTitles: string[] }, string, string[]]> = [
    [TotalStarTrophy, "Stars", ["Star", "Stars"]],
    [TotalCommitTrophy, "Commits", ["Commit", "Commits"]],
    [TotalFollowerTrophy, "Followers", ["Follower", "Followers"]],
    [TotalIssueTrophy, "Issues", ["Issue", "Issues"]],
    [TotalPullRequestTrophy, "PullRequest", ["PR", "PullRequest", "Pulls", "Puller"]],
    [TotalRepositoryTrophy, "Repositories", ["Repo", "Repository", "Repositories"]],
    [TotalReviewsTrophy, "Reviews", ["Review", "Reviews"]],
    [AccountDurationTrophy, "Experience", ["Experience", "Duration", "Since"]],
    [MultipleLangTrophy, "MultiLanguage", ["MultipleLang", "MultiLanguage"]],
    [AllSuperRankTrophy, "AllSuperRank", ["AllSuperRank"]],
    [LongTimeAccountTrophy, "LongTimeUser", ["LongTimeUser"]],
    [AncientAccountTrophy, "AncientUser", ["AncientUser"]],
    [OGAccountTrophy, "OGUser", ["OGUser"]],
    [Joined2020Trophy, "Joined2020", ["Joined2020"]],
    [MultipleOrganizationsTrophy, "Organizations", ["Organizations", "Orgs", "Teams"]],
  ];
  it.each(cases)("%o has correct title/filterTitles", (Ctor, title, filters) => {
    const t = new Ctor(0);
    expect(t.title).toBe(title);
    expect(t.filterTitles).toEqual(filters);
  });
});

describe("secret trophies are hidden", () => {
  // Note: AccountDurationTrophy is NOT hidden in upstream, removed from this list per brief.
  const hidden = [
    new MultipleLangTrophy(0),
    new AllSuperRankTrophy(0),
    new LongTimeAccountTrophy(0),
    new AncientAccountTrophy(0),
    new OGAccountTrophy(0),
    new Joined2020Trophy(0),
    new MultipleOrganizationsTrophy(0),
  ];
  it.each(hidden)("%o is hidden", (t) => {
    expect(t.hidden).toBe(true);
  });

  it("AccountDurationTrophy is NOT hidden", () => {
    expect(new AccountDurationTrophy(0).hidden).toBe(false);
  });

  it("AncientAccountTrophy bottomMessage is 'Before 2010'", () => {
    expect(new AncientAccountTrophy(1).bottomMessage).toBe("Before 2010");
  });
  it("OGAccountTrophy bottomMessage is 'Joined 2008'", () => {
    expect(new OGAccountTrophy(1).bottomMessage).toBe("Joined 2008");
  });
  it("Joined2020Trophy bottomMessage is 'Joined 2020'", () => {
    expect(new Joined2020Trophy(1).bottomMessage).toBe("Joined 2020");
  });
  it("AllSuperRankTrophy bottomMessage is 'All S Rank'", () => {
    expect(new AllSuperRankTrophy(1).bottomMessage).toBe("All S Rank");
  });
});
