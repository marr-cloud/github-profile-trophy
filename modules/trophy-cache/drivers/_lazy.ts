import type { Driver } from "unstorage";

/**
 * Builds a driver whose inner driver is resolved (async) on first operation.
 * A rejected build is cached on purpose (e.g. missing env stays an error, no retry storm).
 *
 * Raw methods (getItemRaw/setItemRaw) are intentionally NOT exposed: unstorage's
 * createStorage then applies its own serializeRaw/deserializeRaw through
 * getItem/setItem, which is consistent for every inner driver.
 */
export function lazyDriver(name: string, options: unknown, build: () => Promise<Driver>): Driver {
  let inner: Promise<Driver> | undefined;
  const get = () => (inner ??= build());
  const d = {
    name,
    options,
    getInstance: async () => (await get()).getInstance?.(),
    hasItem: async (k: string, o: any) => (await get()).hasItem(k, o),
    getItem: async (k: string, o: any) => (await get()).getItem(k, o),
    // ocache evicts with set(key, null); unstorage serializes that to "null" with
    // no TTL, i.e. a permanent junk key plus a billable write. Real entries are
    // always JSON objects, so drop tombstones.
    setItem: async (k: string, v: string | null, o: any) => {
      if (v === null || v === "null") return;
      return (await get()).setItem?.(k, v, o);
    },
    removeItem: async (k: string, o: any) => (await get()).removeItem?.(k, o),
    getKeys: async (b: string, o: any) => (await get()).getKeys(b, o),
    clear: async (b: string, o: any) => (await get()).clear?.(b, o),
    dispose: async () => {
      if (inner) await (await inner.catch(() => undefined))?.dispose?.();
    },
  };
  return d as unknown as Driver;
}
