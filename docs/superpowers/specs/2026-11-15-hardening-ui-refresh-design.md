# Hardening + UI refresh — design

**Date:** 2026-11-15
**Status:** Draft (pending review)

## 1. Intent

The trophy service (`GET /?username=…` → SVG, `GET /` → query-builder landing) is meant to be embedded by any developer, anywhere: as `<img>` in READMEs and also inside `<iframe>`s (both the SVG and the landing). This round:

1. Brings dependencies current (Nitro left beta).
2. Passes Mozilla's HTTP Observatory (`https://observatory-api.mdn.mozilla.net/`) with a strong grade **without breaking framing from any origin**.
3. Moves off Pico CSS (archived Oct 2026) to its community successor.
4. Makes "exclude" filtering usable from the UI (today excluding only rank C means checking every other rank) and gives exclusions priority over inclusions.
5. Adds a footer with useful links.
6. Strengthens the test suite where it is thin.

## 2. Goals / non-goals / anti-goals

**Goals**
- Observatory grade A or better on the landing (`/`), with `frame-ancestors *`.
- Landing works identically when framed by any site.
- One-click exclusion of a title or rank in the builder.
- Tests cover the new filter semantics, the security headers per response type, and the landing markup.

**Non-goals**
- Mutation testing (explicitly dropped by the owner — improve tests by hand instead).
- CI setup (repo has none).
- New themes, trophies or params.
- Redesigning the landing beyond footer + filter chips.

**Anti-goals (failure even if "it works")**
- Any header that blocks framing (`X-Frame-Options`, restrictive `frame-ancestors`) or cross-origin `<img>` use (`Cross-Origin-Resource-Policy: same-origin`).
- Breaking existing README URLs (`?username=…&rank=-C&title=-Stars` etc. must keep rendering the same; the only intended changes are listed in 5.5).
- Loading anything from a third-party origin on the landing.

## 3. Current state (relevant)

- `lib/trophy/query-builder.ts` renders the landing as one HTML string: Pico from jsDelivr (no SRI), a large inline `<style>`, and an inline `<script>` that builds the URL and live-previews it. `baseUrl` and `DEFAULTS` are injected into the script via `jsonForScript`.
- `lib/trophy/error-page.ts` renders 404/419/502 HTML with an inline `<style>` and `style=""` attributes, no scripts.
- `server/utils/render.ts#renderTrophyResponse` returns `{status, headers, body}`; `server/routes/index.get.ts` copies headers onto `event.res`. `server/routes/favicon.ico.get.ts` sets its own headers. `public/` holds `favicon.svg`, `og-preview.png`, `robots.txt`.
- No security headers are sent anywhere.
- Filters (`lib/trophy/card.ts`, `lib/trophy/trophy-list.ts`): backend already supports `-` prefix exclusion for `title` and `rank`. Titles: include-filter then exclude-filter. Ranks: **if any `-` rank is present, all include ranks are silently ignored**.
- `package.json` pins `nitro`, `vite`, `typescript`, `@types/node` as `"latest"`; lockfile has `nitro@3.0.260610-beta`, `vite@8.2.1`, `vitest@4.1.10`.
- Deploy: Cloudflare Workers (`pnpm deploy:cf`, preset `cloudflare_module`, KV cache), custom domain `trophy.infraforge.cc`. `wrangler.jsonc` has an `assets` block → static files in `public/` are served by Cloudflare's asset layer, likely **without** passing through the Worker (so Nitro routeRules headers may not apply to them).

## 4. Approaches considered (owner picked one per area)

| Area | Options | Picked | Why |
|---|---|---|---|
| CSS source | (a) jsDelivr pinned + SRI; (b) self-host from npm package | **b** | No third-party origin; `style-src 'self'`; updates via pnpm |
| CSP strategy | (a) keep inline script/style, CSP with sha256 hashes; (b) move own JS/CSS to `public/` files | **b** | Strict CSP with no hashes to keep in sync |
| Exclude UI | (a) tri-state chips (neutral → include → exclude); (b) separate Include/Exclude groups | **a** | One click to exclude; no duplicated form |
| Footer | links below | yes | — |
| Deps/tests | update deps + audit; mutation testing → dropped, improve tests manually | yes | Owner: mutation testing is too much |

