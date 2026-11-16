import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { NitroModule } from "nitro/types";
import { resolveCacheConfig } from "./resolve.ts";

const LOCAL_DRIVERS = new Set(["cloudflare-kv-fallback", "redis-env", "upstash-env"]);

const trophyCache: NitroModule = {
  name: "trophy-cache",
  setup(nitro) {
    const r = resolveCacheConfig({
      preset: nitro.options.preset,
      dev: nitro.options.dev,
      env: process.env,
    });
    r.warnings.forEach((w) => nitro.logger.warn(w));

    const require = createRequire(`${nitro.options.rootDir.replace(/\/?$/, "/")}package.json`);
    for (const pkg of r.requiredDeps) {
      try {
        require.resolve(pkg);
      } catch {
        throw new Error(
          `[trophy-cache] TROPHY_CACHE_DRIVER=${process.env.TROPHY_CACHE_DRIVER ?? "auto"} needs the "${pkg}" package: pnpm add ${pkg}`,
        );
      }
    }

    nitro.options.cache.driver = r.cacheDriver;
    if (r.cacheDriver === "fs") {
      nitro.options.cache.fs = { dir: r.fsDir } as any;
    }
    if (r.cacheDriver === "kv" && r.kvMount) {
      const id = r.kvMount.driver;
      const driver = LOCAL_DRIVERS.has(id)
        ? fileURLToPath(new URL(`./drivers/${id}.ts`, import.meta.url))
        : id;
      nitro.options.kv.cache = { driver, ...r.kvMount.options } as any;
    }
    nitro.options.runtimeConfig.trophyCacheBypass = r.bypass;
    nitro.logger.info(`[trophy-cache] preset=${nitro.options.preset} → ${r.label}`);
  },
};

export default trophyCache;
