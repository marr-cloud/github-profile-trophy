import { describe, expect, it } from "vitest";
import { resolveCacheConfig } from "~/modules/trophy-cache/resolve.ts";

const r = (preset: string, env: Record<string, string | undefined> = {}, dev = false) =>
  resolveCacheConfig({ preset, dev, env });

describe("resolveCacheConfig", () => {
  it("cloudflare-module -> cloudflare-kv-fallback with default binding", () => {
    const res = r("cloudflare-module");
    expect(res.cacheDriver).toBe("kv");
    expect(res.kvMount).toEqual({ driver: "cloudflare-kv-fallback", options: { binding: "TROPHY_KV" } });
    expect(res.bypass).toBe(false);
    expect(res.requiredDeps).toEqual([]);
  });

  it("cloudflare-pages uses the same driver", () => {
    expect(r("cloudflare-pages").kvMount?.driver).toBe("cloudflare-kv-fallback");
  });

  it("TROPHY_KV_BINDING overrides the binding", () => {
    expect(r("cloudflare-module", { TROPHY_KV_BINDING: "MY_KV" }).kvMount?.options.binding).toBe("MY_KV");
  });

  it("vercel -> vercel-runtime-cache", () => {
    const res = r("vercel");
    expect(res.cacheDriver).toBe("kv");
    expect(res.kvMount).toEqual({ driver: "vercel-runtime-cache", options: {} });
  });

  it("deno-server -> deno-kv", () => {
    expect(r("deno-server").kvMount).toEqual({ driver: "deno-kv", options: {} });
  });

  it("netlify auto -> memory", () => {
    expect(r("netlify").cacheDriver).toBe("memory");
  });

  it.each(["node-server", "bun", "aws-lambda"])("%s -> memory", (p) => {
    expect(r(p).cacheDriver).toBe("memory");
  });

  it("dev -> fs with default dir", () => {
    const res = r("node-server", {}, true);
    expect(res.cacheDriver).toBe("fs");
    expect(res.fsDir).toBe(".data/cache");
  });

  it("dev honors TROPHY_CACHE_DIR", () => {
    expect(r("node-server", { TROPHY_CACHE_DIR: "/tmp/c" }, true).fsDir).toBe("/tmp/c");
  });

  it("dev with explicit memory -> memory", () => {
    expect(r("node-server", { TROPHY_CACHE_DRIVER: "memory" }, true).cacheDriver).toBe("memory");
  });

  it("redis explicit never leaks the URL", () => {
    const res = r("vercel", { TROPHY_CACHE_DRIVER: "redis", REDIS_URL: "redis://secret@h:6379" });
    expect(res.kvMount?.driver).toBe("redis-env");
    expect(res.requiredDeps).toEqual(["ioredis"]);
    expect(JSON.stringify(res)).not.toContain("redis://secret@h:6379");
  });

  it("upstash explicit never leaks the token", () => {
    const res = r("node-server", {
      TROPHY_CACHE_DRIVER: "upstash",
      UPSTASH_REDIS_REST_URL: "https://u.example",
      UPSTASH_REDIS_REST_TOKEN: "tok-secret",
    });
    expect(res.kvMount?.driver).toBe("upstash-env");
    expect(res.requiredDeps).toEqual(["@upstash/redis"]);
    expect(JSON.stringify(res)).not.toContain("tok-secret");
  });

  it("netlify explicit -> netlify-blobs", () => {
    const res = r("node-server", { TROPHY_CACHE_DRIVER: "netlify" });
    expect(res.kvMount).toEqual({ driver: "netlify-blobs", options: { name: "trophy-cache" } });
    expect(res.requiredDeps).toEqual(["@netlify/blobs"]);
  });

  it("none -> bypass", () => {
    const res = r("node-server", { TROPHY_CACHE_DRIVER: "none" });
    expect(res.bypass).toBe(true);
    expect(res.cacheDriver).toBe("memory");
  });

  it("legacy cloudflare-kv-binding maps with one warning", () => {
    const res = r("node-server", {
      NITRO_STORAGE_TROPHY_DRIVER: "cloudflare-kv-binding",
      NITRO_STORAGE_TROPHY_BINDING: "OLD",
    });
    expect(res.kvMount).toEqual({ driver: "cloudflare-kv-fallback", options: { binding: "OLD" } });
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain("TROPHY_CACHE_DRIVER");
  });

  it("legacy redis maps to redis-env without leaking the URL", () => {
    const res = r("node-server", {
      NITRO_STORAGE_TROPHY_DRIVER: "redis",
      REDIS_URL: "redis://secret@h:6379",
    });
    expect(res.kvMount?.driver).toBe("redis-env");
    expect(res.requiredDeps).toEqual(["ioredis"]);
    expect(res.warnings).toHaveLength(1);
    expect(JSON.stringify(res)).not.toContain("secret");
  });

  it("legacy fs maps with path", () => {
    const res = r("node-server", { NITRO_STORAGE_TROPHY_DRIVER: "fs", NITRO_STORAGE_TROPHY_PATH: "x" });
    expect(res.cacheDriver).toBe("fs");
    expect(res.fsDir).toBe("x");
  });

  it("TROPHY_* wins over legacy", () => {
    const res = r("node-server", {
      NITRO_STORAGE_TROPHY_DRIVER: "cloudflare-kv-binding",
      TROPHY_CACHE_DRIVER: "memory",
    });
    expect(res.cacheDriver).toBe("memory");
  });

  it("unknown driver throws listing allowed names", () => {
    expect(() => r("node-server", { TROPHY_CACHE_DRIVER: "reddis" })).toThrow(/reddis[\s\S]*upstash/);
  });
});
