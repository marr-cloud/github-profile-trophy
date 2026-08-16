# github-profile-trophy — vendor-agnostic Nitro edition

Byte-similar reimplementation of [ryo-ma/github-profile-trophy](https://github.com/ryo-ma/github-profile-trophy) on top of Nitro v3 + h3 + Vite. Deploys to any Nitro preset — node-server, vercel, cloudflare, deno-deploy, netlify, bun, aws-lambda — without code changes.

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
| title      | (all)   | CSV; prefix `-` to exclude                            |
| rank       | (all)   | CSV; prefix `-` to exclude                            |

Example: `<img src="https://YOUR-HOST/?username=torvalds&theme=onedark&column=7" />`

## Environment

| Var                             | Purpose                                          | Default          |
|---------------------------------|--------------------------------------------------|------------------|
| `GITHUB_TOKEN`                  | Comma-separated PATs                             | —                |
| `GITHUB_TOKEN1`, `GITHUB_TOKEN2`| Upstream-compat aliases                          | —                |
| `NITRO_PRESET`                  | Deploy target                                    | `node-server`    |
| `NITRO_STORAGE_TROPHY_DRIVER`   | `memory` / `redis` / `fs` / `cloudflare-kv-binding` | `memory`      |
| `NITRO_STORAGE_TROPHY_BINDING`  | KV binding name when driver=cloudflare-kv-binding | `TROPHY_KV`     |
| `REDIS_URL`                     | when driver=redis                                | —                |
| `NITRO_STORAGE_TROPHY_PATH`     | when driver=fs                                   | `.data/trophy`   |
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

1. **Create the KV namespace** and copy the returned `id`:

   ```bash
   wrangler kv namespace create trophy_cache
   ```

2. **Paste that id** into `wrangler.jsonc` (replace `REPLACE_WITH_KV_NAMESPACE_ID`).

3. **Build for Cloudflare** (works in bash / zsh / PowerShell / cmd via `cross-env`):

   ```bash
   pnpm build:cf
   ```

4. **Store your GitHub PAT** as a Worker secret. Nitro maps `NITRO_*` env vars into `useRuntimeConfig()` at runtime, so use this exact name:

   ```bash
   wrangler secret put NITRO_GITHUB_TOKENS
   # paste your PAT when prompted (comma-separated for multiple tokens)
   ```

5. **Deploy** (or use `pnpm deploy:cf` to build + deploy in one step):

   ```bash
   wrangler deploy
   ```

6. **Test** at `https://github-profile-trophy.<your-account>.workers.dev/?username=<your-github>&theme=onedark`.

7. **Custom domain** (optional; only if the zone is in your Cloudflare account): add a `routes` block to `wrangler.jsonc` and redeploy:

   ```jsonc
   "routes": [
     { "pattern": "trophy.infraforge.cc/*", "zone_name": "infraforge.cc", "custom_domain": true }
   ]
   ```

## Credits

Trophy artwork (`public/favicon.svg`, `app/assets/trophy.svg`) is the 🏆 glyph from [Twemoji](https://github.com/jdecked/twemoji) — © Twitter, Inc. and contributors, [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

MIT.
