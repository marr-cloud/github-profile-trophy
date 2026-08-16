import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer } from "~/test/setup.ts";
import { H3, defineEventHandler, getRequestURL } from "nitro/h3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import routeHandler from "~/server/routes/index.get.ts";
import { renderTrophyResponse, type RenderDeps } from "~/server/utils/render.ts";
import type { UserInfo } from "~/lib/trophy/index.ts";

const ENDPOINT = "https://api.github.com/graphql";
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/user-torvalds.json", import.meta.url)), "utf8"),
);

interface Invoked {
  status: number;
  headers: Headers;
  body: string;
}

async function invoke(app: H3, url: string): Promise<Invoked> {
  const res = await app.fetch(new Request(`http://localhost${url}`));
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

/** Mounts the real, production `GET /` handler — no injected dependencies. */
function realRouteApp(): H3 {
  const app = new H3();
  app.get("/", routeHandler);
  return app;
}

/**
 * Mounts a route built from the same pure core (`renderTrophyResponse`) the
 * real route delegates to, but with fully injected dependencies so tests can
 * control tokens/endpoint/cache without booting Nitro (its `useRuntimeConfig`
 * / `useStorage` resolve to inert fallback stubs outside of a real Nitro
 * build — see server/routes/index.get.ts for why the production route can't
 * be driven this way directly).
 */
function testRouteApp(deps: RenderDeps): H3 {
  const app = new H3();
  app.get(
    "/",
    defineEventHandler(async (event) => {
      const url = getRequestURL(event);
      const result = await renderTrophyResponse(url, deps);
      for (const [name, value] of Object.entries(result.headers)) {
        event.res.headers.set(name, value);
      }
      event.res.status = result.status;
      return result.body;
    }),
  );
  return app;
}

function makeMemoryCache() {
  const memory = new Map<string, UserInfo>();
  return {
    getCachedUser: async (username: string) => memory.get(username) ?? null,
    setCachedUser: async (username: string, info: UserInfo) => {
      memory.set(username, info);
    },
  };
}

const CACHE_HEADER = "public, max-age=18800, s-maxage=28800, stale-while-revalidate=86400";

describe("GET / (real production route)", () => {
  it("missing username returns 400 HTML with cache header", async () => {
    const r = await invoke(realRouteApp(), "/");
    expect(r.status).toBe(400);
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    expect(r.headers.get("cache-control")).toBe(CACHE_HEADER);
    expect(r.body).toContain('name="username"');
  });

  it("returns 502 HTML when no GitHub token is configured", async () => {
    const r = await invoke(realRouteApp(), "/?username=someone");
    expect(r.status).toBe(502);
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    expect(r.headers.get("cache-control")).toBe(CACHE_HEADER);
    expect(r.body).toContain("no GitHub token");
  });
});

describe("GET / (pure core, injected dependencies)", () => {
  it("returns SVG on happy path and caches for the next call", async () => {
    let calls = 0;
    mswServer.use(
      http.post(ENDPOINT, () => {
        calls++;
        return HttpResponse.json({ data: { user: fixture } });
      }),
    );
    const app = testRouteApp({
      tokens: ["test-token"],
      endpoint: ENDPOINT,
      ...makeMemoryCache(),
    });

    const r1 = await invoke(app, "/?username=torvalds&theme=onedark");
    expect(r1.status).toBe(200);
    expect(r1.headers.get("content-type")).toMatch(/image\/svg\+xml/);
    expect(r1.headers.get("cache-control")).toBe(CACHE_HEADER);
    expect(r1.body).toContain("<svg");

    const r2 = await invoke(app, "/?username=torvalds&theme=onedark");
    expect(r2.status).toBe(200);
    expect(calls).toBe(1); // second call served from cache, GitHub not called again
  });

  it("rate limit maps to 419", async () => {
    mswServer.use(
      http.post(ENDPOINT, () => new HttpResponse(null, { status: 429 })),
    );
    const app = testRouteApp({
      tokens: ["test-token"],
      endpoint: ENDPOINT,
      ...makeMemoryCache(),
    });

    const r = await invoke(app, "/?username=other");
    expect(r.status).toBe(419);
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    expect(r.headers.get("cache-control")).toBe(CACHE_HEADER);
  });

  it("user-not-found maps to 404", async () => {
    mswServer.use(
      http.post(ENDPOINT, () => HttpResponse.json({ data: { user: null } })),
    );
    const app = testRouteApp({
      tokens: ["test-token"],
      endpoint: ENDPOINT,
      ...makeMemoryCache(),
    });

    const r = await invoke(app, "/?username=ghost");
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    expect(r.headers.get("cache-control")).toBe(CACHE_HEADER);
  });

  it("upstream failure maps to 502", async () => {
    mswServer.use(
      http.post(ENDPOINT, () => new HttpResponse(null, { status: 500 })),
    );
    const app = testRouteApp({
      tokens: ["test-token"],
      endpoint: ENDPOINT,
      ...makeMemoryCache(),
    });

    const r = await invoke(app, "/?username=other");
    expect(r.status).toBe(502);
    expect(r.headers.get("content-type")).toMatch(/text\/html/);
    expect(r.headers.get("cache-control")).toBe(CACHE_HEADER);
  });
});
