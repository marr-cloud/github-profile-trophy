import { describe, expect, it } from "vitest";
import { getNextRankBar, getTrophyIcon } from "~/lib/trophy/icons.ts";
import { RANK } from "~/lib/trophy/utils.ts";
import { COLORS } from "~/lib/trophy/theme.ts";

describe("getTrophyIcon", () => {
  it("SECRET rank uses SECRET_RANK_* gradient stops", () => {
    const svg = getTrophyIcon(COLORS.default, RANK.SECRET);
    expect(svg).toContain(COLORS.default.SECRET_RANK_1);
    expect(svg).toContain(COLORS.default.SECRET_RANK_2);
    expect(svg).toContain(COLORS.default.SECRET_RANK_3);
  });
  it("S/AAA/SSS use S_RANK_BASE + laurel", () => {
    for (const rank of [RANK.S, RANK.SS, RANK.SSS]) {
      const svg = getTrophyIcon(COLORS.default, rank);
      expect(svg).toContain(COLORS.default.S_RANK_BASE);
      expect(svg).toContain(COLORS.default.LAUREL);
    }
  });
  it("B uses B_RANK_BASE and no laurel", () => {
    const svg = getTrophyIcon(COLORS.default, RANK.B);
    expect(svg).toContain(COLORS.default.B_RANK_BASE);
    expect(svg).not.toContain(COLORS.default.LAUREL);
  });
  it("UNKNOWN uses DEFAULT_RANK_BASE", () => {
    const svg = getTrophyIcon(COLORS.default, RANK.UNKNOWN);
    expect(svg).toContain(COLORS.default.DEFAULT_RANK_BASE);
  });
});

describe("getNextRankBar", () => {
  it("embeds keyframes and progress rect id", () => {
    const s = getNextRankBar("Stars", 0.5, "#abc");
    expect(s).toContain("@keyframes StarsRankAnimation");
    expect(s).toContain('id="Stars-rank-progress"');
    expect(s).toContain("40px"); // 80 * 0.5
    expect(s).toContain("#abc");
  });
});
