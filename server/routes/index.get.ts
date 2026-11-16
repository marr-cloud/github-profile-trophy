import {
  defineEventHandler,
  getRequestURL,
} from "nitro/h3";
import { useRuntimeConfig } from "nitro/runtime-config";
import { CONSTANTS } from "~/lib/trophy/index.ts";
import { createUserResolver, type ResolveUser } from "~/server/utils/github-user.ts";
import { getTokens } from "~/server/utils/tokens.ts";
import { renderTrophyResponse } from "~/server/utils/render.ts";

// One resolver per isolate, rebuilt only if the token list changes.
let resolver: { key: string; resolve: ResolveUser } | undefined;

function getResolver(tokens: string[], endpoint: string, bypass: boolean): ResolveUser {
  const key = `${tokens.join(",")}|${endpoint}|${bypass}`;
  if (!resolver || resolver.key !== key) {
    resolver = { key, resolve: createUserResolver({ tokens, endpoint, bypass }) };
  }
  return resolver.resolve;
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const cfg = useRuntimeConfig();
  const endpoint = String(cfg.githubEndpoint ?? CONSTANTS.DEFAULT_GITHUB_API);
  const tokens = getTokens();
  const resolve = getResolver(tokens, endpoint, cfg.trophyCacheBypass === true);

  const result = await renderTrophyResponse(url, {
    tokens,
    resolveUser: (username) => resolve(event, username),
  });

  for (const [name, value] of Object.entries(result.headers)) {
    event.res.headers.set(name, value);
  }
  event.res.status = result.status;

  return result.body;
});