## 5. Design

### 5.1 Dependencies & audit
- `nitro`: pin **exact** `3.0.261103-rc` (current `latest` dist-tag; it is an RC, not stable — caret ranges on prereleases are ambiguous). Read `node_modules/nitro/dist/docs/` for breaking changes between `260610-beta` and the RC before touching code (AGENTS.md rule).
- `vite`, `typescript`, `@types/node`: replace `"latest"` with `^<current>`.
- `vitest` + `@vitest/coverage-v8` → `^5.1.0`. Fix any config/API breakage.
- Add `@anyblades/pico` (`^2.5.0`, MIT) as a dependency.
- Run `pnpm audit`; fix what can be fixed by version bumps; record anything left in the PR description.
- Gate: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm build:cf` all pass before moving on.

### 5.2 CSS: Pico → Blades (`@anyblades/pico`)
- Verified: package `@anyblades/pico@2.5.0` ships `css/pico.min.css` and `css/blades.min.css`; every `--pico-*` variable the landing uses exists in both. Use **`css/pico.min.css`** (the maintained Pico drop-in). `blades.css` adds extra features we don't need.
- Serve it from our own origin at a stable path, e.g. `/assets/pico.min.css`, sourced from `node_modules/@anyblades/pico/css/` through Nitro `publicAssets` (or a copy step if `publicAssets` from `node_modules` doesn't play well with the cloudflare preset — builder's call, must work in both `pnpm build` and `pnpm build:cf`).
- Long-cache headers are fine for it only if the path is versioned; otherwise use the default asset caching.

### 5.3 Landing without inline code
- Move the inline `<style>` to `public/builder.css` and the inline `<script>` to `public/builder.js`.
- `builder.js` reads `baseUrl` and defaults from `data-*` attributes on the form (e.g. `data-base`, `data-defaults` as JSON); the server still escapes them (`escapeHtml`).
- Replace the `style="grid-column: 1 / -1;"` inline attribute with a class.
- `builder.js` must call `preventDefault()` on form `submit` (Enter in the username field), since CSP `form-action 'none'` will block it anyway.
- The server-rendered initial state (URL, markdown, preview `src`) stays so the page is useful before JS loads.

### 5.4 Security headers
Centralize in one helper (e.g. `server/utils/security-headers.ts` or in `lib/`), with per-response-type CSP; `renderTrophyResponse` merges them into every result; favicon route uses them too.

Common to every response:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Resource-Policy: cross-origin`
- **No** `X-Frame-Options`.

