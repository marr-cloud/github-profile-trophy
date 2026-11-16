import type { Driver } from "unstorage";
import { lazyDriver } from "./_lazy.ts";

export default function redisEnv(): Driver {
  return lazyDriver("redis-env", undefined, async () => {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("[trophy-cache] TROPHY_CACHE_DRIVER=redis requires REDIS_URL");
    const { default: redis } = await import("unstorage/drivers/redis");
    return (redis as any)({ url }) as Driver;
  });
}
