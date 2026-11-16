import { CONSTANTS, CustomURLSearchParams } from "~/lib/trophy/utils.ts";

/**
 * GitHub login rule: 1-39 alphanumerics/hyphens, no leading, trailing or doubled hyphen.
 * Underscores are allowed after the first character (EMU logins like `octocat_acme`, GHES).
 */
const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d_]|-(?=[a-z\d])){0,38}$/i;

export function isValidGitHubLogin(username: string): boolean {
  return GITHUB_LOGIN.test(username);
}

export interface TrophyParams {
  username: string | null;
  theme: string;
  column: number;
  row: number;
  marginW: number;
  marginH: number;
  noBackground: boolean;
  noFrame: boolean;
  titles: string[];
  ranks: string[];
}

function toParams(input: URL | string | URLSearchParams): CustomURLSearchParams {
  if (input instanceof URLSearchParams) {
    return new CustomURLSearchParams(input.toString());
  }
  const url = typeof input === "string" ? new URL(input) : input;
  return new CustomURLSearchParams(url.search.replace(/^\?/, ""));
}

function collect(params: CustomURLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function parseTrophyParams(input: URL | string | URLSearchParams): TrophyParams {
  const p = toParams(input);
  const username = p.get("username");
  return {
    username,
    theme: p.getStringValue("theme", "default"),
    column: p.getNumberValue("column", CONSTANTS.DEFAULT_MAX_COLUMN),
    row: p.getNumberValue("row", CONSTANTS.DEFAULT_MAX_ROW),
    marginW: p.getNumberValue("margin-w", CONSTANTS.DEFAULT_MARGIN_W),
    marginH: p.getNumberValue("margin-h", CONSTANTS.DEFAULT_MARGIN_H),
    noBackground: p.getBooleanValue("no-bg", CONSTANTS.DEFAULT_NO_BACKGROUND),
    noFrame: p.getBooleanValue("no-frame", CONSTANTS.DEFAULT_NO_FRAME),
    titles: collect(p, "title"),
    ranks: collect(p, "rank"),
  };
}