CSP per type:
- Landing HTML: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors *` (`data:` because Pico draws the `<select>` arrow and checkbox ticks as inline `data:` SVGs; Observatory does not penalize `data:` in `img-src`).
- Error HTML (404/419/502): `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *` (error pages keep their inline styles; Observatory does not penalize unsafe-inline in `style-src` alone, and these pages are not what it scans).
- Trophy SVG and favicon SVG: `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *` (the trophy SVG contains a `<style>` block).

Static files in `public/` (CSS, JS, images): on Cloudflare they are served by the assets layer and may bypass the Worker. Add a Cloudflare `public/_headers` file applying at least `X-Content-Type-Options`, `Cross-Origin-Resource-Policy: cross-origin`, HSTS to `/*`. Builder verifies after `pnpm build:cf` + `wrangler dev` which path actually serves them and that headers are present; other presets rely on Nitro routeRules for the same headers.

HTTP→HTTPS redirect is handled by Cloudflare at the zone level; out of scope in code, but note in the PR whether the scan flags it.

### 5.5 Filter semantics (backend, both `title` and `rank`)
Unified rule, applied after `filterByHidden`:
1. Split values into includes (no `-`) and excludes (`-X` → `X`).
2. If includes is non-empty, keep only trophies matching an include.
3. Remove every trophy matching an exclude. **Exclude wins** if the same value is both included and excluded.

Titles match on `trophy.filterTitles` (all aliases) for **both** includes and excludes. Today excludes match only `trophy.title` (`MultiLanguage`, `Stars`, `Reviews`, `Commits`, `Followers`, `Issues`, `Repositories`…), so the aliases the builder sends (`-Star`, `-Commit`, `-MultipleLang`…) silently exclude nothing and `title=Star,-Star` still shows Stars. Matching excludes on aliases fixes both; every `trophy.title` is already in its own `filterTitles`, so URLs using main names (`-Stars`) keep working. Ranks match exactly on `trophy.rank` (as today; `S` ≠ `SS`).

Compatibility: only-include URLs, rank-only-exclude URLs and title excludes by main name render exactly as before. Behavior changes (document in README):
- mixed ranks such as `rank=S,-C` previously ignored `S`; now "only S, minus C";
- title excludes by alias (`-Star`, `-Repo`, `-PR`…) previously did nothing; now they exclude.

### 5.6 Tri-state chips (UI)
- Each title/rank chip cycles on click: **neutral → include (✓) → exclude (✕) → neutral**. Keyboard: Space/Enter cycles the same way; chip is focusable with visible focus.
- Visual: include = primary fill + ✓; exclude = muted/danger outline, ✕ and strike-through text. Must be distinguishable without color (glyph + strike).
- Accessibility: `role="button"` (or a real `<button type="button">`) with `aria-pressed="false" | "true" | "mixed"` plus an `aria-label` like "C: excluded"; legend hint: "Click: include ✓ · again: exclude ✕ · again: clear".
- URL building: includes as `X`, excludes as `-X`, joined in the same CSV param (`rank=SS,S,-C`), matching 5.5.
- Rename fieldset legends from "Include titles"/"Include ranks" to "Titles"/"Ranks"; update hints.

### 5.7 Footer
Below the layout, small, muted, wraps on mobile. Links (open in new tab with `rel="noopener noreferrer"` — page is often framed):
- Source code → `https://github.com/marr-cloud/github-profile-trophy`
- Original project → `https://github.com/ryo-ma/github-profile-trophy`
- Parameters / docs → README usage section on GitHub
- Report an issue → repo `/issues/new`
- License → repo `LICENSE` (if the repo has no LICENSE file, link upstream's MIT license and flag it in the PR)

### 5.8 Tests (manual strengthening, replaces mutation testing)
Target the thin spots; follow existing style (`test/unit/*.spec.ts`, `test/integration/*.spec.ts`, fixtures in `test/fixtures/`):
- **Filters** (`trophy-list`, `card`): include only, exclude only, mixed, conflict (exclude wins), unknown values, ranks exact-match (`S` vs `SS`), titles by `filterTitles` vs `title`; one test per boundary of the old "any `-` ignores includes" behavior.
- **Card geometry**: `column=-1` adaptive width, row cap by `row`, margins, empty list.
- **Headers**: for landing, SVG, each error status, and favicon — assert each header from 5.4 is present, CSP string matches the type, `X-Frame-Options` absent, `frame-ancestors *` present.
- **Landing markup**: no inline `<script>` body, no `<style>`, no `style=` attributes; links to `/assets/pico.min.css`, `builder.css`, `builder.js`; footer links present; data attributes escaped (XSS case with a hostile `baseUrl`).
- **`builder.js` behavior**: run it against the rendered landing HTML in a DOM test environment (add `happy-dom` as devDependency, per-file `// @vitest-environment happy-dom`): chip cycling and `aria-pressed`, URL output for include/exclude/mixed, defaults omitted, submit prevented.
- Coverage is a signal, not a gate; report before/after in the PR.

### 5.9 Verification
- `pnpm typecheck && pnpm test && pnpm build && pnpm build:cf`.
- Run the app locally (`pnpm dev` and `wrangler dev` on the CF build), visually check the landing in light/dark, chips, footer, and that it renders inside an `<iframe>` on a different origin (e.g. a local HTML file served on another port).
- Browser console shows no CSP violations.
- Observatory scan of the deployed site is done by the owner after deploy (deploying is outward-facing; not part of the build work unless asked).

## 6. Left to the builder
- Exact file layout for the headers helper, and how `publicAssets`/copy step is wired.
- Chip markup details and exact CSS, within 5.6.
- Test file split/naming.
- Order of commits (suggested: deps → CSS/externalize → headers → filters backend → chips UI + footer → README).
