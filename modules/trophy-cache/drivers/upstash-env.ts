import type { Driver } from "unstorage";
import { lazyDriver } from "./_lazy.ts";

export default function upstashEnv(): Driver {
  return lazyDriver("upstash-env", undefined, async () => {
    const env = process.env;
    const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
    if (!url) throw new Error("[trophy-cache] TROPHY_CACHE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL");
    if (!token) throw new Error("[trophy-cache] TROPHY_CACHE_DRIVER=upstash requires UPSTASH_REDIS_REST_TOKEN");
    const { default: upstash } = await import("unstorage/drivers/upstash");
    return (upstash as any)({ url, token }) as Driver;
  });
}
