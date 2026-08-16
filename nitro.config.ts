import { defineConfig } from "nitro";

const trophyDriver = process.env.NITRO_STORAGE_TROPHY_DRIVER ?? "memory";
const trophyStorage: Record<string, unknown> = { driver: trophyDriver };
if (trophyDriver === "fs") {
  trophyStorage.base = process.env.NITRO_STORAGE_TROPHY_PATH ?? ".data/trophy";
}
if (trophyDriver === "redis") {
  trophyStorage.url = process.env.REDIS_URL;
}
if (trophyDriver === "cloudflare-kv-binding") {
  trophyStorage.binding = process.env.NITRO_STORAGE_TROPHY_BINDING ?? "TROPHY_KV";
}

export default defineConfig({
  compatibilityDate: "2026-08-15",
  serverDir: "./server",
  storage: {
    "cache:trophy": trophyStorage as unknown as never,
  },
  runtimeConfig: {
    githubTokens: process.env.GITHUB_TOKEN ?? "",
    githubToken1: process.env.GITHUB_TOKEN1 ?? "",
    githubToken2: process.env.GITHUB_TOKEN2 ?? "",
    githubEndpoint: process.env.TROPHY_GITHUB_ENDPOINT ?? "https://api.github.com/graphql",
    cacheTtlMs: 14_400_000,
  },
});
