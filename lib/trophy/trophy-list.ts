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
  Trophy,
} from "~/lib/trophy/trophy.ts";
import { UserInfo } from "~/lib/trophy/user-info.ts";
import { RANK, RANK_ORDER } from "~/lib/trophy/utils.ts";

export function splitFilterValues(
  values: Array<string>,
): { include: Array<string>; exclude: Array<string> } {
  const include: Array<string> = [];
  const exclude: Array<string> = [];
  for (const value of values) {
    if (value.startsWith("-")) {
      const rest = value.substring(1);
      if (rest !== "") exclude.push(rest);
    } else if (value !== "") {
      include.push(value);
    }
  }
  return { include, exclude };
}

export class TrophyList {
  private trophies = new Array<Trophy>();
  constructor(userInfo: UserInfo) {
    // Base trophies
    this.trophies.push(
      new TotalStarTrophy(userInfo.totalStargazers),
      new TotalCommitTrophy(userInfo.totalCommits),
      new TotalFollowerTrophy(userInfo.totalFollowers),
      new TotalIssueTrophy(userInfo.totalIssues),
      new TotalPullRequestTrophy(userInfo.totalPullRequests),
      new TotalRepositoryTrophy(userInfo.totalRepositories),
      new TotalReviewsTrophy(userInfo.totalReviews),
    );
    // Secret trophies
    this.trophies.push(
      new AllSuperRankTrophy(this.isAllSRank),
      new MultipleLangTrophy(userInfo.languageCount),
      new LongTimeAccountTrophy(userInfo.durationYear),
      new AncientAccountTrophy(userInfo.ancientAccount),
      new OGAccountTrophy(userInfo.ogAccount),
      new Joined2020Trophy(userInfo.joined2020),
      new MultipleOrganizationsTrophy(userInfo.totalOrganizations),
      new AccountDurationTrophy(userInfo.durationDays),
    );
  }
  get length() {
    return this.trophies.length;
  }
  get getArray() {
    return this.trophies;
  }
  private get isAllSRank() {
    return this.trophies.every((trophy) => trophy.rank.slice(0, 1) == RANK.S)
      ? 1
      : 0;
  }
  filterByHidden() {
    this.trophies = this.trophies.filter((trophy) =>
      !trophy.hidden || trophy.rank !== RANK.UNKNOWN
    );
  }
  filterByTitles(values: Array<string>) {
    const { include, exclude } = splitFilterValues(values);
    this.trophies = this.trophies.filter((trophy) => {
      const names = trophy.filterTitles;
      if (include.length > 0 && !names.some((n) => include.includes(n))) {
        return false;
      }
      return !names.some((n) => exclude.includes(n));
    });
  }
  filterByRanks(values: Array<string>) {
    const { include, exclude } = splitFilterValues(values);
    this.trophies = this.trophies.filter((trophy) => {
      if (include.length > 0 && !include.includes(trophy.rank)) return false;
      return !exclude.includes(trophy.rank);
    });
  }
  sortByRank() {
    this.trophies = this.trophies.toSorted((a: Trophy, b: Trophy) =>
      RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank)
    );
  }
}
