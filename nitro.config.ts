import { defineConfig } from "nitro";
import trophyCache from "./modules/trophy-cache/index.ts";
import { BASE_SECURITY_HEADERS } from "./lib/trophy/security-headers.ts";

export default defineConfig({
  compatibilityDate: "2026-08-15",
  serverDir: "./server",
  modules: [trophyCache],
  publicAssets: [
    {
      dir: "node_modules/@anyblades/pico/css",
      // Not "/assets": Nitro marks that dir immutable for 1 year (Vite assetsDir).
      baseURL: "/vendor",
      ignore: ["**/blades*", "**/pico.css", "**/pico.conditional*", "**/postcss.config.js"],
    },
  ],
  // Base security headers on every response (static assets, 404s, routes).
  // No CSP here: it is per content kind and set by the route handlers.
  routeRules: {
    "/**": { headers: BASE_SECURITY_HEADERS },
  },
  runtimeConfig: {
    githubTokens: process.env.GITHUB_TOKEN ?? "",
    githubToken1: process.env.GITHUB_TOKEN1 ?? "",
    githubToken2: process.env.GITHUB_TOKEN2 ?? "",
    githubEndpoint: process.env.TROPHY_GITHUB_ENDPOINT ?? "https://api.github.com/graphql",
  },
});
