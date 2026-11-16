import { createStorage } from "unstorage";
import { afterEach, describe, expect, it, vi } from "vitest";
import cloudflareKVFallback from "~/modules/trophy-cache/drivers/cloudflare-kv-fallback.ts";
import redisEnv from "~/modules/trophy-cache/drivers/redis-env.ts";
import upstashEnv from "~/modules/trophy-cache/drivers/upstash-env.ts";

const upstashInner = vi.hoisted(() => vi.fn());
vi.mock("unstorage/drivers/upstash", () => ({ default: upstashInner }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  upstashInner.mockReset();
});

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: vi.fn(async (k: string) => m.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => void m.set(k, v)),
    delete: vi.fn(async (k: string) => void m.delete(k)),
    list: vi.fn(async () => ({ keys: [...m.keys()].map((name) => ({ name })), list_complete: true })),
  };
}

describe("cloudflare-kv-fallback", () => {
  it("falls back to memory and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = createStorage({
      driver: cloudflareKVFallback({ binding: "TROPHY_KV", getBinding: () => undefined }),
    });
    await s.setItem("a", { x: 1 });
    expect(await s.getItem("a")).toEqual({ x: 1 });
    await s.hasItem("a");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("TROPHY_KV");
  });

  it("uses the binding with min TTL 60 and no warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const kv = fakeKV();
    const s = createStorage({
      driver: cloudflareKVFallback({ binding: "TROPHY_KV", getBinding: () => kv }),
    });
    await s.setItem("k", "v", { ttl: 10 });
    expect(kv.put).toHaveBeenCalledWith("k", "v", expect.objectContaining({ expirationTtl: 60 }));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("redis-env", () => {
  it("is lazy and rejects without REDIS_URL", async () => {
    vi.stubEnv("REDIS_URL", "");
    delete process.env.REDIS_URL;
    const s = createStorage({ driver: redisEnv() });
    await expect(s.getItem("x")).rejects.toThrow(/REDIS_URL/);
  });
});

describe("upstash-env", () => {
  it("uses KV_REST_API_* fallbacks", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://u");
    vi.stubEnv("KV_REST_API_TOKEN", "t");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    upstashInner.mockReturnValue({ name: "inner", getItem: async () => "ok", hasItem: async () => true });
    const s = createStorage({ driver: upstashEnv() });
    expect(await s.getItem("a")).toBe("ok");
    expect(upstashInner).toHaveBeenCalledWith({ url: "https://u", token: "t" });
  });

  it("rejects naming the missing token", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://u");
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_TOKEN;
    const s = createStorage({ driver: upstashEnv() });
    await expect(s.getItem("a")).rejects.toThrow(/UPSTASH_REDIS_REST_TOKEN/);
  });
});
