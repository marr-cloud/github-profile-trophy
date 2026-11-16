This project is based on [Nitro v3](https://nitro.build), [h3](https://h3.dev/), [Vite](https://vite.dev/) and [rolldown](https://rolldown.rs/).

Refer to https://nitro.build/docs (the installed `nitro` package ships no bundled docs; see `node_modules/nitro/README.md` and `node_modules/nitro/dist/types`) when working on server (your knowledge about Nitro v3 is likely outdated!).

## Project Structure

`server/` contains server-side code with supported subdirs (create as needed): `api/` (/api prefixed handlers), `routes/` (non-prefixed route handlers), `middleware/`, `plugins/`, `utils/`, `assets/`, and `tasks/`. `lib/` holds framework-agnostic modules imported by the server (e.g. `lib/trophy/`). `public/` holds static assets (copied, not bundled). Config files: `vite.config.ts` (loads `nitro/vite` plugin), `nitro.config.ts` (serverDir, routeRules, preset, etc.), `tsconfig.json` (extends nitro/tsconfig, `~/*` path alias).

## Conventions

- Path alias `~/*` (tsconfig), use explicit `.ts` extensions
