export type CacheDriverName =
  | "auto"
  | "memory"
  | "fs"
  | "redis"
  | "upstash"
  | "cloudflare-kv"
  | "vercel"
  | "netlify"
  | "deno-kv"
  | "none";

export type KVDriverId =
  | "cloudflare-kv-fallback"
  | "redis-env"
  | "upstash-env"
  | "vercel-runtime-cache"
  | "deno-kv"
  | "netlify-blobs";

export interface ResolvedCache {
  label: string;
  cacheDriver: "memory" | "fs" | "kv";
  fsDir?: string;
  kvMount?: { driver: KVDriverId; options: Record<string, string> };
  bypass: boolean;
  requiredDeps: string[];
  warnings: string[];
}

const ALLOWED: CacheDriverName[] = [
  "auto", "memory", "fs", "redis", "upstash", "cloudflare-kv", "vercel", "netlify", "deno-kv", "none",
];

const DEFAULT_FS_DIR = ".data/cache";
const DEFAULT_BINDING = "TROPHY_KV";

const get = (env: Record<string, string | undefined>, key: string): string | undefined =>
  env[key] === "" ? undefined : env[key];

export function resolveCacheConfig(input: {
  preset: string;
  dev: boolean;
  env: Record<string, string | undefined>;
}): ResolvedCache {
  const { preset, dev, env } = input;
  const warnings: string[] = [];
  let driver: CacheDriverName;
  let legacyBinding: string | undefined;
  let legacyPath: string | undefined;

  const explicit = get(env, "TROPHY_CACHE_DRIVER");
  const legacy = get(env, "NITRO_STORAGE_TROPHY_DRIVER");

  if (explicit !== undefined) {
    if (!ALLOWED.includes(explicit as CacheDriverName)) {
      throw new Error(
        `Unknown TROPHY_CACHE_DRIVER "${explicit}". Allowed: ${ALLOWED.join(", ")}`,
      );
    }
    driver = explicit as CacheDriverName;
  } else if (legacy !== undefined) {
    const mapped: Record<string, CacheDriverName> = {
      "cloudflare-kv-binding": "cloudflare-kv",
      fs: "fs",
      memory: "memory",
    };
    const m = mapped[legacy];
    if (!m) {
      throw new Error(
        `Unsupported NITRO_STORAGE_TROPHY_DRIVER "${legacy}". Use TROPHY_CACHE_DRIVER with one of: ${ALLOWED.join(", ")}`,
      );
    }
    driver = m;
    legacyBinding = get(env, "NITRO_STORAGE_TROPHY_BINDING");
    legacyPath = get(env, "NITRO_STORAGE_TROPHY_PATH");
    warnings.push(
      `NITRO_STORAGE_TROPHY_DRIVER is deprecated; set TROPHY_CACHE_DRIVER=${m} instead.`,
    );
  } else {
    driver = "auto";
  }

  const binding = get(env, "TROPHY_KV_BINDING") ?? legacyBinding ?? DEFAULT_BINDING;
  const base = { bypass: false, requiredDeps: [] as string[], warnings };

  const kv = (
    label: string,
    id: KVDriverId,
    options: Record<string, string> = {},
    requiredDeps: string[] = [],
  ): ResolvedCache => ({
    ...base,
    label,
    cacheDriver: "kv",
    kvMount: { driver: id, options },
    requiredDeps,
  });
  const fs = (): ResolvedCache => {
    const fsDir = get(env, "TROPHY_CACHE_DIR") ?? legacyPath ?? DEFAULT_FS_DIR;
    return { ...base, label: `fs (${fsDir})`, cacheDriver: "fs", fsDir };
  };
  const memory = (): ResolvedCache => ({ ...base, label: "memory", cacheDriver: "memory" });

  switch (driver) {
    case "auto":
      if (dev) return fs();
      if (preset.startsWith("cloudflare"))
        return kv(`cloudflare-kv (${binding})`, "cloudflare-kv-fallback", { binding });
      if (preset.startsWith("vercel")) return kv("vercel-runtime-cache", "vercel-runtime-cache");
      if (preset.startsWith("deno")) return kv("deno-kv", "deno-kv");
      return memory();
    case "memory":
      return memory();
    case "fs":
      return fs();
    case "redis":
      return kv("redis", "redis-env", {}, ["ioredis"]);
    case "upstash":
      return kv("upstash", "upstash-env", {}, ["@upstash/redis"]);
    case "cloudflare-kv":
      return kv(`cloudflare-kv (${binding})`, "cloudflare-kv-fallback", { binding });
    case "vercel":
      return kv("vercel-runtime-cache", "vercel-runtime-cache");
    case "netlify":
      return kv("netlify-blobs", "netlify-blobs", { name: "trophy-cache" }, ["@netlify/blobs"]);
    case "deno-kv":
      return kv("deno-kv", "deno-kv");
    case "none":
      return { ...memory(), label: "none (cache bypassed)", bypass: true };
  }
}
