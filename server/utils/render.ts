import {
  CACHE_CONTROL_HEADER,
  Card,
  COLORS,
  CONSTANTS,
  Error404,
  Error419,
  Error502,
  EServiceKindError,
  isValidGitHubLogin,
  parseTrophyParams,
  renderQueryBuilder,
  securityHeaders,
  ServiceError,
  type Theme,
  UserInfo,
} from "~/lib/trophy/index.ts";

/**
 * Dependencies the pure trophy-route logic needs from its host (Nitro in
 * production, hand-rolled test doubles in tests). Kept as plain functions/
 * values so this module never touches Nitro's `useRuntimeConfig`/`useStorage`
 * directly — those resolve to inert fallback stubs outside of a real Nitro
 * build/dev boot (see server/routes/index.get.ts for the real wiring).
 */
export interface RenderDeps {
  tokens: string[];
  resolveUser: (username: string) => Promise<UserInfo | ServiceError>;
}

export interface RenderResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Errors are not cached like trophies: an unknown user (404) is briefly
 * cacheable, but transient failures (rate limit, upstream down, missing
 * token) must not stick in browsers or CDNs for hours.
 */
export const NOT_FOUND_CACHE_CONTROL = "public, max-age=300";
export const TRANSIENT_ERROR_CACHE_CONTROL = "no-store";

function errorResult(status: number, body: string): RenderResult {
  return {
    status,
    headers: {
      "Cache-Control": status === 404 ? NOT_FOUND_CACHE_CONTROL : TRANSIENT_ERROR_CACHE_CONTROL,
      "Content-Type": "text/html; charset=utf-8",
      ...securityHeaders("error"),
    },
    body,
  };
}

/**
 * Pure core of `GET /`: parses params, resolves the user (cache or GitHub),
 * and renders either the SVG trophy card or an HTML error page. Takes no
 * dependency on Nitro/h3 event objects so it can be unit/integration-tested
 * without booting Nitro.
 */
export async function renderTrophyResponse(
  url: URL,
  deps: RenderDeps,
): Promise<RenderResult> {
  const params = parseTrophyParams(url);

  if (!params.username) {
    const baseUrl = `${url.origin}${url.pathname}`;
    return {
      status: 200,
      headers: {
        "Cache-Control": CACHE_CONTROL_HEADER,
        "Content-Type": "text/html; charset=utf-8",
        ...securityHeaders("landing"),
      },
      body: renderQueryBuilder(baseUrl),
    };
  }

  if (deps.tokens.length === 0) {
    return errorResult(502, new Error502("no GitHub token configured").render());
  }

  // Garbage logins can never exist on GitHub: answer 404 without a lookup
  // (and without creating a cache entry per arbitrary string).
  if (!isValidGitHubLogin(params.username)) {
    return errorResult(404, new Error404("User not found").render());
  }

  const result = await deps.resolveUser(params.username);

  if (result instanceof ServiceError) {
    const ErrorCtor = result.kind === EServiceKindError.NOT_FOUND
      ? Error404
      : result.kind === EServiceKindError.RATE_LIMIT
      ? Error419
      : Error502;
    return errorResult(result.code, new ErrorCtor(result.message).render());
  }

  const userInfo = result;

  const theme: Theme = COLORS[params.theme] ?? COLORS.default;
  const card = new Card(
    params.titles,
    params.ranks,
    params.column,
    params.row,
    CONSTANTS.DEFAULT_PANEL_SIZE,
    params.marginW,
    params.marginH,
    params.noBackground,
    params.noFrame,
  );

  return {
    status: 200,
    headers: {
      "Cache-Control": CACHE_CONTROL_HEADER,
      "Content-Type": "image/svg+xml; charset=utf-8",
      ...securityHeaders("svg"),
    },
    body: card.render(userInfo, theme),
  };
}
