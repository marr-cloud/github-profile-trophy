# Storage that deploys anywhere — design

**Date:** 2026-11-15
**Status:** Draft (pending review)

## 1. Intent

The trophy service caches each GitHub user's stats so READMEs don't hit the GitHub API on every view. Two audiences deploy it:

- **Forks:** other devs who fork the repo and deploy it on their own platform with their own token. For them, deploying should just work with no storage configuration. The platform's native storage is used when it exists, and memory otherwise.
- **The owner:** runs it in production on Cloudflare Workers (`trophy.maurrod.dev`, KV `TROPHY_KV`, Workers Builds on every PR) and wants explicit control when needed.

The owner also asked to review Nitro's config for features that fit the project. This design adopts the ones that solve real problems here (Nitro's cache layer, preset detection, env overrides). It skips the rest (section 4).

## 2. Current state and problems

- **Production today runs on `memory`, not KV.** Workers Builds (dashboard) runs build command `pnpm run build` and deploy command `npx wrangler deploy`. Nitro auto-detects `cloudflare-module` (via `WORKERS_CI`) but the storage env vars live only in `build:cf`, so the driver falls back to `memory`. This change will switch production to KV.
- `wrangler.jsonc` commits the owner's real KV namespace `id` for binding `TROPHY_KV`. A fork deploying to Cloudflare inherits a binding to a namespace in another account, and the deploy fails.
- `nitro.config.ts` picks the driver at **build time** from `NITRO_STORAGE_TROPHY_DRIVER` (`memory` default, `fs`, `redis`, `cloudflare-kv-binding`) and mounts it at `kv["cache:trophy"]`. `build:cf` passes those env vars explicitly. A plain `pnpm build` on Cloudflare silently gets `memory`.
- Only those 4 drivers are wired. Vercel, Netlify, Deno or Upstash need code edits, which contradicts the README's "deploys to any preset without code changes".
- `server/utils/cache.ts` hand-rolls an envelope `{data, expiresAt}` with key `v1-<username>`:
  - **Entries never expire in storage.** Expiry is checked only on read, and no native TTL is passed. KV, Redis and fs keep every username forever. The `memory` driver grows without bound in a long-lived Node process.
  - **Keys are case-sensitive:** `Torvalds` and `torvalds` give two entries and two GitHub calls.
  - **Storage errors propagate:** a KV/Redis failure turns into a 500 instead of an uncached render.
- `runtimeConfig.cacheTtlMs` is dead config (TTL comes from `CONSTANTS.CACHE_TTL_MS`, 4 h).
- `renderTrophyResponse` (server/utils/render.ts) is pure and takes `getCachedUser`/`setCachedUser` deps. Tests inject an in-memory map.

## 3. Goals / non-goals / anti-goals

**Goals**
- Zero storage config on: Cloudflare Workers (if a `TROPHY_KV` binding exists), Vercel, Netlify, Deno Deploy, and Node/Docker/Bun (bounded in-memory LRU).
- One env var to force a driver anywhere (e.g. Redis/Upstash on Node or Vercel).
- Entries expire natively (TTL) on every driver that supports it.
- Stale-while-revalidate: serve the last known stats immediately and refresh in the background.
- Storage failures or a missing platform binding never break rendering.
- Case-insensitive cache keys.
- README: a "Deploy anywhere" table saying, per platform, what (if anything) to do.

**Non-goals**
- Caching the rendered SVG (rendering is cheap; HTTP `Cache-Control` already lets CDNs cache it).
- Choosing the driver at runtime from a single universal build (approach C, rejected).
- Database support, tasks, OpenAPI, ISR (section 4).

**Anti-goals**
- A fork deploy that builds fine but returns 500 because storage isn't provisioned.
- Changing response bodies, status codes, or `Cache-Control` headers of existing URLs.
- Requiring secrets or account IDs in the repo.
- Breaking the owner's current Cloudflare deploy (Workers Builds + `TROPHY_KV`).

