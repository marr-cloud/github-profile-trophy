import type { Driver } from "unstorage";
import cloudflareKVBinding from "unstorage/drivers/cloudflare-kv-binding";
import memory from "unstorage/drivers/memory";
import { lazyDriver } from "./_lazy.ts";

export interface CloudflareKVFallbackOptions {
  binding: string;
  /** Test seam: overrides the binding lookup. */
  getBinding?: (name: string) => unknown | undefined;
}

// Same lookup as unstorage's cloudflare-kv-binding: `env` from "cloudflare:workers".
let _env: Promise<Record<string, unknown> | undefined> | undefined;
function importEnv() {
  return (_env ??= import("cloudflare:workers" as string).then(
    (m: any) => m.env as Record<string, unknown>,
    () => undefined,
  ));
}

export default function cloudflareKVFallback(opts: CloudflareKVFallbackOptions): Driver {
  return lazyDriver("cloudflare-kv-fallback", { binding: opts.binding }, async () => {
    const found = opts.getBinding ? opts.getBinding(opts.binding) : (await importEnv())?.[opts.binding];
    const f = found as Record<string, unknown> | undefined;
    if (f && !["get", "put", "delete"].some((k) => typeof f[k] !== "function")) {
      return (cloudflareKVBinding as any)({ binding: found }) as Driver;
    }
    console.warn(
      `[trophy-cache] KV binding "${opts.binding}" not found — using in-memory cache. Create a KV namespace and bind it as ${opts.binding} to persist.`,
    );
    return (memory as any)() as Driver;
  });
}
