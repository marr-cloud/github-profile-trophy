import { describe, expect, it } from "vitest";
import { Card } from "~/lib/trophy/card.ts";
import { COLORS } from "~/lib/trophy/theme.ts";
import { UserInfo } from "~/lib/trophy/user-info.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const info = UserInfo.fromCombined(JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/user-torvalds.json", import.meta.url)), "utf8")));

describe("Card layout math", () => {
  it("default 8 x 3 has width 880 (torvalds has 10 visible trophies = 2 rows, height 220)", () => {
    const svg = new Card([], [], 8, 3, 110, 0, 0, false, false).render(info, COLORS.flat);
    expect(svg).toContain('width="880"');
    expect(svg).toContain('height="220"');
  });
  it("adaptive column (-1) sets width to trophyCount * 110", () => {
    const list = new Card([], [], -1, 1, 110, 0, 0, false, false).render(info, COLORS.flat);
    // torvalds: 10 visible trophies after filterByHidden → width=1100
    expect(list).toContain('width="1100"');
  });
  it("with margin-w=10, 8 columns: width = 8*110 + 7*10 = 950", () => {
    const svg = new Card([], [], 8, 3, 110, 10, 0, false, false).render(info, COLORS.flat);
    expect(svg).toContain('width="950"');
  });
  it("with margin-h=10, 3 rows: height = 2*110 + 1*10 = 230 (torvalds has 10 trophies)", () => {
    const svg = new Card([], [], 8, 3, 110, 0, 10, false, false).render(info, COLORS.flat);
    expect(svg).toContain('height="230"');
  });
});

describe("Card SVG shape", () => {
  it("emits <svg viewBox> at the outer level", () => {
    const svg = new Card([], [], 8, 3, 110, 0, 0, false, false).render(info, COLORS.flat);
    expect(svg).toMatch(/<svg\s+width="\d+"\s+height="\d+"\s+viewBox="0 0 \d+ \d+"/);
  });
});
