import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HTTPEvent } from "nitro/h3";
import { mswServer } from "~/test/setup.ts";
import { ServiceError, UserInfo } from "~/lib/trophy/index.ts";
import { createUserResolver } from "~/server/utils/github-user.ts";

const ENDPOINT = "https://api.github.com/graphql";
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/user-torvalds.json", import.meta.url)), "utf8"),
);

const ev = { req: new Request("http://x/") } as unknown as HTTPEvent;

/** Minimal ocache StorageInterface backed by a Map (ocache itself is not a direct dependency). */
function memoryStorage() {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (key: string) => (map.get(key) ?? null) as never,
    set: async (key: string, value: unknown) => {
      map.set(key, value);
    },
  };
}

function countingHandler(body: () => Response, counter: { n: number }) {
  return http.post(ENDPOINT, () => {
    counter.n++;
    return body();
  });
}

const ok = () => HttpResponse.json({ data: { user: fixture } });

afterEach(() => vi.restoreAllMocks());

describe("createUserResolver", () => {
  it("caches: two sequential calls hit GitHub once", async () => {
    const c = { n: 0 };
    mswServer.use(countingHandler(ok, c));
    const resolve = createUserResolver({ tokens: ["t"], endpoint: ENDPOINT, storage: memoryStorage() });
    const a = await resolve(ev, "torvalds");
    const b = await resolve(ev, "torvalds");
    expect(a).toBeInstanceOf(UserInfo);
    expect(b).toBeInstanceOf(UserInfo);
    expect((a as UserInfo).totalCommits).toBe((b as UserInfo).totalCommits);
    expect(c.n).toBe(1);
  });

  it("keys are case-insensitive", async () => {
    const c = { n: 0 };
    mswServer.use(countingHandler(ok, c));
    const resolve = createUserResolver({ tokens: ["t"], endpoint: ENDPOINT, storage: memoryStorage() });
    await resolve(ev, "TorVaLDS");
    await resolve(ev, "torvalds");
    expect(c.n).toBe(1);
  });

  it("dedupes concurrent resolves", async () => {
    const c = { n: 0 };
    mswServer.use(countingHandler(ok, c));
    const resolve = createUserResolver({ tokens: ["t"], endpoint: ENDPOINT, storage: memoryStorage() });
    const [a, b] = await Promise.all([resolve(ev, "torvalds"), resolve(ev, "torvalds")]);
    expect(a).toBeInstanceOf(UserInfo);
    expect(b).toBeInstanceOf(UserInfo);
    expect(c.n).toBe(1);
  });

  it("returns ServiceError 404 and does not cache it", async () => {
    const c = { n: 0 };
    mswServer.use(countingHandler(() => HttpResponse.json({ data: { user: null } }), c));
    const resolve = createUserResolver({ tokens: ["t"], endpoint: ENDPOINT, storage: memoryStorage() });
    const a = await resolve(ev, "ghost");
    expect(a).toBeInstanceOf(ServiceError);
    expect((a as ServiceError).code).toBe(404);
    await resolve(ev, "ghost");
    expect(c.n).toBe(2);
  });

  it("storage failures are logged and still render", async () => {
    const c = { n: 0 };
    mswServer.use(countingHandler(ok, c));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = {
      get: async () => {
        throw new Error("boom");
      },
      set: async () => {
        throw new Error("boom");
      },
    };
    const resolve = createUserResolver({ tokens: ["t"], endpoint: ENDPOINT, storage });
    const a = await resolve(ev, "torvalds");
    expect(a).toBeInstanceOf(UserInfo);
    expect(spy).toHaveBeenCalled();
  });

  it("bypass skips the cache", async () => {
    const c = { n: 0 };
    mswServer.use(countingHandler(ok, c));
    const resolve = createUserResolver({ tokens: ["t"], endpoint: ENDPOINT, bypass: true, storage: memoryStorage() });
    await resolve(ev, "torvalds");
    await resolve(ev, "torvalds");
    expect(c.n).toBe(2);
  });

  it("stores plain JSON, not a UserInfo instance", async () => {
    mswServer.use(countingHandler(ok, { n: 0 }));
    const storage = memoryStorage();
    const resolve = createUserResolver({ tokens: ["t"], endpoint: ENDPOINT, storage });
    await resolve(ev, "torvalds");
    expect(storage.map.size).toBeGreaterThan(0);
    const entry = [...storage.map.values()][0] as { value: unknown };
    expect(Object.getPrototypeOf(entry.value)).toBe(Object.prototype);
  });
});
