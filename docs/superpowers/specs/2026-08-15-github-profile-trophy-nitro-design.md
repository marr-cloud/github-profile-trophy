# GitHub Profile Trophy — Vendor-Agnostic Nitro Port

**Date:** 2026-08-15
**Status:** Draft (pending user review)
**Owners:** mauricio.rodriguez@ado-tech.com

## 1. Overview

Reimplement `ryo-ma/github-profile-trophy` on top of **Nitro v3 + Vite + h3** so the same URL (`GET /?username=...`) returns a byte-similar SVG, while removing the Deno-only runtime coupling and letting the app deploy to any Nitro preset (node-server, vercel, cloudflare, deno-deploy, netlify, bun, aws-lambda, …).

The port keeps 100 % of the visible surface: same query parameters, same 24 themes, same 15 trophies, same rank ladder, same Cache-Control semantics, same SVG geometry (viewBox / panel size / animations).

## 2. Goals and non-goals

**Goals**
- Drop-in URL compatibility: existing READMEs pointing at the new host render identical badges.
- Vendor-agnostic runtime: no Deno globals, no Vercel SDKs, no Cloudflare bindings in the domain code.
- Pure domain core under `~/lib/trophy/*` so vitest can exercise it without booting Nitro.
- Multi-token retry (rotating GitHub tokens) — parity with upstream's `GITHUB_TOKEN1/2`.
- Cache backed by Nitro Storage — driver chosen by env at deploy time (memory / redis / cloudflare-kv / …).
- Vitest unit + integration suite; landing page (`/`) with the trophy 🏆 favicon.

