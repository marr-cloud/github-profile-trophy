import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { UserInfo } from "~/lib/trophy/user-info.ts";

function loadFixture(name: string) {
  const url = new URL(`../fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

describe("UserInfo.fromCombined", () => {
  it("derives torvalds-like fixture correctly", () => {
    const info = UserInfo.fromCombined(loadFixture("user-torvalds"));
    expect(info.totalCommits).toBe(3200);
    expect(info.totalStargazers).toBe(182000);
    expect(info.totalFollowers).toBe(180000);
    expect(info.totalIssues).toBe(140);
    expect(info.totalOrganizations).toBe(5);
    expect(info.totalPullRequests).toBe(400);
    expect(info.totalReviews).toBe(90);
    expect(info.totalRepositories).toBe(8);
    expect(info.languageCount).toBe(2);
    expect(info.durationYear).toBeGreaterThanOrEqual(14);
    expect(info.ancientAccount).toBe(0);
    expect(info.ogAccount).toBe(0);
    expect(info.joined2020).toBe(0);
  });

  it("empty fixture is all zeros", () => {
    const info = UserInfo.fromCombined(loadFixture("user-empty"));
    expect(info.totalCommits).toBe(0);
    expect(info.totalStargazers).toBe(0);
    expect(info.languageCount).toBe(0);
    expect(info.totalRepositories).toBe(0);
  });

  it("secret-earner fixture: joined2020=1 and orgs=4", () => {
    const info = UserInfo.fromCombined(loadFixture("user-secret-earner"));
    expect(info.joined2020).toBe(1);
    expect(info.totalOrganizations).toBe(4);
    expect(info.languageCount).toBeGreaterThanOrEqual(10);
  });
});

describe("UserInfo round-trip", () => {
  it("JSON.stringify then fromJSON restores props", () => {
    const info = UserInfo.fromCombined(loadFixture("user-torvalds"));
    const s = JSON.stringify(info);
    const back = UserInfo.fromJSON(s);
    expect(back.totalCommits).toBe(info.totalCommits);
    expect(back.languageCount).toBe(info.languageCount);
  });
});
