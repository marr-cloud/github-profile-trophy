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

describe("raw passthrough", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  it("roundtrips raw bytes on memory fallback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = createStorage({ driver: cloudflareKVFallback({ binding: "B", getBinding: () => undefined }) });
    await s.setItemRaw("b", bytes);
    expect(Array.from((await s.getItemRaw("b")) as Uint8Array)).toEqual([1, 2, 3]);
  });
  it("roundtrips raw bytes on a KV binding", async () => {
    const s = createStorage({ driver: cloudflareKVFallback({ binding: "B", getBinding: () => fakeKV() }) });
    await s.setItemRaw("b", bytes);
    expect(Array.from((await s.getItemRaw("b")) as Uint8Array)).toEqual([1, 2, 3]);
  });
});

describe("laziness and concurrency", () => {
  it("creating drivers does not throw or touch env/imports", () => {
    vi.stubEnv("REDIS_URL", undefined);
    expect(() => redisEnv()).not.toThrow();
    expect(() => upstashEnv()).not.toThrow();
    expect(upstashInner).not.toHaveBeenCalled();
  });
  it("parallel first ops warn once and succeed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = createStorage({ driver: cloudflareKVFallback({ binding: "B", getBinding: () => undefined }) });
    await Promise.all([s.setItem("a", 1), s.setItem("b", 2)]);
    expect(await s.getItem("a")).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it("ignores an invalid binding object", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = createStorage({ driver: cloudflareKVFallback({ binding: "B", getBinding: () => ({}) }) });
    await s.setItem("a", 1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("redis-env", () => {
  it("is lazy and rejects without REDIS_URL", async () => {
    vi.stubEnv("REDIS_URL", undefined);
    const s = createStorage({ driver: redisEnv() });
    await expect(s.getItem("x")).rejects.toThrow(/REDIS_URL/);
  });
});

const lib = () => ({});

describe("upstash-env", () => {
  it("uses KV_REST_API_* fallbacks", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://u");
    vi.stubEnv("KV_REST_API_TOKEN", "t");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    upstashInner.mockReturnValue({ name: "inner", getItem: async () => "ok", hasItem: async () => true });
    const s = createStorage({ driver: upstashEnv({ lib }) });
    expect(await s.getItem("a")).toBe("ok");
    expect(upstashInner).toHaveBeenCalledWith({ url: "https://u", token: "t", lib });
  });

  it("rejects naming the missing token", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://u");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.stubEnv("KV_REST_API_TOKEN", undefined);
    const s = createStorage({ driver: upstashEnv({ lib }) });
    await expect(s.getItem("a")).rejects.toThrow(/UPSTASH_REDIS_REST_TOKEN/);
  });
});
