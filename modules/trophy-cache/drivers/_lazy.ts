import type { Driver } from "unstorage";

/** Builds a driver whose inner driver is resolved (async) on first operation. */
export function lazyDriver(name: string, options: unknown, build: () => Promise<Driver>): Driver {
  let inner: Promise<Driver> | undefined;
  const get = () => (inner ??= build());
  const d = {
    name,
    options,
    getInstance: async () => (await get()).getInstance?.(),
    hasItem: async (k: string, o: any) => (await get()).hasItem(k, o),
    getItem: async (k: string, o: any) => (await get()).getItem(k, o),
    getItemRaw: async (k: string, o: any) => {
      const i = await get();
      return i.getItemRaw ? i.getItemRaw(k, o) : i.getItem(k, o);
    },
    setItem: async (k: string, v: string, o: any) => (await get()).setItem?.(k, v, o),
    setItemRaw: async (k: string, v: any, o: any) => {
      const i = await get();
      return i.setItemRaw ? i.setItemRaw(k, v, o) : i.setItem?.(k, v, o);
    },
    removeItem: async (k: string, o: any) => (await get()).removeItem?.(k, o),
    getKeys: async (b: string, o: any) => (await get()).getKeys(b, o),
    clear: async (b: string, o: any) => (await get()).clear?.(b, o),
  };
  return d as unknown as Driver;
}
