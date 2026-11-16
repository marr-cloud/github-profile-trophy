import type { Driver } from "unstorage";
import { lazyDriver } from "./_lazy.ts";

/**
 * `lib` is a test seam. The default is a LITERAL dynamic import so the bundler
 * sees and bundles @upstash/redis (unstorage's importLib is @vite-ignore'd).
 * The package is only installed when this driver is selected, hence @ts-ignore.
 */
export default function upstashEnv(opts: { lib?: () => unknown } = {}): Driver {
  return lazyDriver("upstash-env", undefined, async () => {
    const env = process.env;
    const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
    if (!url)
      throw new Error("[trophy-cache] TROPHY_CACHE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL (or KV_REST_API_URL)");
    if (!token)
      throw new Error("[trophy-cache] TROPHY_CACHE_DRIVER=upstash requires UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_TOKEN)");
    const { default: upstash } = await import("unstorage/drivers/upstash");
    // @ts-ignore @upstash/redis is an optional dependency
    const lib = opts.lib ?? (() => import("@upstash/redis"));
    return (upstash as any)({ url, token, lib }) as Driver;
  });
}
