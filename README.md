# github-profile-trophy — vendor-agnostic Nitro edition

Byte-similar reimplementation of [ryo-ma/github-profile-trophy](https://github.com/ryo-ma/github-profile-trophy) on top of Nitro v3 + h3 + Vite. Deploys to any Nitro preset — node-server, vercel, cloudflare, deno-deploy, netlify, bun, aws-lambda — without code changes.

**Live:** [trophy.maurrod.dev](https://trophy.maurrod.dev/) — open it to build and preview your card (Mozilla HTTP Observatory: A+).

## Usage

`GET /?username=<login>` returns an SVG. All upstream parameters are supported drop-in:

| Param      | Default | Notes                                                 |
|------------|---------|-------------------------------------------------------|
| username   | (req'd) | GitHub login                                          |
| theme      | default | 25 themes; unknown → default                          |
| column     | 8       | `-1` = adaptive width                                 |
| row        | 3       |                                                       |
| margin-w   | 0       |                                                       |
| margin-h   | 0       |                                                       |
| no-bg      | false   |                                                       |
| no-frame   | false   |                                                       |
| title      | (all)   | CSV; prefix `-` to exclude; exclusions win            |
| rank       | (all)   | CSV; prefix `-` to exclude; exclusions win            |

Example: `<img src="https://YOUR-HOST/?username=torvalds&theme=onedark&column=7" />`

### Filtering

`title` and `rank` take comma-separated values. Plain values include (restrict to those), `-` prefixed values exclude (remove). Exclusion always wins. Title aliases (e.g. `Star`) are accepted for both inclusion and exclusion.

- `rank=-C` — everything except rank C
- `rank=SS,S,-C` — only SS and S (C removed; exclusion wins on conflict)
- `title=-Star` — all trophies except the Stars one

Behavior changes vs upstream:

- Mixed lists such as `rank=S,-C` now mean "only S, minus C" (previously the `S` include was ignored). Rank matching is exact: `S` does not match `SS`.
- Alias exclusions such as `title=-Star` now work (upstream only matched exact exclusion names).

### Embedding

Output works in `<img>` and `<iframe>` from any origin: responses send `frame-ancestors *` in the CSP and `Cross-Origin-Resource-Policy: cross-origin`. `X-Frame-Options` is intentionally not set. Note: per CSP3, `frame-ancestors *` does not match opaque-origin ancestors (sandboxed iframes without `allow-same-origin`) or `file:`/`data:` pages, so framing the landing page from those is blocked; `<img>` embeds are unaffected.

## Caching

- Each GitHub user lookup is fresh for 4 h; for up to 24 h more it is served stale while a background refresh runs.
- Usernames are case-insensitive (`Torvalds` and `torvalds` share one entry).
- Errors are never stored, and invalid GitHub logins return 404 without calling GitHub.

## Deploy anywhere

The cache driver is chosen automatically from the detected Nitro preset at build time (`vite dev` uses the filesystem, `.data/cache`).

| Platform | What to do | Cache used |
|----------|------------|------------|
| Cloudflare Workers | Nothing. The first deploy auto-creates the `TROPHY_KV` namespace. | KV binding `TROPHY_KV` (without the binding: in-memory, with one warning) |
| Vercel | Nothing. | Vercel Runtime Cache |
| Deno Deploy | Nothing. | Deno KV |
| Netlify | Nothing. | In-memory. Opt-in Netlify Blobs (`TROPHY_CACHE_DRIVER=netlify`, `pnpm add @netlify/blobs`) does not expire entries. |
| Node / Docker / Bun | Nothing. | Bounded in-memory LRU. Set `REDIS_URL` + `TROPHY_CACHE_DRIVER=redis` (`pnpm add ioredis`) to share across instances. |
| Any platform | Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` and `TROPHY_CACHE_DRIVER=upstash` (`pnpm add @upstash/redis`). | Upstash Redis |

If an optional driver package is missing, the build fails with a clear message.

## Environment

| Var                             | Purpose                                          | Default          |
|---------------------------------|--------------------------------------------------|------------------|
| `GITHUB_TOKEN`                  | Comma-separated PATs                             | —                |
| `GITHUB_TOKEN1`, `GITHUB_TOKEN2`| Upstream-compat aliases                          | —                |
| `NITRO_PRESET`                  | Deploy target                                    | `node-server`    |
| `TROPHY_CACHE_DRIVER`           | `auto` / `memory` / `fs` / `redis` / `upstash` / `cloudflare-kv` / `vercel` / `netlify` / `deno-kv` / `none` | `auto` |
| `TROPHY_KV_BINDING`             | KV binding name for the Cloudflare driver        | `TROPHY_KV`      |
| `TROPHY_CACHE_DIR`              | Directory for the `fs` driver                    | `.data/cache`    |
| `REDIS_URL`                     | Redis connection (runtime), driver `redis`       | —                |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash credentials (runtime); `KV_REST_API_URL` / `KV_REST_API_TOKEN` also work | — |
| `NITRO_STORAGE_TROPHY_DRIVER`, `_BINDING`, `_PATH` | Deprecated: still honored with a warning; use the `TROPHY_*` vars | — |
| `TROPHY_GITHUB_ENDPOINT`        | override GraphQL URL (GHES/tests)                | `https://api.github.com/graphql` |

On Cloudflare Workers, set the runtime token via `wrangler secret put NITRO_GITHUB_TOKENS` — Nitro maps `NITRO_*` env vars into `useRuntimeConfig()` at runtime (see the Cloudflare deploy section below).

## Develop

```bash
pnpm install
pnpm dev             # http://localhost:3000
pnpm test            # vitest run
pnpm test:cov        # with coverage
pnpm build           # NITRO_PRESET=node-server by default
```

## Deploy

Pick your preset and build:

```bash
NITRO_PRESET=vercel pnpm build
NITRO_PRESET=cloudflare_module pnpm build
NITRO_PRESET=deno-deploy pnpm build
NITRO_PRESET=node-server pnpm build
```

### Cloudflare Workers (with KV cache)

Prereqs: [`wrangler`](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and logged in (`wrangler login`), and a GitHub PAT with `public_repo` + `read:user` scopes (create at <https://github.com/settings/tokens>).

`wrangler.jsonc` declares the `TROPHY_KV` binding without an `id`; Wrangler 4.x auto-provisions the namespace on the first deploy, so there is nothing to create or paste. Without the binding the app falls back to in-memory cache and logs one warning. Cloudflare Workers Builds needs no special build command: plain `pnpm run build` + `npx wrangler deploy` auto-detects Cloudflare.

The KV free plan has a daily write cap. Each cache miss or background refresh is one write; if writes fail the request degrades to uncached instead of erroring.

1. **Build for Cloudflare** (works in bash / zsh / PowerShell / cmd via `cross-env`; sets `NITRO_PRESET=cloudflare_module`):

   ```bash
   pnpm build:cf
   ```

2. **Store your GitHub PAT** as a Worker secret. Nitro maps `NITRO_*` env vars into `useRuntimeConfig()` at runtime, so use this exact name:

   ```bash
   wrangler secret put NITRO_GITHUB_TOKENS
   # paste your PAT when prompted (comma-separated for multiple tokens)
   ```

3. **Deploy** (or use `pnpm deploy:cf` to build + deploy in one step):

   ```bash
   wrangler deploy
   ```

4. **Test** at `https://github-profile-trophy.<your-account>.workers.dev/?username=<your-github>&theme=onedark`.

5. **Custom domain** (optional; only if the zone is in your Cloudflare account): add a `routes` block to `wrangler.jsonc` and redeploy:

   ```jsonc
   "routes": [
     { "pattern": "trophy.maurrod.dev/*", "zone_name": "maurrod.dev", "custom_domain": true }
   ]
   ```

## Credits

Trophy artwork (`public/favicon.svg`, `app/assets/trophy.svg`) is the 🏆 glyph from [Twemoji](https://github.com/jdecked/twemoji) — © Twitter, Inc. and contributors, [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

MIT — see [LICENSE](LICENSE). Based on [ryo-ma/github-profile-trophy](https://github.com/ryo-ma/github-profile-trophy) (MIT, © 2020 ryo-ma).

Error responses are cached briefly: `404` (unknown user) with `public, max-age=300`; `419`/`502` (rate limit, upstream failure, missing token) with `no-store`.