**Non-goals**
- Adding new themes/trophies/params not present in upstream.
- Replacing GraphQL with REST or introducing multi-provider abstraction (GitLab, Gitea).
- Server-side rendering of the HTML shell — landing stays SPA via Vite.
- Static Render Regeneration wrapper (upstream's `staticRenderRegeneration`); Nitro's built-in caching supersedes it.

## 3. Parity surface (locked)

### 3.1 Endpoint
- `GET /` returns `image/svg+xml`.
- `GET /` **without** `username` returns HTML (400) with the same recovery form as upstream.
- `GET /` on transient GitHub errors returns HTML with status 419 / 404 / 502 as upstream does.
- All error responses carry the same `Cache-Control` as success responses (parity).

### 3.2 Query parameters (defaults from upstream `CONSTANTS`)

| Name       | Type     | Default   | Notes                                                     |
|------------|----------|-----------|-----------------------------------------------------------|
| `username` | string   | *(req'd)* | Missing → 400 HTML form                                   |
| `theme`    | string   | `default` | Unknown value falls back to `default` silently            |
| `column`   | integer  | `8`       | `-1` → adaptive width (`column = trophy count`)           |
| `row`      | integer  | `3`       |                                                           |
| `margin-w` | integer  | `0`       |                                                           |
| `margin-h` | integer  | `0`       |                                                           |
| `no-bg`    | boolean  | `false`   | `"true"` → true, anything else → default                  |
| `no-frame` | boolean  | `false`   | idem                                                      |
| `title`    | CSV list | `[]`      | `-x` excludes; empty = all                                |
| `rank`     | CSV list | `[]`      | `-x` excludes; empty = all                                |

Parsing helpers mirror upstream `CustomURLSearchParams`:
- `getStringValue`, `getNumberValue` (NaN → default), `getBooleanValue` (`"true"` = true).
- `title` / `rank` collected via `params.getAll(key).flatMap(s => s.split(",")).map(trim)`.

### 3.3 Themes (24)

`default, flat, onedark, gruvbox, dracula, monokai, chalk, nord, alduin, darkhub, juicyfresh, buddhism, oldie, radical, onestar, discord, algolia, gitdimmed, tokyonight, matrix, apprentice, dark_dimmed, dark_lover, kimbie_dark, aura`.

Each theme is the same 22-key palette (`BACKGROUND`, `TITLE`, `ICON_CIRCLE`, `TEXT`, `LAUREL`, `SECRET_RANK_1..3`, `SECRET_RANK_TEXT`, `NEXT_RANK_BAR`, `S_/A_/B_RANK_BASE/SHADOW/TEXT`, `DEFAULT_RANK_BASE/SHADOW/TEXT`). Values are ported verbatim from upstream `src/theme.ts`.

### 3.4 Ranks

`SECRET, SSS, SS, S, AAA, AA, A, B, C, ?` — enum values used both as ordering (index in that array) and as CSS/SVG string identifiers.

### 3.5 Trophies (15) — thresholds ported verbatim

| Class                       | title            | filterTitles                            | Rank thresholds (SSS…C) or SECRET score |
|-----------------------------|------------------|-----------------------------------------|-----------------------------------------|
| `TotalStarTrophy`           | Stars            | Star, Stars                             | 2000/700/200/100/50/30/10/1             |
| `TotalCommitTrophy`         | Commits          | Commit, Commits                         | 4000/2000/1000/500/200/100/10/1         |
| `TotalFollowerTrophy`       | Followers        | Follower, Followers                     | 1000/400/200/100/50/20/10/1             |
| `TotalIssueTrophy`          | Issues           | Issue, Issues                           | 1000/500/200/100/50/20/10/1             |
| `TotalPullRequestTrophy`    | PullRequest      | PR, PullRequest, Pulls, Puller          | 1000/500/200/100/50/20/10/1             |
| `TotalRepositoryTrophy`     | Repositories     | Repo, Repository, Repositories          | 50/45/40/35/30/20/10/1                  |
| `TotalReviewsTrophy`        | Reviews          | Review, Reviews                         | 70/57/45/30/20/8/3/1                    |
| `AccountDurationTrophy`     | Experience       | Experience, Duration, Since             | 70/55/40/28/18/11/6/2                   |
| `MultipleLangTrophy`        | MultiLanguage    | MultipleLang, MultiLanguage             | SECRET @ 10 langs (hidden)              |
| `AllSuperRankTrophy`        | AllSuperRank     | AllSuperRank                            | SECRET @ 1 (hidden; all base = S-tier)  |
| `LongTimeAccountTrophy`     | LongTimeUser     | LongTimeUser                            | SECRET @ 10 years (hidden)              |
| `AncientAccountTrophy`      | AncientUser      | AncientUser                             | SECRET @ 1 (hidden; earliest ≤ 2010)    |
| `OGAccountTrophy`           | OGUser           | OGUser                                  | SECRET @ 1 (hidden; earliest ≤ 2008)    |
| `Joined2020Trophy`          | Joined2020       | Joined2020                              | SECRET @ 1 (hidden; earliest year = 2020) |
| `MultipleOrganizationsTrophy` | Organizations  | Organizations, Orgs, Teams              | SECRET @ 3 orgs (hidden)                |

Trophy messages (`topMessage`) and `bottomMessage` overrides preserved verbatim (e.g. `"Ancient User" / "Before 2010"`, `"OG User" / "Joined 2008"`).

### 3.6 GitHub GraphQL (single combined query)

Preserved verbatim from `src/Schemas/index.ts::queryUserAll`:
- `user(login:$username)` selects `createdAt`, `contributionsCollection { totalCommitContributions, restrictedContributionsCount, totalPullRequestReviewContributions }`, `organizations(first:1).totalCount`, `followers(first:1).totalCount`, `openIssues: issues(states:OPEN).totalCount`, `closedIssues: issues(states:CLOSED).totalCount`, `pullRequests(first:1).totalCount`, `repositories(first:50, ownerAffiliations:OWNER, orderBy:{direction:DESC, field:STARGAZERS}) { totalCount; nodes { languages(first:2, orderBy:{direction:DESC, field:SIZE}) { nodes { name } }; stargazerCount; createdAt } }`.

### 3.7 SVG geometry (frozen)

- Panel size `110`, viewBox per panel `0 0 110 110`.
- Card: `width = panelSize·cols + marginW·(cols-1)`, `height = panelSize·rows + marginH·(rows-1)`.
- Rows: `min(ceil(trophies/cols), maxRow)`.
- Font stack: `Segoe UI, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji`.
- Trophy icon SVG paths (base cup + circle + rank letter + laurel leaves + double/triple rank duplicates for A/AAA/SS/SSS/…), gradient `<linearGradient id="${rank}" gradientTransform="rotate(45)">`, next-rank progress bar with `<style>@keyframes …RankAnimation {…}</style>` — all copied byte-for-byte from `src/icons.ts` / `src/trophy.ts`.

### 3.8 Cache-Control header

`public, max-age=18800, s-maxage=28800, stale-while-revalidate=86400` on every successful SVG **and** on every error HTML response.

## 4. Architecture (Approach C — pure core + Nitro adapter)

```
Request
  │
  ▼
server/routes/index.get.ts   ← thin adapter (parses query, sets headers)
  │  parseTrophyParams()
  │  fetchUserInfo(username) ─────► ~/lib/trophy/github.ts
  │                                    │ ofetch → api.github.com/graphql
  │                                    │ rotates GITHUB_TOKENS with Retry
  │                                    └─ returns UserInfo | ServiceError
  │  renderCard(userInfo, params)  ─► ~/lib/trophy/card.ts
  │                                    │ TrophyList → filters → sort
  │                                    │ each Trophy.render(theme, x, y, …)
  │                                    │  → getTrophyIcon(theme, rank)
  │                                    │  → getNextRankBar(title, %, color)
  │                                    └─ returns SVG string
  ▼
Response: image/svg+xml + Cache-Control
```

The `~/lib/trophy` core has **no** Nitro / h3 / Node imports. Every function is deterministic given `(userInfo, params, theme)`. This is what unlocks vitest-only testing.

## 5. Directory layout

```
lib/trophy/
  utils.ts              # RANK enum, RANK_ORDER, CONSTANTS, abridgeScore, CustomURLSearchParams
  theme.ts              # Theme interface + COLORS record (24 themes)
  icons.ts              # leafIcon, getTrophyIcon, getNextRankBar
  trophy.ts             # Trophy base class + 15 subclasses
  trophy-list.ts        # TrophyList (filters + sort)
  user-info.ts          # GitHubUser* types + UserInfo class (derivations)
  card.ts               # Card (layout math + SVG assembly)
  github.ts             # queryUserAll + fetchUserInfo (uses ofetch + retry)
  error-page.ts         # BaseError + Error400/404/419/502 (HTML shells)
  params.ts             # parseTrophyParams(url) → TrophyParams
  index.ts              # re-exports for consumers

server/
  routes/
    index.get.ts        # GET / — adapter (SVG or Error HTML)
    favicon.ico.get.ts  # optional binary favicon fallback
  utils/
    cache.ts            # useTrophyCache() → Nitro storage wrapper (v1-{username})

app/
  entry-client.ts       # unchanged Vite entrypoint (landing SPA)
  app.ts                # replaced: renders demo trophy + link to /?username=
  assets/
    main.css            # trimmed
    trophy.svg          # 🏆 logo

public/
  favicon.svg           # 🏆 SVG favicon (theme-aware)
  robots.txt            # unchanged

test/
  fixtures/
    user-*.json         # canned GraphQL responses (public users, empty user, secret-earner)
    svg-snapshots/      # golden SVGs per (theme × trophy) combination
  unit/                 # per-module vitest specs
  integration/          # h3App-level tests via nitro's test utilities

nitro.config.ts         # add compatibilityDate, preset via NITRO_PRESET env
vite.config.ts          # unchanged
docs/superpowers/specs/2026-08-15-github-profile-trophy-nitro-design.md
```

## 6. Module contracts

### 6.1 `lib/trophy/params.ts`

```ts
export interface TrophyParams {
  username: string | null
  theme: string           // "default" if omitted or unknown
  column: number          // -1 means adaptive
  row: number
  marginW: number
  marginH: number
  noBackground: boolean
  noFrame: boolean
  titles: string[]        // includes "-x" negations
  ranks: string[]         // includes "-x" negations
}
export function parseTrophyParams(url: URL | string): TrophyParams
```

### 6.2 `lib/trophy/github.ts`

```ts
export class ServiceError extends Error { code: 400 | 404 | 419 | 502; kind: EServiceKindError }
export type FetchOpts = { tokens: string[]; retryDelayMs?: number; endpoint?: string; fetchImpl?: typeof fetch }
export async function fetchUserInfo(username: string, opts: FetchOpts): Promise<UserInfo | ServiceError>
```

- Tokens injected explicitly → keeps `lib/` env-free and easy to mock in vitest.
- Uses `ofetch` (already available via Nitro) or the global `fetch` — parameterizable.
- Retry rotates through `tokens`, delays `retryDelayMs` (default 500) between attempts.
- Maps GraphQL errors and HTTP status to `ServiceError`:
  - 401 / 403 / no data → 404 `NOT_FOUND`
  - 502 / 5xx → 502 `BAD_GATEWAY`
  - 429 or `X-RateLimit-Remaining: 0` → 419 `RATE_LIMIT`

### 6.3 `lib/trophy/card.ts` (verbatim behavior)

Public `render(userInfo, theme): string`; keeps upstream's private methods `getRow`, `getHeight`, `renderTrophy` and the adaptive `column === -1` branch.

### 6.4 `server/utils/cache.ts`

```ts
export async function getCachedUser(username: string): Promise<UserInfo | null>
export async function setCachedUser(username: string, info: UserInfo): Promise<void>
```

Backed by `useStorage('cache:trophy')`. TTL 4 h enforced with `{ ttl: 4*60*60*1000 }` (Nitro storage drivers accept ms in `ttl` where supported; a wrapper stamps `expiresAt` for drivers that don't). Cache key: `v1-<username>`. When `NITRO_STORAGE_TROPHY` env is unset, defaults to in-memory driver.

### 6.5 `server/routes/index.get.ts`

Pseudocode:

```ts
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const params = parseTrophyParams(url)
  setResponseHeader(event, 'Cache-Control', CACHE_CONTROL)
  if (!params.username) {
    setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
    setResponseStatus(event, 400)
    return renderMissingUsernameForm(url)
  }
  const cached = await getCachedUser(params.username)
  const userInfo = cached ?? await fetchUserInfo(params.username, { tokens: getTokens() })
  if (userInfo instanceof ServiceError) {
    setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
    setResponseStatus(event, userInfo.code)
    return renderErrorPage(userInfo)
  }
  if (!cached) await setCachedUser(params.username, userInfo)
  setResponseHeader(event, 'Content-Type', 'image/svg+xml; charset=utf-8')
  return renderCard(userInfo, params)
})
```

## 7. Data flow (steady state)

1. Request arrives → adapter parses.
2. Nitro Storage lookup by `v1-<username>`. Hit → skip GitHub.
3. Miss → single GraphQL POST to `api.github.com/graphql` with a rotating token.
4. On success, `UserInfo.fromCombined()` derives all counters (commits, stars, langs, durationYear/days, ancient/og/joined2020 flags).
5. `Card.render(userInfo, theme)` builds SVG deterministically from `TrophyList` (filter hidden → title filters → rank filters → sort by rank order).
6. Response returned with `Content-Type: image/svg+xml` and cache headers.

## 8. Cache strategy

- **Origin cache:** Nitro storage `cache:trophy`, key `v1-<username>`, TTL 4 h.
- **HTTP cache:** `Cache-Control: public, max-age=18800, s-maxage=28800, stale-while-revalidate=86400`.
- **Driver selection at deploy time (vendor-agnostic):**
  - default: `memory` (safe, per-instance).
  - `NITRO_STORAGE_TROPHY_DRIVER=redis` + `REDIS_URL` → `unstorage/drivers/redis`.
  - `NITRO_STORAGE_TROPHY_DRIVER=cloudflare-kv-binding` + binding name.
  - `NITRO_STORAGE_TROPHY_DRIVER=fs` + `NITRO_STORAGE_TROPHY_PATH` for local dev.
- Wired in `nitro.config.ts` under `storage: { 'cache:trophy': { driver: … } }` conditionally by env.

## 9. Error handling

Ports upstream's error pages verbatim (HTML shell + `<style>…</style>`), same status codes:

- 400 Bad Request (missing username) — includes the same recovery form.
- 404 Not Found (username not on GitHub).
- 419 Rate Limit Exceeded (GitHub 429 or all tokens exhausted).
- 502 Bad Gateway (upstream 5xx or fetch failure after retries).

`ServiceError.kind ∈ { NOT_FOUND, RATE_LIMIT, BAD_GATEWAY }` maps 1:1 to those pages.

## 10. Tokens & retry

- Read from `GITHUB_TOKEN` (comma-separated) OR `GITHUB_TOKEN1`, `GITHUB_TOKEN2` for upstream-compat.
- `getTokens()` returns a non-empty array or throws at startup (caught by adapter → 502 with clear log).
- `Retry` helper: `for i in [0..tokens.length): try fetch(tokens[i]); on error wait retryDelayMs and continue`.
- Rate-limit / auth errors do NOT retry other tokens (they signal user-level not token-level failure) — matches upstream heuristic.

## 11. Testing (vitest)

Toolchain: `vitest`, `@vitest/coverage-v8`, `msw` (mock GitHub), `@vitest/ui` (dev).

**Unit suites** (100 % of `lib/trophy/*` covered):
- `params.spec.ts` — every default, every negation, adaptive column, malformed integers.
- `utils.spec.ts` — `abridgeScore` boundaries (0.5 → 0pt, 999.5 → 1.0kpt), rank ordering.
- `user-info.spec.ts` — derivations against fixtures: earliest repo, language set, ancient/og/joined2020 flags.
- `trophy.spec.ts` — each of 15 classes: correct rank at each threshold ± 1 and correct progress bar % at mid-tier.
- `trophy-list.spec.ts` — `filterByHidden`, `filterByTitles`, `filterByExclusionTitles`, `filterByRanks` (including `-` prefix), `sortByRank`, `isAllSRank` recomputed after filters.
- `theme.spec.ts` — 24 themes present, each has all 22 keys, no undefineds.
- `icons.spec.ts` — `getTrophyIcon` picks correct base/shadow/text per rank family; laurel present for A/S; secret gradient uses `SECRET_RANK_*`.
- `card.spec.ts` — layout math: width/height for column=-1, column=8, row cap, margin arithmetic.
- `github.spec.ts` — msw handlers: 200 happy path, 401 → 404, 429 → 419, 500 → 502, token rotation stops on auth error.

**Integration suites** (adapter through Nitro):
- Boot a Nitro test app via `@nitro/test-utils` (or manual `createApp`).
- `route.svg.spec.ts` — end-to-end: mocked GitHub → response matches golden SVG (per (theme × subset) matrix, ~10 fixtures — not 24×15).
- `route.errors.spec.ts` — missing username returns 400 HTML, ratelimit returns 419 HTML with cache header.
- `cache.spec.ts` — second call hits storage, GitHub called once.

**Golden SVG discipline:** normalize whitespace before comparing (upstream inlines lots of leading whitespace); the normalizer collapses runs of spaces/newlines outside quoted attributes. Snapshots live in `test/fixtures/svg-snapshots/`.

## 12. Favicon / logo (🏆)

- `public/favicon.svg` — inline SVG containing the trophy glyph (Unicode U+1F3C6) rendered from a system emoji font, wrapped so both light and dark themes read cleanly. Because `<link rel="icon" type="image/svg+xml">` is already in `index.html`, updating the path (`/favicon.svg`) is enough.
- `app/assets/trophy.svg` — same glyph but larger/tuned as the landing-page logo (replaces `nitro.svg`/`vite.svg`).
- Landing (`app/app.ts`): replace the "Click me to call /api/hello" demo with a minimal preview: an input for `username`, a "Show my trophies" button that swaps the demo `<img src="/?username=…">` in the page. No new deps, still vanilla DOM.

## 13. Configuration & env

| Env                            | Purpose                                              | Default            |
|--------------------------------|------------------------------------------------------|--------------------|
| `GITHUB_TOKEN`                 | Comma-separated PATs                                 | —                  |
| `GITHUB_TOKEN1`, `GITHUB_TOKEN2` | Upstream-compat aliases                            | —                  |
| `NITRO_PRESET`                 | Deploy target (node-server / vercel / cloudflare …) | `node-server`      |
| `NITRO_STORAGE_TROPHY_DRIVER`  | `memory` / `redis` / `fs` / `cloudflare-kv-binding` | `memory`           |
| `REDIS_URL`                    | when driver=redis                                    | —                  |
| `NITRO_STORAGE_TROPHY_PATH`    | when driver=fs                                       | `.data/trophy`     |
| `TROPHY_GITHUB_ENDPOINT`       | override GraphQL URL (for tests/self-hosted GHES)    | `https://api.github.com/graphql` |

Config file additions:
- `nitro.config.ts` — `compatibilityDate: '2026-08-15'`, `storage` block, `runtimeConfig` for tokens/endpoint.
- `package.json` — add `ofetch`, `vitest`, `@vitest/coverage-v8`, `msw` (dev). Add scripts `test`, `test:watch`, `test:cov`.

## 14. Deploy presets (vendor-agnostic checklist)

- **node-server** (default): `pnpm build && node .output/server/index.mjs`.
- **vercel**: `NITRO_PRESET=vercel pnpm build`, deploy `.vercel/output` — works because we don't touch Node-specific APIs.
- **cloudflare-pages / cloudflare-module**: storage driver switches to `cloudflare-kv-binding`; `ofetch` runs on `workerd`.
- **deno-deploy**: works out of the box; `ofetch` polyfills.
- **netlify**: identical to node.
- **bun**: identical to node.

A CI matrix (later) can `nitro build` under each preset to catch API drift.

## 15. Out of scope (call-outs)

- The upstream `StaticRenderRegeneration/index.ts` — a bespoke SWR wrapper. We rely on `Cache-Control: stale-while-revalidate` + edge caches instead. Behavior equivalent for CDN-fronted deployments.
- Rotating >2 tokens (upstream hardcodes 2). We support N via CSV `GITHUB_TOKEN`.
- Real-user analytics, admin routes, healthcheck.
- Localization — SVG text stays English (upstream is English-only).

## 16. Migration notes for README consumers

A user migrating from `github-profile-trophy.vercel.app` to `<your-host>/`  changes only the origin — path and params are identical. No new params, no removed params.

## 17. Risks

- **Byte-identical output** across all edge cases is aspirational; the design guarantees semantic parity (same rank, same layout, same theme colors). Snapshot tests bracket the delta.
- **GitHub GraphQL changes** would break upstream too; we mirror the query as-is.
- **Storage driver quirks** (some drivers ignore `ttl`) — the cache wrapper stamps `expiresAt` on the value as a fallback.

## 18. Success criteria

- `pnpm test` green with ≥ 90 % line coverage on `lib/trophy/*`.
- `GET /?username=torvalds&theme=onedark` returns 200 `image/svg+xml` and, after whitespace normalization, matches the reference SVG produced by upstream for the same user.
- Same request served in < 50 ms on cache hit under `NITRO_STORAGE_TROPHY_DRIVER=memory` (dev machine).
- `NITRO_PRESET=node-server`, `vercel`, `cloudflare-module`, `deno-deploy` builds all succeed (`pnpm build` per preset).
- Landing page loads at `/` with the 🏆 favicon and lets a user visually preview a trophy for any username.