## 4. Nitro features reviewed

| Feature | Use? | Why |
|---|---|---|
| `defineCachedFunction` (from `nitro/cache`) + `cache` config | **Yes** | Native TTL via `maxAge`, SWR via `swr`/`staleMaxAge`, `getKey`, read/write errors caught (treated as a miss), bounded LRU `memory` driver. |
| `kv` mounts + `cache.driver: "kv"` | **Yes** | Cache entries go to a `cache` KV mount backed by the platform driver. |
| Preset auto-detection | **Yes** | Lets the build pick the platform driver without `NITRO_PRESET`. |
| `$development` overrides | **Yes** | Dev uses `fs` (`.data/cache`) so the cache survives restarts. |
| `modules` (`NitroModule.setup(nitro)`) | **Yes** | Place to read the resolved `nitro.options.preset` and set the mount. |
| `defineCachedHandler` / `cache` route rules / `isr` | No | They cache whole responses keyed by URL/query. SVG rendering is cheap, and the user-stats cache already dedupes the expensive part. |
| `experimental.tasks` / `database` / `openAPI` | No | No problem they solve here. |

## 5. Approaches considered

| | Approach | Trade-off | Picked |
|---|---|---|---|
| A | Keep `cache.ts`; add native TTL, lowercase key, try/catch, more `if` branches | Smallest diff; no SWR; forks still configure by hand | — |
| B | Nitro cache layer + driver auto-selected from the detected preset, env override, runtime fallback | Uses what Nitro already solves; zero-config forks | **Yes (owner)** |
| C | Choose driver at runtime from env in a plugin (one universal build) | Bundles every driver; each platform builds with its own preset anyway | Rejected |

## 6. Design

### 6.1 Cached user lookup
- Replace `server/utils/cache.ts` with a cached function built with `defineCachedFunction` from `nitro/cache`:
  - **First argument is the h3 `event`** (required: `ocache` only gets `event.req.waitUntil` when `args[0]` is an HTTP event. Without it, SWR background refreshes and cache writes are cut off on Workers). The second argument is the username.
  - `getKey: (_event, username) => username.toLowerCase()`.
  - `name`: a stable name (e.g. `github-user`), with a version in `name` or `base` so the envelope format can change later.
  - `maxAge`: 4 h (`CONSTANTS.CACHE_TTL_MS` / 1000, the current TTL).
  - `swr: true`, `staleMaxAge`: 24 h. **(my call)** A stale entry up to 28 h old is served instantly while a background refresh runs. Trophy data changes slowly. Past 28 h the entry is gone from storage (native TTL = `maxAge + staleMaxAge`).
  - The wrapped function calls `fetchUserInfo`. On `ServiceError` it **throws** so errors are never cached. Callers catch and map to 404/419/502 as today.
- `renderTrophyResponse` stays pure: replace the `getCachedUser`/`setCachedUser` deps with one `resolveUser(username): Promise<UserInfo | ServiceError>` dep (exact shape left to the builder). The route (`server/routes/index.get.ts`) wires `resolveUser` to the cached function with `event`. Tests keep injecting fakes.
- Delete `runtimeConfig.cacheTtlMs`.

