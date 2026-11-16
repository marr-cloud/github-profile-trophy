import type { Driver } from "unstorage";
import { lazyDriver } from "./_lazy.ts";

/**
 * `lib` is a test seam. The default is a LITERAL dynamic import so the bundler
 * sees and bundles ioredis (unstorage's own importLib is @vite-ignore'd and would
 * fail where node_modules is absent at runtime). ioredis is only installed when
 * this driver is selected, hence @ts-ignore instead of a hard type dependency.
 */
export default function redisEnv(opts: { lib?: () => unknown } = {}): Driver {
  return lazyDriver("redis-env", undefined, async () => {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("[trophy-cache] TROPHY_CACHE_DRIVER=redis requires REDIS_URL");
    const { default: redis } = await import("unstorage/drivers/redis");
    // @ts-ignore ioredis is an optional dependency
    const lib = opts.lib ?? (() => import("ioredis"));
    return (redis as any)({ url, lib }) as Driver;
  });
}
