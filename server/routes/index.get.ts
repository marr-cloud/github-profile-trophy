import {
  defineEventHandler,
  getRequestURL,
  setResponseHeader,
  setResponseStatus,
} from "nitro/h3";
import { useRuntimeConfig } from "nitro/runtime-config";
import { CONSTANTS } from "~/lib/trophy/index.ts";
import { getCachedUser, setCachedUser } from "~/server/utils/cache.ts";
import { getTokens } from "~/server/utils/tokens.ts";
import { renderTrophyResponse } from "~/server/utils/render.ts";

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const cfg = useRuntimeConfig();
  const endpoint = String(cfg.githubEndpoint ?? CONSTANTS.DEFAULT_GITHUB_API);

  const result = await renderTrophyResponse(url, {
    tokens: getTokens(),
    endpoint,
    getCachedUser,
    setCachedUser,
  });

  for (const [name, value] of Object.entries(result.headers)) {
    setResponseHeader(event, name, value);
  }
  setResponseStatus(event, result.status);

  return result.body;
});