### 6.2 Driver selection (build time, from the detected preset)
Verified in the installed sources:
- Nitro runs `resolveKVOptions`/`resolveCacheOptions` **before** `installModules` (`node_modules/nitro/dist/_chunks/nitro.mjs`). The module sees the resolved `nitro.options.preset` (auto-detection included: `WORKERS_CI` → `cloudflare-module`, `VERCEL` → `vercel`, `NETLIFY` → `netlify`, `DENO_DEPLOYMENT_ID` → `deno-server`). But `cache.driver` has already defaulted to `"memory"`, so the module must set **both** `nitro.options.kv.cache` and `nitro.options.cache.driver = "kv"`.
- Driver dependency checks (`ensureLibDeps`) ran before modules, so the module validates deps for the driver it picks and fails the build with a clear message. Don't rely on Nitro's `ensureDep`, which can auto-install in CI or agent environments.
- The `#nitro/virtual/kv` and `#nitro/virtual/cache` templates are generated at build from `nitro.options`, so module changes reach the bundle. `driver` may be a module path, so custom wrapper drivers are allowed. **Driver options are serialized with `JSON.stringify` into the bundle: never put secrets in them.**
- `cache.driver` only accepts `memory | fs | kv`. `TROPHY_CACHE_DRIVER=none` is implemented with `shouldBypassCache` (or the `null` driver), not a cache driver value.

A local Nitro module (e.g. `modules/trophy-cache.ts`, registered in `nitro.config.ts` `modules`) resolves the `cache` KV mount from `nitro.options.preset` plus env. A pure resolver `(preset, env) → mount config | memory` is unit-tested.

Default per platform:

| Preset family | Driver | Notes |
|---|---|---|
| `cloudflare-*` (module, pages, durable) | `cloudflare-kv-binding`, binding `TROPHY_KV` | Falls back at runtime if the binding is missing (6.3). |
| `vercel*` | `vercel-runtime-cache` | Zero config on Vercel. |
| `netlify*` | `cache.driver: "memory"` **(my call)** | `netlify-blobs` has no native TTL (entries would grow forever) and Netlify's entry has no `req.waitUntil` (SWR refreshes may be cut). Blobs is available as an opt-in (`TROPHY_CACHE_DRIVER=netlify`), documented as non-expiring. |
| `deno-server` (what Deno Deploy auto-detects to; there is no `deno-deploy` preset) | `deno-kv` | Native TTL (`expireIn`). |
| everything else (node-server, bun, docker, aws-lambda, …) | `cache.driver: "memory"` (bounded LRU) | Per-instance; fine for single-node. |

