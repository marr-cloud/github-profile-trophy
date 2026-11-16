import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import trophyCache from "~/modules/trophy-cache/index.ts";

const rootDir = process.cwd();

function run(preset: string, env: Record<string, string> = {}, opts: { dev?: boolean; rootDir?: string } = {}) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const nitro = {
    options: { preset, dev: opts.dev ?? false, rootDir: opts.rootDir ?? rootDir, kv: {} as any, cache: {} as any, runtimeConfig: {} as any },
    logger: { info: vi.fn(), warn: vi.fn() },
  };
  (trophyCache as any).setup(nitro);
  return nitro;
}

describe("trophy-cache nitro module", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("cloudflare-module -> kv fallback driver", () => {
    const n = run("cloudflare-module");
    expect(n.options.cache.driver).toBe("kv");
    expect(n.options.kv.cache.driver.endsWith("cloudflare-kv-fallback.ts")).toBe(true);
    expect(n.options.kv.cache.binding).toBe("TROPHY_KV");
    expect(n.logger.info).toHaveBeenCalledWith(expect.stringContaining("cloudflare"));
  });

  it("node-server -> memory", () => {
    const n = run("node-server");
    expect(n.options.cache.driver).toBe("memory");
    expect(n.options.kv.cache).toBeUndefined();
  });

  it("none -> bypass", () => {
    expect(run("node-server", { TROPHY_CACHE_DRIVER: "none" }).options.runtimeConfig.trophyCacheBypass).toBe(true);
  });

  it("missing dep throws", () => {
    expect(() => run("node-server", { TROPHY_CACHE_DRIVER: "redis", REDIS_URL: "redis://x" })).toThrow(
      /pnpm add ioredis/,
    );
  });

  it("dev resolves the fs cache dir against rootDir", () => {
    const n = run("node-server", {}, { dev: true });
    expect(n.options.cache.driver).toBe("fs");
    expect(n.options.cache.fs.dir).toBe(resolve(rootDir, ".data/cache"));
  });

  it("legacy var warns once", () => {
    const n = run("node-server", { NITRO_STORAGE_TROPHY_DRIVER: "memory" });
    expect(n.logger.warn).toHaveBeenCalledTimes(1);
  });
});
