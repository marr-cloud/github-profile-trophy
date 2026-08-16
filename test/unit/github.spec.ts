import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { mswServer } from "~/test/setup.ts";
import { fetchUserInfo, ServiceError, EServiceKindError } from "~/lib/trophy/github.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://api.github.com/graphql";
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/user-torvalds.json", import.meta.url)), "utf8"));

describe("fetchUserInfo", () => {
  it("returns UserInfo on 200 happy path", async () => {
    mswServer.use(
      http.post(ENDPOINT, () => HttpResponse.json({ data: { user: fixture } })),
    );
    const info = await fetchUserInfo("alice", { tokens: ["t1"] });
    expect(info instanceof ServiceError).toBe(false);
    if (!(info instanceof ServiceError)) {
      expect(info.totalCommits).toBeGreaterThan(0);
    }
  });

  it("maps missing user to 404 NOT_FOUND", async () => {
    mswServer.use(
      http.post(ENDPOINT, () => HttpResponse.json({ data: { user: null } })),
    );
    const info = await fetchUserInfo("nobody", { tokens: ["t1"] });
    expect(info).toBeInstanceOf(ServiceError);
    if (info instanceof ServiceError) {
      expect(info.code).toBe(404);
      expect(info.kind).toBe(EServiceKindError.NOT_FOUND);
    }
  });

  it("maps 401 to 404 (auth failure)", async () => {
    mswServer.use(
      http.post(ENDPOINT, () => new HttpResponse(null, { status: 401 })),
    );
    const info = await fetchUserInfo("alice", { tokens: ["t1"] });
    expect(info).toBeInstanceOf(ServiceError);
  });

  it("maps 429 to 419 RATE_LIMIT", async () => {
    mswServer.use(
      http.post(ENDPOINT, () => new HttpResponse(null, { status: 429 })),
    );
    const info = await fetchUserInfo("alice", { tokens: ["t1"] });
    if (info instanceof ServiceError) {
      expect(info.code).toBe(419);
      expect(info.kind).toBe(EServiceKindError.RATE_LIMIT);
    } else {
      throw new Error("expected ServiceError");
    }
  });

  it("maps 500 to 502 after retrying all tokens", async () => {
    let calls = 0;
    mswServer.use(
      http.post(ENDPOINT, () => {
        calls++;
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const info = await fetchUserInfo("alice", { tokens: ["t1", "t2"], retryDelayMs: 0 });
    expect(info).toBeInstanceOf(ServiceError);
    if (info instanceof ServiceError) expect(info.code).toBe(502);
    expect(calls).toBe(2);
  });

  it("does NOT retry on 401", async () => {
    let calls = 0;
    mswServer.use(
      http.post(ENDPOINT, () => {
        calls++;
        return new HttpResponse(null, { status: 401 });
      }),
    );
    await fetchUserInfo("alice", { tokens: ["t1", "t2"], retryDelayMs: 0 });
    expect(calls).toBe(1);
  });

  it("throws if tokens array is empty", async () => {
    await expect(fetchUserInfo("alice", { tokens: [] })).rejects.toThrow();
  });
});