Env override (build-time; the owner's and power users' escape hatch):
- `TROPHY_CACHE_DRIVER`: `auto` (default) | `memory` | `fs` | `redis` | `upstash` | `cloudflare-kv` | `vercel` | `netlify` | `deno-kv` | `none` (no cache).
- Driver options from conventional env vars, **read at runtime** (verified: built-in `redis` reads nothing from env, so a URL in options would be baked into the bundle; built-in `upstash` reads only `UPSTASH_REDIS_REST_URL`/`_TOKEN`). Use thin wrapper drivers that read env at runtime: `REDIS_URL`, and `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` falling back to `KV_REST_API_URL` / `KV_REST_API_TOKEN` (set by Vercel's Upstash integration). Also: `TROPHY_KV_BINDING` (default `TROPHY_KV`); `TROPHY_CACHE_DIR` for fs (default `.data/cache`).
- **Back-compat (my call):** `NITRO_STORAGE_TROPHY_DRIVER` / `_BINDING` / `_PATH` are still honored and mapped to the new names, with a build-time deprecation warning. Remove later.
- Secrets (Redis/Upstash URLs and tokens) are never driver options; the wrapper drivers read them from env at runtime.
- `$development`: `fs` at `.data/cache` unless `TROPHY_CACHE_DRIVER` is set.
- The build logs one line with the chosen driver (e.g. `[trophy-cache] preset=cloudflare-module → cloudflare-kv-binding (TROPHY_KV)`).

### 6.3 Runtime safety
- `ocache` already catches read/write/evict errors (logged via Nitro's `onError`), so a failing storage behaves like a cache miss.
- **Missing platform binding** (fork deploys to Cloudflare without creating the KV): every request would log an error. Requirement: detect it and fall back to the in-memory LRU with a **single** warning per isolate. Mechanism is the builder's call (e.g. a thin wrapping driver that checks the binding on first use).
- Optional npm deps, verified: `vercel-runtime-cache` needs nothing (`@vercel/functions` is optional and the context comes from a global symbol); `deno-kv` and `cloudflare-kv-binding` need nothing; `ioredis` (redis), `@upstash/redis` (upstash) and `@netlify/blobs` (netlify) are required for those opt-in drivers. For those: the builder decides between `optionalDependencies`, Nitro's driver-dependency handling, or documenting the install. Hard requirement: the default Node and Cloudflare builds must not need extra installs, and a missing dep for an opted-in driver gives a clear build-time error.

### 6.3b Cloudflare provisioning (owner decision)
- Remove the `id` from `wrangler.jsonc` `kv_namespaces`, keeping `{ "binding": "TROPHY_KV" }`, and rely on wrangler's automatic resource provisioning. A fork's first deploy creates its own namespace.
- **Must be verified before merge** on the PR's Workers Builds check and its logs: the owner's existing Worker has to keep using the existing namespace (`8a3cae7ae76b409e8aa4ab9185f3d1d7`), not a new empty one. If wrangler would create a new namespace, stop and bring it back to the owner: an empty namespace is harmless for data (it's a cache), but an extra resource is unexpected.
- KV free plan caps writes per day. Each miss and each SWR refresh is one write; per user that's at most about 6/day with `maxAge` 4 h. Write failures are caught by `ocache` (served uncached, logged), so hitting the cap degrades instead of breaking. Document it.

### 6.4 Docs
- README "Deploy anywhere" table: platform → what to do (nothing / create a KV namespace named X and bind it as `TROPHY_KV` / set `REDIS_URL` / …) → which driver is used.
- Update the Environment table (new vars, deprecated old ones).
- Cloudflare section: `build:cf` no longer needs storage env vars (keep `NITRO_PRESET` only if Workers Builds needs it). Add a note that Workers Builds' build command can be plain `pnpm build`.
- Workers Builds' build command stays `pnpm run build`. `build:cf` keeps working but no longer needs storage env vars.
- **Legacy cleanup:** the pre-TTL `v1-<username>` entries in `TROPHY_KV` were deleted by hand by the owner (2026-11-15). No script or recurring job: new entries carry native TTL.

### 6.5 Tests
- Resolver unit tests: each preset family → expected driver; every `TROPHY_CACHE_DRIVER` value; legacy var mapping; `none`; dev override.
- Serialization: in KV/Redis the cached value comes back as a plain object; in `memory` it's the same `UserInfo` instance. Store plain JSON and rehydrate with `UserInfo.fromJSON` (test both paths).
- `defineCachedFunction` from `nitro/cache` works in vitest without booting Nitro (virtual modules resolve to memory stubs). Tests pass their own `storage` option.
- Cached lookup (memory storage): second call within `maxAge` doesn't hit GitHub (msw counter); `Torvalds` and `torvalds` share one GitHub call; a `ServiceError` is not cached (next call hits GitHub again); a storage that throws on get/set still returns the user.
- Missing-binding fallback: a single warning, still serves.
- Existing route/integration tests keep passing (statuses, headers, bodies unchanged).
- Builds: `pnpm build` (node) and `pnpm build:cf`. Plus one build with `NITRO_PRESET=vercel` and one with `netlify` to confirm the module picks the driver and the bundle builds (no deploy).

## 7. Constraints
- Nitro `3.0.261103-rc`, `unstorage` ^2 beta, `ocache` (via Nitro). Read the installed sources/types; docs aren't bundled.
- Workers Builds installs with pnpm 9. Don't break the PR check.
- Imports use the `~/*` alias with explicit `.ts` extensions (nitro.config.ts and modules may need relative imports).
- No deploy from the build work. The KV cleanup and production verification are the owner's.

## 8. Left to the builder
- Exact file names (module, resolver, cached function) and the `resolveUser` dep shape.
- How the missing-binding fallback is implemented.
- Optional dependency strategy (6.3), within the hard requirement.
