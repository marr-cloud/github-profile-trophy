# Hardening + UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update deps, add Observatory-grade security headers that keep framing open to any origin, move Pico → `@anyblades/pico` self-hosted, add tri-state include/exclude chips with exclude-wins semantics (aliases included), add a footer, and strengthen tests.

**Architecture:** Pure logic stays in `lib/trophy/` (filters, security headers, landing HTML). The landing loses all inline code: `public/builder.css` + `public/builder.js` + self-hosted Pico at `/assets/pico.min.css`. `renderTrophyResponse` merges per-content-kind security headers into every result.

**Tech Stack:** Nitro `3.0.261103-rc`, h3, Vite, Vitest 5, msw, happy-dom (new), `@anyblades/pico` 2.5, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-11-15-hardening-ui-refresh-design.md`

## Global Constraints

- Nitro pinned **exact** `3.0.261103-rc`; `vite`, `typescript`, `@types/node` as `^<installed>` (no `"latest"`); `vitest` + `@vitest/coverage-v8` `^5.1.0`; `@anyblades/pico` `^2.5.0` in `dependencies`.
- Before touching server code, read `node_modules/nitro/dist/docs/README.md` (AGENTS.md rule; knowledge of Nitro v3 is outdated).
- Imports use the `~/*` alias with explicit `.ts` extensions.
- Never send `X-Frame-Options`. Every CSP ends with `frame-ancestors *`. `Cross-Origin-Resource-Policy: cross-origin`.
- Landing loads nothing from third-party origins.
- Existing URLs keep rendering the same, except the two documented changes: mixed ranks (`rank=S,-C` = only S minus C) and title excludes by alias (`-Star` now excludes Stars).
- Package manager: `pnpm`. Commit messages: conventional style as in `git log` (`feat(scope): …`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/hardening-ui-refresh` (already created; spec committed).

## Review Focus

1. **Filters that leave zero trophies** (`rank=-SECRET,-SSS,…,-C,-?` or `column=-1` with nothing left): expect a valid SVG with non-negative `width`/`height`, no `NaN`. Today `getRow` gives row 0 → negative height with margin-h, and `column=-1` divides by 0. Pinned in Task 2.
2. **Clipboard inside a cross-origin iframe** (Clipboard API blocked or `navigator.clipboard` undefined): copy buttons fall back to selecting the text and showing "Copy failed — text selected, press Ctrl+C", without throwing. Pinned in Task 5.
3. **Degenerate filter values** (`rank=-`, `title=,,`, `rank= -C `): an empty exclude (`-` alone) is ignored and doesn't drop everything; trimmed values still apply; matching remains case-sensitive. Pinned in Task 2.
4. **Hostile path/origin reaching `data-base`** (e.g. `baseUrl` containing `"><script>`): attribute is escaped; no executable markup. Pinned in Task 3.
5. **Same value included and excluded** (`rank=C,-C`, `title=Star,-Stars`): exclude wins, across alias and main name. Pinned in Task 2.

---

### Task 1: Dependency update + audit

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, possibly `vitest.config.ts`, `nitro.config.ts`, `vite.config.ts` (only if the upgrade breaks them)

**Interfaces:**
- Produces: installed `@anyblades/pico` at `node_modules/@anyblades/pico/css/pico.min.css`; green baseline.

- [ ] **Step 1:** `pnpm install` on the current lockfile, then `pnpm test` and `pnpm typecheck` — record the baseline result (pass/fail counts) and `pnpm test:cov` totals for the PR description.
- [ ] **Step 2:** Update: `pnpm add -D nitro@3.0.261103-rc vite@^8 typescript@latest @types/node@latest vitest@^5.1.0 @vitest/coverage-v8@^5.1.0 happy-dom` and `pnpm add @anyblades/pico@^2.5.0`. Then edit `package.json` so `nitro` is exact `3.0.261103-rc` and `vite`/`typescript`/`@types/node` are `^<installed version>`.
- [ ] **Step 3:** Read `node_modules/nitro/dist/docs/` changelog/migration notes for beta→RC changes touching `defineConfig`, `routeRules`, `publicAssets`, `storage`, `nitro/h3`, `nitro/runtime-config`. Fix only what breaks.
- [ ] **Step 4:** Run `pnpm typecheck && pnpm test && pnpm build && pnpm build:cf`. Expected: all pass, same test count as baseline.
- [ ] **Step 5:** `pnpm audit`. Fix advisories resolvable by bumping; list remaining ones (package, severity, why not fixable) in a note for the PR.
- [ ] **Step 6:** Commit: `chore(deps): update nitro to 3.0.261103-rc, vitest 5, pin ranges; add @anyblades/pico, happy-dom`.

### Task 2: Unified include/exclude filter semantics + card edge cases

**Files:**
- Modify: `lib/trophy/trophy-list.ts` (filter methods), `lib/trophy/card.ts:27-49` (filter calls, `getRow`, adaptive column)
- Test: `test/unit/trophy-list.spec.ts`, `test/unit/card.spec.ts`

**Interfaces:**
- Produces in `lib/trophy/trophy-list.ts`:
  - `export function splitFilterValues(values: string[]): { include: string[]; exclude: string[] }` — `"-X"` → exclude `X`; values that are `""` or `"-"` (after removing the prefix nothing is left) are dropped.
  - `TrophyList#filterByTitles(values: string[]): void` — includes and excludes both matched against `trophy.filterTitles`; include (if any) restricts, then exclude removes.
  - `TrophyList#filterByRanks(values: string[]): void` — same rule, exact match on `trophy.rank`.
  - `filterByExclusionTitles` is **removed** (callers: `card.ts` only).
- `Card#render` calls `filterByHidden()`, then `filterByTitles(this.titles)` if non-empty, then `filterByRanks(this.ranks)` if non-empty, then `sortByRank()`.

- [ ] **Step 1: Write failing tests** in `test/unit/trophy-list.spec.ts` (fixture `user-torvalds`, after `filterByHidden()`; read the fixture's actual ranks with a quick `console.log` once and hardcode them in assertions):
  - `splitFilterValues(["S","-C","-","", "-SS"])` → `{ include: ["S"], exclude: ["C","SS"] }`.
  - `filterByRanks(["-C"])` → no trophy has rank `C`, all others kept (count = before − count of C).
  - `filterByRanks(["S","-C"])` → every remaining rank is `S` (previously includes were ignored).
  - `filterByRanks(["C","-C"])` → length 0 for rank C trophies (exclude wins).
  - `filterByRanks(["-"])` → length unchanged.
  - `filterByRanks(["s"])` → length 0 (case-sensitive; `S` ≠ `s`).
  - `filterByRanks(["S"])` keeps `S` only, not `SS`/`SSS`.
  - `filterByTitles(["-Star"])` → titles do not contain `"Stars"` (alias exclude).
  - `filterByTitles(["-Stars"])` → same result (main-name exclude still works).
  - `filterByTitles(["Star","-Stars"])` → length 0.
  - `filterByTitles(["Stars","Followers","-Follower"])` → titles equal `["Stars"]`.
  - `filterByTitles(["Repo","PR"])` → titles sorted equal `["PullRequest","Repositories"]`.
  - Replace the old `filterByExclusionTitles` test.
- [ ] **Step 2: Write failing tests** in `test/unit/card.spec.ts`:
  - `new Card([], ["-SECRET","-SSS","-SS","-S","-AAA","-AA","-A","-B","-C","-?"], 8, 3, 110, 0, 10, false, false).render(info, COLORS.flat)` contains `width="880"` and `height="0"`, and does not contain `NaN` or `height="-`.
  - Same ranks with `column=-1`: contains `width="0"` and `height="0"`, no `NaN`.
  - `rank=-C` via `new Card([], ["-C"], …)` renders `(visible − Ccount)` trophy panels (count `<svg x=` occurrences or the per-trophy marker the existing render uses).
  - `row` cap: `new Card([], [], 2, 1, 110, 0, 0, false, false)` → `height="110"`.
- [ ] **Step 3:** Run `pnpm vitest run test/unit/trophy-list.spec.ts test/unit/card.spec.ts`. Expected: new tests FAIL (mixed ranks, alias exclude, zero-trophy geometry).
- [ ] **Step 4:** Implement `splitFilterValues`, the two filter methods, and update `Card#render`. In `Card`, clamp: `row = max(0, …)`, height = `row === 0 ? 0 : panelSize*row + marginH*(row-1)`; adaptive column with 0 trophies → width 0 and skip the division (`getRow` returns 0 when `trophyList.length === 0`).
- [ ] **Step 5:** Run `pnpm test`. Expected: all PASS (including `test/unit/params.spec.ts`, `test/integration/route.spec.ts`).
- [ ] **Step 6:** Commit: `feat(filter): exclusions win over inclusions and match title aliases`.

### Task 3: Self-hosted Pico + landing without inline code

**Files:**
- Create: `public/builder.css` (moved inline `<style>` from `lib/trophy/query-builder.ts:111-143`), `public/builder.js` (moved inline `<script>` from `lib/trophy/query-builder.ts:212-295`)
- Modify: `lib/trophy/query-builder.ts`, `nitro.config.ts` (`publicAssets`), `public/_headers` (created in Task 4; not here)
- Test: create `test/unit/query-builder.spec.ts`

**Interfaces:**
- Consumes: `@anyblades/pico` from Task 1.
- Produces:
  - `/assets/pico.min.css` served from `node_modules/@anyblades/pico/css/pico.min.css` (via Nitro `publicAssets: [{ dir: "node_modules/@anyblades/pico/css", baseURL: "/assets" }]` — confirm option shape in Nitro docs; if it doesn't land in `.output/public` for `cloudflare_module`, use a copy step instead and gitignore the copy).
  - `<head>` links, in order: `/assets/pico.min.css`, `/builder.css`; `<script src="/builder.js" defer></script>`.
  - `<form id="builder" data-base="${escapeHtml(baseUrl)}" data-defaults="${escapeHtml(JSON.stringify(DEFAULTS))}">`. `builder.js` reads `form.dataset.base` and `JSON.parse(form.dataset.defaults)`.
  - Inline `style="grid-column: 1 / -1;"` → class `span-all` (rule in `builder.css`).
  - `PICO_CDN` and `jsonForScript` removed.

- [ ] **Step 1: Write failing tests** in `test/unit/query-builder.spec.ts` using `renderQueryBuilder("https://trophy.example/")`:
  - does not match `/<style[\s>]/`, `/\sstyle="/`, `/<script(?![^>]*\ssrc=)[^>]*>/` (no inline script).
  - does not contain `cdn.jsdelivr.net` nor `picocss`.
  - contains `href="/assets/pico.min.css"`, `href="/builder.css"`, `src="/builder.js"`.
  - contains `data-base="https://trophy.example/"`.
  - XSS: `renderQueryBuilder('https://x/"><script>alert(1)</script>')` contains no `<script>alert` and contains `&quot;&gt;&lt;script&gt;`.
  - `data-defaults` round-trips: parse it out with a regex, unescape `&quot;`, `JSON.parse` → equals `{ theme: "default", column: "6", row: "3", "margin-w": "0", "margin-h": "0", "no-bg": "false", "no-frame": "false" }`.
- [ ] **Step 2:** Run `pnpm vitest run test/unit/query-builder.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Move CSS/JS out, add `data-*`, wire `publicAssets`. In `builder.js` add `form.addEventListener("submit", e => e.preventDefault())`. Keep the server-rendered initial URL/markdown/preview values.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS (existing `route.spec.ts` checks for `id="builder"`, `id="preview"` still hold).
- [ ] **Step 5:** `pnpm build && pnpm preview` (or `pnpm dev`): `curl -sI http://localhost:3000/assets/pico.min.css` → `200`, `content-type: text/css`; same for `/builder.css`, `/builder.js` (`text/javascript`). Then `pnpm build:cf` and check `.output/public/assets/pico.min.css` exists.
- [ ] **Step 6:** Commit: `refactor(landing): self-host @anyblades/pico and move inline CSS/JS to public/`.

### Task 4: Security headers

**Files:**
- Create: `lib/trophy/security-headers.ts`, `public/_headers`
- Modify: `lib/trophy/index.ts` (export), `server/utils/render.ts` (merge into every result), `server/routes/favicon.ico.get.ts`
- Test: create `test/unit/security-headers.spec.ts`; extend `test/integration/route.spec.ts`

**Interfaces:**
- Produces in `lib/trophy/security-headers.ts`:
  - `export type ContentKind = "landing" | "error" | "svg";`
  - `export const CSP: Record<ContentKind, string>` with exactly:
    - landing: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors *`
    - error: `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *`
    - svg: `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *`
  - `export const BASE_SECURITY_HEADERS` = `{ "Strict-Transport-Security": "max-age=63072000; includeSubDomains", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Cross-Origin-Resource-Policy": "cross-origin" }`
  - `export function securityHeaders(kind: ContentKind): Record<string, string>` → base + `"Content-Security-Policy": CSP[kind]`.
- `renderTrophyResponse`: landing → `"landing"`, `errorResult` → `"error"`, SVG → `"svg"`. Favicon → `"svg"`.
- `public/_headers` (Cloudflare assets):
  ```
  /*
    Strict-Transport-Security: max-age=63072000; includeSubDomains
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Cross-Origin-Resource-Policy: cross-origin
  ```

- [ ] **Step 1: Write failing tests:**
  - `security-headers.spec.ts`: each `CSP[kind]` equals the exact string above; each ends with `frame-ancestors *`; `securityHeaders(k)` has the 4 base headers + CSP and no key matching `/x-frame-options/i`.
  - `route.spec.ts` (pure core with injected deps): for landing (no username), SVG happy path, 404, 419, 502 → `content-security-policy` equals `CSP[expected kind]`, `x-content-type-options` = `nosniff`, `cross-origin-resource-policy` = `cross-origin`, `strict-transport-security` present, `x-frame-options` is `null`. Same through `realRouteApp()` for landing and the no-token 502 (proves `index.get.ts` copies them).
  - Favicon: mount `server/routes/favicon.ico.get.ts` in an `H3` app like `realRouteApp()` does; assert CSP = `CSP.svg`.
- [ ] **Step 2:** Run `pnpm vitest run test/unit/security-headers.spec.ts test/integration/route.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the module, merge in `render.ts`/favicon, add `public/_headers`. Check `pnpm build` output: `_headers` must not break the node preset (it's just a static file there); for non-Cloudflare presets also add the base headers to `/builder.*` and `/assets/**` via `routeRules` headers in `nitro.config.ts`.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 5:** `pnpm build:cf && pnpm wrangler dev` (local only — no deploy): `curl -sI` `/`, `/?username=x` (502 without token is fine), `/favicon.ico`, `/builder.js`, `/assets/pico.min.css` → each shows the expected headers; none has `x-frame-options`. If static files lack the headers under `wrangler dev`, note it and check `wrangler.jsonc` `assets` config (e.g. `"run_worker_first"` is **not** wanted; `_headers` is the mechanism).
- [ ] **Step 6:** Commit: `feat(security): CSP and security headers per content type, framing open`.

### Task 5: Tri-state chips + footer

**Files:**
- Modify: `lib/trophy/query-builder.ts`, `public/builder.js`, `public/builder.css`
- Test: extend `test/unit/query-builder.spec.ts`; create `test/unit/builder-script.spec.ts` (`// @vitest-environment happy-dom`)

**Interfaces:**
- Chip markup (titles and ranks; same order as `TITLE_OPTIONS`/`RANK_OPTIONS`):
  `<button type="button" class="chip" data-group="title|rank" data-value="X" data-state="neutral" aria-pressed="false" aria-label="X: any">X</button>`
- States cycle on click (buttons get Enter/Space for free): `neutral` (aria-pressed `false`, label `X: any`) → `include` (`true`, `X: included`, shows ✓) → `exclude` (`mixed`, `X: excluded`, shows ✕ + line-through) → `neutral`. Glyphs via CSS `::before` on `[data-state]`, so the text content stays `X`.
- URL: per group, chips in DOM order → `include` as `X`, `exclude` as `-X`, joined with `,`; param omitted if empty. Example: SS include, S include, C exclude → `rank=SS%2CS%2C-C` (URLSearchParams encoding of `SS,S,-C`).
- Legends: `Titles`, `Ranks`. Hint under both: `Click: include ✓ · again: exclude ✕ · again: clear. Exclusions win.` Rank hint keeps: `Exact match: S does not include SS/SSS.`
- Footer (`<footer class="site-footer">` after `.layout`, inside `.wrap`); each link `target="_blank" rel="noopener noreferrer"`:
  - `Source code` → `https://github.com/marr-cloud/github-profile-trophy`
  - `Original project` → `https://github.com/ryo-ma/github-profile-trophy`
  - `Parameters` → `https://github.com/marr-cloud/github-profile-trophy#usage`
  - `Report an issue` → `https://github.com/marr-cloud/github-profile-trophy/issues/new`
  - `License (MIT)` → `https://github.com/ryo-ma/github-profile-trophy/blob/master/LICENSE` (repo has no LICENSE file — verify the upstream URL resolves with `curl -sI` and flag in the PR)

- [ ] **Step 1: Write failing markup tests** (`query-builder.spec.ts`): 15 `data-group="title"` buttons, 9 `data-group="rank"` buttons, all `data-state="neutral"` `aria-pressed="false"`; no `<input type="checkbox" name="rank"`/`name="title"`; footer contains the 5 hrefs above, each with `rel="noopener noreferrer"`.
- [ ] **Step 2: Write failing behavior tests** (`builder-script.spec.ts`): set `document.documentElement.innerHTML` from `renderQueryBuilder("https://t.example/")`, then evaluate `readFileSync("public/builder.js")` with `window.eval`; `vi.useFakeTimers()` and advance 300 ms after each interaction (FAST debounce 250 ms):
  - click rank `C` once → `data-state="include"`, `aria-pressed="true"`; twice → `exclude`/`mixed`, `#url` value contains `rank=-C`; thrice → `neutral`, `#url` has no `rank=`.
  - include `SS`, include `S`, exclude `C` → `new URL(#url.value).searchParams.get("rank") === "SS,S,-C"`; `#preview.src` equals `#url.value`.
  - exclude title `Star` → `searchParams.get("title") === "-Star"`.
  - defaults omitted: initial `#url.value === "https://t.example/?username=octocat"`.
  - submit: dispatching `submit` on `#builder` has `defaultPrevented === true`.
  - clipboard fallback (Review Focus 2): with `navigator.clipboard` deleted/undefined, clicking `#copy` does not throw, `#copy-status` text is `Copy failed — text selected, press Ctrl+C`. With `writeText` rejecting → same message.
- [ ] **Step 3:** Run `pnpm vitest run test/unit/query-builder.spec.ts test/unit/builder-script.spec.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement markup, CSS (include = `--pico-primary` fill; exclude = `--pico-del-color` border/text + `text-decoration: line-through`; focus-visible outline as today; footer muted, small, wraps), and `builder.js` (chip click handler + `collect(group)` returning the CSV; guard `navigator.clipboard` absence before calling `writeText`).
- [ ] **Step 5:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(landing): tri-state include/exclude chips and footer`.

### Task 6: README + end-to-end verification

**Files:**
- Modify: `README.md` (params table + new "Filtering" subsection; security headers/framing note)

- [ ] **Step 1:** README: in the `title`/`rank` rows say "CSV; prefix `-` to exclude; exclusions win". Add a "Filtering" subsection with the rule (include restricts, exclude removes, exclude wins; title aliases accepted for both), examples `rank=-C`, `rank=SS,S,-C`, `title=-Star`, and the two behavior changes vs upstream. Add a short "Embedding" note: works in `<img>` and `<iframe>` from any origin (`frame-ancestors *`, CORP cross-origin).
- [ ] **Step 2:** `pnpm typecheck && pnpm test && pnpm test:cov && pnpm build && pnpm build:cf`. Expected: all pass; record coverage vs Task 1 baseline.
- [ ] **Step 3:** Visual check with the `playwright-cli` skill against `pnpm dev`: landing in light and dark (`prefers-color-scheme`), chips cycle with visible ✓/✕, footer, select arrow and checkbox ticks render (data: images), console has **no** CSP violations. Then serve a scratch HTML page on another port with `<iframe src="http://localhost:3000/">` and `<iframe src="http://localhost:3000/?username=octocat">` → both render, console clean.
- [ ] **Step 4:** Commit: `docs(readme): document filter semantics and embedding`.
- [ ] **Step 5:** Hand off: deploying (`pnpm deploy:cf`) and the Observatory scan of `https://trophy.infraforge.cc/` are done by the owner — do not deploy.
