export enum RANK {
  SECRET = "SECRET",
  SSS = "SSS",
  SS = "SS",
  S = "S",
  AAA = "AAA",
  AA = "AA",
  A = "A",
  B = "B",
  C = "C",
  UNKNOWN = "?",
}

export const RANK_ORDER: RANK[] = Object.values(RANK);

const HOUR_MS = 60 * 60 * 1000;

export const CONSTANTS = {
  CACHE_MAX_AGE: 18800,
  CDN_CACHE_MAX_AGE: 28800,
  STALE_WHILE_REVALIDATE: 86400,
  DEFAULT_PANEL_SIZE: 110,
  DEFAULT_MAX_COLUMN: 8,
  DEFAULT_MAX_ROW: 3,
  DEFAULT_MARGIN_W: 0,
  DEFAULT_MARGIN_H: 0,
  DEFAULT_NO_BACKGROUND: false,
  DEFAULT_NO_FRAME: false,
  DEFAULT_GITHUB_API: "https://api.github.com/graphql",
  DEFAULT_GITHUB_RETRY_DELAY: 500,
  REVALIDATE_TIME: HOUR_MS * 6,
  CACHE_TTL_MS: HOUR_MS * 4,
} as const;

export const CACHE_CONTROL_HEADER =
  "public, max-age=18800, s-maxage=28800, stale-while-revalidate=86400";

export class CustomURLSearchParams extends URLSearchParams {
  getStringValue(key: string, defaultValue: string): string {
    if (!super.has(key)) return defaultValue;
    const v = super.get(key);
    return v === null ? defaultValue : v.toString();
  }
  getNumberValue(key: string, defaultValue: number): number {
    if (!super.has(key)) return defaultValue;
    const v = super.get(key);
    if (v === null) return defaultValue;
    const parsed = parseInt(v, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  getBooleanValue(key: string, defaultValue: boolean): boolean {
    if (!super.has(key)) return defaultValue;
    const v = super.get(key);
    return v !== null && v.toString() === "true";
  }
}

export function abridgeScore(score: number): string {
  if (Math.abs(score) < 1) return "0pt";
  if (Math.abs(score) > 999) {
    return (Math.sign(score) * (Math.abs(score) / 1000)).toFixed(1) + "kpt";
  }
  return (Math.sign(score) * Math.abs(score)).toString() + "pt";
}
