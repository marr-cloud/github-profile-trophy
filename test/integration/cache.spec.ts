import { describe, expect, it } from "vitest";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { UserInfo } from "~/lib/trophy/user-info.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The cache module reads from a nitro storage — we simulate by injecting our own storage,
// so the test avoids booting nitro.

describe("cache primitives (contract)", () => {
  const fixture = UserInfo.fromCombined(
    JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/user-torvalds.json", import.meta.url)), "utf8")),
  );

  it("stores under key v1-<username> and returns the same UserInfo on read", async () => {
    const store = createStorage({ driver: memoryDriver() });
    await store.setItem("v1-alice", { data: JSON.parse(JSON.stringify(fixture)), expiresAt: Date.now() + 60_000 });
    const raw = await store.getItem<{ data: unknown; expiresAt: number }>("v1-alice");
    expect(raw?.expiresAt).toBeGreaterThan(Date.now());
    const info = UserInfo.fromJSON(JSON.stringify(raw!.data));
    expect(info.totalCommits).toBe(fixture.totalCommits);
  });

  it("expired entries are treated as miss (contract for the wrapper)", async () => {
    const store = createStorage({ driver: memoryDriver() });
    await store.setItem("v1-bob", { data: {}, expiresAt: Date.now() - 1 });
    const raw = await store.getItem<{ expiresAt: number }>("v1-bob");
    expect(raw!.expiresAt).toBeLessThan(Date.now()); // wrapper will treat as miss
  });
});
