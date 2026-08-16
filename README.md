# github-profile-trophy — vendor-agnostic Nitro edition

Byte-similar reimplementation of [ryo-ma/github-profile-trophy](https://github.com/ryo-ma/github-profile-trophy) on top of Nitro v3 + h3 + Vite. Deploys to any Nitro preset — node-server, vercel, cloudflare, deno-deploy, netlify, bun, aws-lambda — without code changes.

## Usage

`GET /?username=<login>` returns an SVG. All upstream parameters are supported drop-in:

| Param      | Default | Notes                                                 |
|------------|---------|-------------------------------------------------------|
| username   | (req'd) | GitHub login                                          |
| theme      | default | 24 themes; unknown → default                          |
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
| `REDIS_URL`                     | when driver=redis                                | —                |
| `NITRO_STORAGE_TROPHY_PATH`     | when driver=fs                                   | `.data/trophy`   |
| `TROPHY_GITHUB_ENDPOINT`        | override GraphQL URL (GHES/tests)                | `https://api.github.com/graphql` |

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
NITRO_PRESET=cloudflare-module pnpm build
NITRO_PRESET=deno-deploy pnpm build
NITRO_PRESET=node-server pnpm build
```

## License

MIT.
