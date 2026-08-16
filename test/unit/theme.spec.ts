import { describe, expect, it } from "vitest";
import { COLORS, THEME_NAMES } from "~/lib/trophy/theme.ts";

const REQUIRED_KEYS = [
  "BACKGROUND", "TITLE", "ICON_CIRCLE", "TEXT", "LAUREL",
  "SECRET_RANK_1", "SECRET_RANK_2", "SECRET_RANK_3", "SECRET_RANK_TEXT",
  "NEXT_RANK_BAR",
  "S_RANK_BASE", "S_RANK_SHADOW", "S_RANK_TEXT",
  "A_RANK_BASE", "A_RANK_SHADOW", "A_RANK_TEXT",
  "B_RANK_BASE", "B_RANK_SHADOW", "B_RANK_TEXT",
  "DEFAULT_RANK_BASE", "DEFAULT_RANK_SHADOW", "DEFAULT_RANK_TEXT",
] as const;

const EXPECTED_THEMES = [
  "default","dracula","flat","onedark","gruvbox","monokai","nord","discord",
  "chalk","alduin","darkhub","juicyfresh","oldie","buddhism","radical",
  "onestar","algolia","gitdimmed","tokyonight","matrix","apprentice",
  "dark_dimmed","dark_lover","kimbie_dark","aura",
];

describe("COLORS", () => {
  it("exposes exactly the 25 upstream themes", () => {
    expect([...THEME_NAMES].sort()).toEqual([...EXPECTED_THEMES].sort());
    expect(THEME_NAMES.length).toBe(25);
  });

  it.each(EXPECTED_THEMES)("theme %s has every required key populated", (name) => {
    const t = COLORS[name]!;
    expect(t).toBeDefined();
    for (const k of REQUIRED_KEYS) {
      expect(typeof t[k as keyof typeof t]).toBe("string");
      expect((t[k as keyof typeof t] as string).length).toBeGreaterThan(0);
    }
  });

  it("default and flat both have LAUREL=#009366 (spot-check)", () => {
    expect(COLORS.default.LAUREL).toBe("#009366");
    expect(COLORS.flat.LAUREL).toBe("#009366");
  });

  it("dracula BACKGROUND is #282a36 (spot-check)", () => {
    expect(COLORS.dracula.BACKGROUND).toBe("#282a36");
  });
});
