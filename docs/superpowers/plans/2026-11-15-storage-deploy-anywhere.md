# Storage That Deploys Anywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled user cache with Nitro's cached functions (native TTL, SWR, case-insensitive keys, storage errors don't break rendering), and pick the storage driver automatically from the detected platform, with one env var to override.

**Architecture:** A pure resolver `(preset, dev, env) → cache config` feeds a local Nitro module that sets `kv.cache` + `cache.driver` before the build generates its virtual modules. Three small wrapper drivers handle a missing Cloudflare binding and runtime-only Redis/Upstash secrets. `renderTrophyResponse` stays pure behind a single `resolveUser` dependency.

**Tech Stack:** Nitro `3.0.261103-rc` (`nitro/cache` → ocache 0.3.2), unstorage 2.0.0-beta.0, Vitest 5, msw, wrangler 4.161.

**Spec:** `docs/superpowers/specs/2026-11-15-storage-deploy-anywhere-design.md`

## Global Constraints

- Cache timings: `maxAge` 14400 s (4 h), `swr: true`, `staleMaxAge` 86400 s (24 h). Native TTL = 28 h.
- Cache function name `github-user-v2`; key = `username.toLowerCase()`.
- The cached function's **first argument is the h3 event** (ocache only uses `event.req.waitUntil` when `args[0]` is an HTTP event).
- `ServiceError` is thrown inside the cached function (never cached) and returned to `renderTrophyResponse` as today. Response bodies, statuses and `Cache-Control` values stay unchanged.
- Cached values are plain JSON; rehydrate with `UserInfo.fromJSON`.
- Env override `TROPHY_CACHE_DRIVER`: `auto` (default) | `memory` | `fs` | `redis` | `upstash` | `cloudflare-kv` | `vercel` | `netlify` | `deno-kv` | `none`. Other vars: `TROPHY_KV_BINDING` (default `TROPHY_KV`), `TROPHY_CACHE_DIR` (default `.data/cache`), `REDIS_URL`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` with fallback `KV_REST_API_URL`/`KV_REST_API_TOKEN`.
- Legacy `NITRO_STORAGE_TROPHY_DRIVER` (`memory|fs|redis|cloudflare-kv-binding`), `NITRO_STORAGE_TROPHY_BINDING`, `NITRO_STORAGE_TROPHY_PATH` are mapped, with a build-time deprecation warning. `TROPHY_*` wins if both are set.
- **No secrets in driver options** (they are `JSON.stringify`-ed into the bundle). Redis/Upstash wrappers read env at runtime.
- Default Node and Cloudflare builds need no extra npm installs. An opted-in driver with a missing dep (`ioredis`, `@upstash/redis`, `@netlify/blobs`) fails the build with a clear message naming the package.
- Workers Builds runs `pnpm run build` + `npx wrangler deploy` and installs with pnpm 9. Don't add anything pnpm 9 rejects.
- Nitro docs aren't bundled; read `node_modules/nitro/dist` (types in `dist/types/index.d.mts`, cache runtime in `dist/runtime/internal/cache.mjs`).
- Imports in server/lib/test code use `~/*` with explicit `.ts`. `nitro.config.ts` and `modules/` use relative imports.
- Never deploy, never push. Commits: conventional style, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Concurrent requests for the same uncached user** (a README with two badges): expect a single GitHub call. ocache dedupes in-flight resolves (`pending` map). Pinned in Task 3.
2. **Mixed-case usernames** (`TorVaLDS` then `torvalds`): one entry, one GitHub call, and the rendered SVG is identical. Pinned in Task 3.
3. **Storage that throws on every get/set** (KV down, write-quota exceeded): the user still renders and the error is logged, not a 500. Pinned in Task 3.
4. **Cloudflare deploy without a `TROPHY_KV` binding**: serves from memory with exactly one warning per isolate, not one per request. Pinned in Task 2.
5. **Invalid `TROPHY_CACHE_DRIVER` value** (typo `reddis`): the build fails with a message listing the allowed values, instead of silently using memory. Pinned in Task 1.

---

### Task 1: Pure cache resolver

**Files:**
- Create: `modules/trophy-cache/resolve.ts`
- Test: `test/unit/cache-resolver.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CacheDriverName = "auto" | "memory" | "fs" | "redis" | "upstash" | "cloudflare-kv" | "vercel" | "netlify" | "deno-kv" | "none";
  export type KVDriverId = "cloudflare-kv-fallback" | "redis-env" | "upstash-env" | "vercel-runtime-cache" | "deno-kv" | "netlify-blobs";
  export interface ResolvedCache {
    label: string;                 // e.g. "cloudflare-kv (TROPHY_KV)", for the build log
    cacheDriver: "memory" | "fs" | "kv";
    fsDir?: string;                // when cacheDriver === "fs"
    kvMount?: { driver: KVDriverId; options: Record<string, string> }; // when "kv"; options never contain secrets
    bypass: boolean;               // true only for "none"
    requiredDeps: string[];        // npm packages the chosen driver needs
    warnings: string[];            // deprecation notices
  }
  export function resolveCacheConfig(input: { preset: string; dev: boolean; env: Record<string, string | undefined> }): ResolvedCache;
  ```
- Mapping (auto, `dev: false`): preset starting with `cloudflare` → kv `cloudflare-kv-fallback` `{ binding }`; starting with `vercel` → kv `vercel-runtime-cache` `{}`; `deno-server` or starting with `deno` → kv `deno-kv` `{}`; starting with `netlify` → `memory`; anything else → `memory`.
- `dev: true` and no explicit override → `fs` with `fsDir` default `.data/cache`.
- Explicit: `memory`; `fs` (+`TROPHY_CACHE_DIR`); `redis` → kv `redis-env` `{}`, deps `["ioredis"]`; `upstash` → kv `upstash-env` `{}`, deps `["@upstash/redis"]`; `cloudflare-kv` → kv `cloudflare-kv-fallback` `{ binding }`; `vercel`; `netlify` → kv `netlify-blobs` `{ name: "trophy-cache" }`, deps `["@netlify/blobs"]`; `deno-kv`; `none` → `cacheDriver: "memory"`, `bypass: true`.
- Unknown value → `throw new Error` containing the bad value and every allowed name.

- [ ] **Step 1: Write failing tests** in `test/unit/cache-resolver.spec.ts`, one `it` per row:
  - `{preset:"cloudflare-module", dev:false, env:{}}` → `cacheDriver "kv"`, `kvMount { driver:"cloudflare-kv-fallback", options:{ binding:"TROPHY_KV" } }`, `bypass false`, `requiredDeps []`.
  - `cloudflare-pages` → same driver. `TROPHY_KV_BINDING:"MY_KV"` → `binding "MY_KV"`.
  - `vercel` → kv `vercel-runtime-cache`; `deno-server` → kv `deno-kv`; `netlify` → `cacheDriver "memory"`; `node-server`, `bun`, `aws-lambda` → `memory`.
  - `node-server, dev:true` → `cacheDriver "fs"`, `fsDir ".data/cache"`; with `TROPHY_CACHE_DIR:"/tmp/c"` → `fsDir "/tmp/c"`; `dev:true` + `TROPHY_CACHE_DRIVER:"memory"` → `memory`.
  - `TROPHY_CACHE_DRIVER:"redis"` on `vercel` → kv `redis-env`, `requiredDeps ["ioredis"]`, and `JSON.stringify(result)` does not contain `REDIS_URL`'s value when `env.REDIS_URL = "redis://secret@h:6379"`.
  - `upstash` → kv `upstash-env`, deps `["@upstash/redis"]`, no token value in output.
  - `netlify` explicit → kv `netlify-blobs`, options `{ name: "trophy-cache" }`, deps `["@netlify/blobs"]`.
  - `none` → `bypass true`.
  - Legacy: `NITRO_STORAGE_TROPHY_DRIVER:"cloudflare-kv-binding", NITRO_STORAGE_TROPHY_BINDING:"OLD"` on `node-server` → kv `cloudflare-kv-fallback` `{binding:"OLD"}`, `warnings.length === 1`, warning mentions `TROPHY_CACHE_DRIVER`. `NITRO_STORAGE_TROPHY_DRIVER:"fs", NITRO_STORAGE_TROPHY_PATH:"x"` → `fs`, `fsDir "x"`. Both legacy and `TROPHY_CACHE_DRIVER:"memory"` set → `memory`.
  - Review Focus 5: `TROPHY_CACHE_DRIVER:"reddis"` → throws, message contains `reddis` and `upstash`.
- [ ] **Step 2:** `pnpm vitest run test/unit/cache-resolver.spec.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `resolveCacheConfig` in `modules/trophy-cache/resolve.ts` (no Nitro imports; pure).
- [ ] **Step 4:** Run the spec → PASS; `pnpm typecheck` clean (make sure `modules/` is covered by tsconfig `include`; add it if not).
- [ ] **Step 5:** Commit `feat(cache): pure resolver choosing the cache driver per platform`.

### Task 2: Wrapper drivers

**Files:**
- Create: `modules/trophy-cache/drivers/cloudflare-kv-fallback.ts`, `modules/trophy-cache/drivers/redis-env.ts`, `modules/trophy-cache/drivers/upstash-env.ts`
- Test: `test/unit/cache-drivers.spec.ts`

**Interfaces:**
- Each file `export default` an unstorage driver factory (use `defineDriver` from `unstorage`, matching how built-ins in `node_modules/unstorage/dist/drivers/*.mjs` are written). Nitro mounts them by module path (Task 4).
- `cloudflare-kv-fallback(opts: { binding: string; getBinding?: (name: string) => unknown | undefined })`:
  - On first operation, look up the binding the same way unstorage's `cloudflare-kv-binding` does (read that driver's source and reuse its lookup). `getBinding` is a test seam overriding the lookup.
  - Binding found → delegate every op to `cloudflare-kv-binding({ binding })`, so native TTL with min 60 s keeps working.
  - Not found → delegate to unstorage `memory` driver and `console.warn` **once per driver instance**: `[trophy-cache] KV binding "<name>" not found — using in-memory cache. Create a KV namespace and bind it as <name> to persist.`
- `redis-env()`: lazily builds the unstorage `redis` driver with `{ url: process.env.REDIS_URL }` on first op. If `REDIS_URL` is unset, throws `Error("[trophy-cache] TROPHY_CACHE_DRIVER=redis requires REDIS_URL")`. ocache catches it as a cache error, so rendering still works.
- `upstash-env()`: lazily builds unstorage `upstash` with `url = UPSTASH_REDIS_REST_URL ?? KV_REST_API_URL`, `token = UPSTASH_REDIS_REST_TOKEN ?? KV_REST_API_TOKEN`. If either is missing, throws a similar named error.

- [ ] **Step 1: Write failing tests** (`test/unit/cache-drivers.spec.ts`, using `createStorage` from `unstorage` with each driver):
  - fallback, `getBinding: () => undefined`: `setItem("a", {x:1})` then `getItem("a")` → `{x:1}`; spy `console.warn` called exactly once after 3 operations; message contains `TROPHY_KV`.
  - fallback, `getBinding` returning a fake KVNamespace (object with `get`/`put`/`delete`/`list` vi.fn implementations backed by a Map): `setItem("k", "v", { ttl: 10 })` calls fake `put` with `expirationTtl: 60` (min TTL); no warning.
  - redis-env with `REDIS_URL` deleted: `getItem("x")` rejects with a message containing `REDIS_URL`. Creating the driver does not throw (lazy).
  - upstash-env with only `KV_REST_API_URL`/`KV_REST_API_TOKEN` set: assert the options passed to the inner upstash driver use them. Mock the `unstorage/drivers/upstash` module with `vi.mock` so no network or dep is needed. Missing token → rejects naming `UPSTASH_REDIS_REST_TOKEN`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the three drivers.
- [ ] **Step 4:** Run → PASS; `pnpm typecheck` clean.
- [ ] **Step 5:** Commit `feat(cache): fallback KV driver and runtime-env Redis/Upstash drivers`.

### Task 3: Cached user resolver + pure core wiring

**Files:**
- Create: `server/utils/github-user.ts`
- Modify: `server/utils/render.ts` (`RenderDeps`, lookup block), `server/routes/index.get.ts`, `nitro.config.ts` (remove `runtimeConfig.cacheTtlMs`)
- Delete: `server/utils/cache.ts`, `test/integration/cache.spec.ts`
- Test: create `test/integration/github-user.spec.ts`; modify `test/integration/route.spec.ts` (replace `makeMemoryCache`)

**Interfaces:**
- `server/utils/github-user.ts`:
  ```ts
  export const USER_CACHE_OPTIONS: { name: "github-user-v2"; maxAge: 14400; swr: true; staleMaxAge: 86400 };
  export interface UserResolverDeps { tokens: string[]; endpoint: string; fetchImpl?: typeof fetch; bypass?: boolean; storage?: unknown /* ocache StorageOption, test seam */ }
  export type ResolveUser = (event: HTTPEvent, username: string) => Promise<UserInfo | ServiceError>;
  export function createUserResolver(deps: UserResolverDeps): ResolveUser;
  ```
  Built with `defineCachedFunction` from `nitro/cache`. Inner fn `(event, username)` calls `fetchUserInfo`, **throws** a `ServiceError`, and returns plain JSON on success. Options: `...USER_CACHE_OPTIONS`, `getKey: (_e, u) => u.toLowerCase()`, `shouldBypassCache: () => deps.bypass === true`, plus `storage` when provided. The outer function catches `ServiceError` and returns it, rethrows anything else, and rehydrates success via `UserInfo.fromJSON`.
- `RenderDeps` becomes `{ tokens: string[]; resolveUser: (username: string) => Promise<UserInfo | ServiceError> }` (drop `endpoint`, `fetchImpl`, `getCachedUser`, `setCachedUser`). The no-token 502 check stays in `renderTrophyResponse`, before `resolveUser`.
- Route: lazily create one resolver per isolate from `getTokens()`, the runtime `githubEndpoint`, and `bypass = useRuntimeConfig().trophyCacheBypass === true` (set by Task 4). Pass `resolveUser: (u) => resolver(event, u)`. Recreate if the token list changes between calls (compare joined string).

- [ ] **Step 1: Write failing tests** in `test/integration/github-user.spec.ts` (msw on `https://api.github.com/graphql`, fixture `user-torvalds.json`, `storage` = a fresh ocache memory storage per test: check `node_modules/.pnpm/ocache@0.3.2/node_modules/ocache/dist/index.d.mts` for `createMemoryStorage`; fake event = `{ req: new Request("http://x/") }` cast to `HTTPEvent`):
  - two sequential calls `resolve(ev, "torvalds")` → both `instanceof UserInfo`, equal `totalCommits`, msw hit count 1.
  - Review Focus 2: `resolve(ev, "TorVaLDS")` then `resolve(ev, "torvalds")` → hit count 1.
  - Review Focus 1: `await Promise.all([resolve(ev,"torvalds"), resolve(ev,"torvalds")])` → hit count 1.
  - msw returns `{ data: { user: null } }` → result `instanceof ServiceError` with `code 404`; a second call hits GitHub again (count 2: not cached).
  - Review Focus 3: storage whose `get`/`set` always throw → still returns `UserInfo`; `console.error` spy called (Nitro's default `onError` logs `[cache]`).
  - `bypass: true` → two calls, hit count 2.
  - Serialization: the stored entry value (read back from the storage) is a plain object (`Object.getPrototypeOf(v) === Object.prototype`), not a `UserInfo` instance.
- [ ] **Step 2:** In `route.spec.ts`, replace `makeMemoryCache()` uses with `resolveUser` built from `createUserResolver({ tokens:["test-token"], endpoint: ENDPOINT, storage: <fresh memory storage> })`, adapted to `(u) => resolver(fakeEvent, u)`. Keep every existing assertion (statuses, headers, bodies, "second call served from cache, GitHub not called again").
- [ ] **Step 3:** Run `pnpm vitest run test/integration` → FAIL.
- [ ] **Step 4:** Implement `github-user.ts`, update `render.ts` and `index.get.ts`, delete `cache.ts` and `cache.spec.ts`, remove `cacheTtlMs`.
- [ ] **Step 5:** `pnpm test && pnpm typecheck` → all PASS.
- [ ] **Step 6:** Commit `feat(cache): cached GitHub user lookup with SWR, native TTL and case-insensitive keys`.

### Task 4: Nitro module wiring

**Files:**
- Create: `modules/trophy-cache/index.ts`
- Modify: `nitro.config.ts` (remove the `NITRO_STORAGE_TROPHY_*` block and the `kv` key; add `modules: [trophyCache]`), `package.json` (`build:cf` → `cross-env NITRO_PRESET=cloudflare_module vite build`)
- Test: `test/unit/cache-module.spec.ts`

**Interfaces:**
- Consumes: `resolveCacheConfig` (Task 1); driver files (Task 2); `trophyCacheBypass` read by the route (Task 3).
- `export default { name: "trophy-cache", setup(nitro) }` satisfying `NitroModule` (`node_modules/nitro/dist/types/index.d.mts`). In `setup`:
  1. `const r = resolveCacheConfig({ preset: nitro.options.preset, dev: nitro.options.dev, env: process.env })`.
  2. `r.warnings.forEach(w => nitro.logger.warn(w))`.
  3. For each `r.requiredDeps` package, check it resolves from `nitro.options.rootDir` (`createRequire`). If not, throw `Error("[trophy-cache] TROPHY_CACHE_DRIVER=<name> needs the \"<pkg>\" package: pnpm add <pkg>")`.
  4. `nitro.options.cache.driver = r.cacheDriver`. If `"fs"`, set `nitro.options.cache.fs = { dir: r.fsDir }`. If `"kv"`, set `nitro.options.kv.cache = { driver: <resolved>, ...r.kvMount.options }`, where `<resolved>` is the absolute path of `modules/trophy-cache/drivers/<id>.ts` for `cloudflare-kv-fallback`/`redis-env`/`upstash-env`, or the built-in name otherwise.
  5. `nitro.options.runtimeConfig.trophyCacheBypass = r.bypass`.
  6. `nitro.logger.info("[trophy-cache] preset=<preset> → <r.label>")`.
- The mount key is exactly `cache` (Nitro's `cache.driver: "kv"` uses it; see `hasCacheKVMount` in `node_modules/nitro/dist/_chunks/nitro.mjs`).

- [ ] **Step 1: Write failing tests** (`cache-module.spec.ts`) calling `setup` on a fake nitro `{ options: { preset, dev:false, rootDir: <repo root>, kv:{}, cache:{}, runtimeConfig:{} }, logger: { info: vi.fn(), warn: vi.fn() } }` with `process.env` stubbed via `vi.stubEnv`:
  - `cloudflare-module` → `options.cache.driver === "kv"`, `options.kv.cache.driver` ends with `cloudflare-kv-fallback.ts`, `options.kv.cache.binding === "TROPHY_KV"`, `logger.info` called with a string containing `cloudflare`.
  - `node-server` → `cache.driver "memory"`, `kv.cache` undefined.
  - `TROPHY_CACHE_DRIVER=none` → `runtimeConfig.trophyCacheBypass === true`.
  - `TROPHY_CACHE_DRIVER=redis` with `ioredis` not installed → throws a message containing `pnpm add ioredis`. (If `ioredis` happens to resolve, use `@netlify/blobs` with `netlify` instead; assert whichever is absent.)
  - Legacy var → `logger.warn` called once.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the module; update `nitro.config.ts` and `build:cf`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Build verification** (no deploy):
  - `pnpm build` → log line `preset=node-server → memory`.
  - `pnpm build:cf` → log shows cloudflare-kv; grep `.output/server` for `TROPHY_KV` and the fallback driver code; `.output/server/wrangler.json` (if generated) still declares binding `TROPHY_KV`.
  - `NITRO_PRESET=vercel pnpm build` → log `vercel-runtime-cache`, build succeeds. `NITRO_PRESET=netlify pnpm build` → `memory`. Restore with a normal `pnpm build` afterwards.
  - `TROPHY_CACHE_DRIVER=reddis pnpm build` → fails with the allowed-values message.
  - Record outputs in the report.
- [ ] **Step 6:** Commit `feat(cache): Nitro module auto-selects the cache driver from the detected preset`.

### Task 5: Cloudflare config + docs

**Files:**
- Modify: `wrangler.jsonc` (`kv_namespaces` → `[{ "binding": "TROPHY_KV" }]`, no `id`), `README.md`

**Interfaces:** none (config + docs). Legacy `v1-*` KV entries were already deleted by hand by the owner, so no purge script.

README content:
- New section **"Deploy anywhere"**: table platform → what to do → cache used:
  - Cloudflare Workers: nothing (first deploy auto-creates the `TROPHY_KV` namespace; without it, in-memory with a warning).
  - Vercel: nothing (Runtime Cache).
  - Deno Deploy: nothing (Deno KV).
  - Netlify: nothing (in-memory); opt-in Blobs = non-expiring.
  - Node/Docker/Bun: nothing (bounded in-memory LRU); `REDIS_URL` + `TROPHY_CACHE_DRIVER=redis` to share across instances.
  - Upstash on any platform.
- Environment table: new vars from Global Constraints; mark `NITRO_STORAGE_TROPHY_*` deprecated.
- Cloudflare section: drop "create namespace and paste id" (now optional, with auto-provisioning). Note that Workers Builds' plain `pnpm run build` is enough. Note the KV free-plan daily write cap (each miss/refresh = 1 write; failures degrade to uncached).
- Caching explained in 3 lines: 4 h fresh, up to 24 h more served stale while refreshing, case-insensitive.

- [ ] **Step 1:** Edit `wrangler.jsonc` and README.
- [ ] **Step 2:** `pnpm test && pnpm typecheck && pnpm build:cf` → PASS; `.output/server/wrangler.json` (if generated) has binding `TROPHY_KV` with no foreign `id`.
- [ ] **Step 3:** Commit `feat(cache): auto-provisioned KV binding and deploy-anywhere docs`.

### Task 6: End-to-end local verification

**Files:** none (report only, unless a bug is found; then report it, don't patch product code).

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm build && pnpm build:cf` → all pass; record test count.
- [ ] **Step 2:** `pnpm build:cf`, then `npx wrangler dev --local` (it simulates KV locally; needs a GitHub token. If `GITHUB_TOKEN` isn't available in the environment, verify the no-token 502 path plus the startup log only, and say so). With a token: request `/?username=octocat` twice, then `npx wrangler kv key list --binding TROPHY_KV --local` shows one key under the `cache:nitro/functions:github-user-v2:` prefix. Request `/?username=OctoCat` → no new key.
- [ ] **Step 3:** Start `node .output/server/index.mjs` after `pnpm build` (node preset) → landing 200, startup has no cache errors. Stop all servers.
- [ ] **Step 4:** Report. Production checks are for the finishing step, not this task: the PR's Workers Builds log confirms the existing namespace is reused (spec 6.3b).
