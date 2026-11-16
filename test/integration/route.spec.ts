import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer } from "~/test/setup.ts";
import { H3, defineEventHandler, getRequestURL } from "nitro/h3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import routeHandler from "~/server/routes/index.get.ts";
import { renderTrophyResponse, type RenderDeps } from "~/server/utils/render.ts";
import type { HTTPEvent } from "nitro/h3";
import { createUserResolver } from "~/server/utils/github-user.ts";
import { CSP, type ContentKind } from "~/lib/trophy/security-headers.ts";
import faviconHandler from "~/server/routes/favicon.ico.get.ts";

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

function makeMemoryStorage() {
  const map = new Map<string, unknown>();
  return {
    get: async (key: string) => (map.get(key) ?? null) as never,
    set: async (key: string, value: unknown) => {
      map.set(key, value);
    },
  };
}

const fakeEvent = { req: new Request("http://x/") } as unknown as HTTPEvent;

/** Fresh deps (own resolver + own storage) per call. */
function makeDeps(): RenderDeps {
  const resolver = createUserResolver({
    tokens: ["test-token"],
    endpoint: ENDPOINT,
    storage: makeMemoryStorage(),
  });
  return { tokens: ["test-token"], resolveUser: (u) => resolver(fakeEvent, u) };
}

const CACHE_HEADER = "public, max-age=18800, s-maxage=28800, stale-while-revalidate=86400";

describe("GET / (real production route)", () => {
  it("missing username returns 200 query-builder HTML with cache header", async () => {
    const r = await invoke(realRouteApp(), "/");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe(CACHE_HEADER);
    expect(r.body).toContain('id="builder"');
    expect(r.body).toContain('id="preview"');
    expect(r.body).toContain("octocat");
  });

  it("returns 502 HTML when no GitHub token is configured", async () => {
    const r = await invoke(realRouteApp(), "/?username=someone");
    expect(r.status).toBe(502);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
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
    const app = testRouteApp(makeDeps());

    const r1 = await invoke(app, "/?username=torvalds&theme=onedark");
    expect(r1.status).toBe(200);
    expect(r1.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
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
    const app = testRouteApp(makeDeps());

    const r = await invoke(app, "/?username=other");
    expect(r.status).toBe(419);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("user-not-found maps to 404", async () => {
    mswServer.use(
      http.post(ENDPOINT, () => HttpResponse.json({ data: { user: null } })),
    );
    const app = testRouteApp(makeDeps());

    const r = await invoke(app, "/?username=ghost");
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("upstream failure maps to 502", async () => {
    mswServer.use(
      http.post(ENDPOINT, () => new HttpResponse(null, { status: 500 })),
    );
    const app = testRouteApp(makeDeps());

    const r = await invoke(app, "/?username=other");
    expect(r.status).toBe(502);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});

function expectSecurity(r: Invoked, kind: ContentKind) {
  expect(r.headers.get("content-security-policy")).toBe(CSP[kind]);
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  expect(r.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  expect(r.headers.get("strict-transport-security")).toBeTruthy();
  expect(r.headers.get("x-frame-options")).toBeNull();
}

describe("security headers on responses", () => {
  const deps = () => makeDeps();

  it("landing", async () => {
    expectSecurity(await invoke(testRouteApp(deps()), "/"), "landing");
  });

  it("svg", async () => {
    mswServer.use(http.post(ENDPOINT, () => HttpResponse.json({ data: { user: fixture } })));
    expectSecurity(await invoke(testRouteApp(deps()), "/?username=torvalds"), "svg");
  });

  it("404", async () => {
    mswServer.use(http.post(ENDPOINT, () => HttpResponse.json({ data: { user: null } })));
    expectSecurity(await invoke(testRouteApp(deps()), "/?username=ghost"), "error");
  });

  it("419", async () => {
    mswServer.use(http.post(ENDPOINT, () => new HttpResponse(null, { status: 429 })));
    expectSecurity(await invoke(testRouteApp(deps()), "/?username=other"), "error");
  });

  it("502", async () => {
    mswServer.use(http.post(ENDPOINT, () => new HttpResponse(null, { status: 500 })));
    expectSecurity(await invoke(testRouteApp(deps()), "/?username=other"), "error");
  });

  it("real route: landing and no-token 502", async () => {
    expectSecurity(await invoke(realRouteApp(), "/"), "landing");
    expectSecurity(await invoke(realRouteApp(), "/?username=someone"), "error");
  });

  it("favicon", async () => {
    const app = new H3();
    app.get("/favicon.ico", faviconHandler);
    expectSecurity(await invoke(app, "/favicon.ico"), "svg");
  });
});
