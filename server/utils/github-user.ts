import { defineCachedFunction } from "nitro/cache";
import type { HTTPEvent } from "nitro/h3";
import { fetchUserInfo, ServiceError, UserInfo } from "~/lib/trophy/index.ts";

/** Fresh for 4h, then served stale (and refreshed in background) for up to 24h more. */
export const USER_CACHE_OPTIONS = {
  name: "github-user-v2",
  maxAge: 14400,
  swr: true,
  staleMaxAge: 86400,
} as const;

export interface UserResolverDeps {
  tokens: string[];
  endpoint: string;
  fetchImpl?: typeof fetch;
  bypass?: boolean;
  /** ocache StorageOption; test seam, defaults to Nitro's cache storage. */
  storage?: unknown;
}

export type ResolveUser = (event: HTTPEvent, username: string) => Promise<UserInfo | ServiceError>;

export function createUserResolver(deps: UserResolverDeps): ResolveUser {
  // The event must stay the first argument: ocache uses it for `req.waitUntil`
  // so SWR refreshes and writes survive past the response on Workers.
  const cached = defineCachedFunction(
    async (_event: HTTPEvent, username: string): Promise<unknown> => {
      const result = await fetchUserInfo(username, {
        tokens: deps.tokens,
        endpoint: deps.endpoint,
        fetchImpl: deps.fetchImpl,
      });
      // Throwing keeps errors out of the cache.
      if (result instanceof ServiceError) throw result;
      return JSON.parse(JSON.stringify(result));
    },
    {
      ...USER_CACHE_OPTIONS,
      getKey: (_event: HTTPEvent, username: string) => username.toLowerCase(),
      shouldBypassCache: () => deps.bypass === true,
      onError: (error: unknown) => console.error("[cache]", error),
      ...(deps.storage ? { storage: deps.storage as never } : {}),
    } as never,
  ) as (event: HTTPEvent, username: string) => Promise<unknown>;

  return async (event, username) => {
    try {
      const value = await cached(event, username);
      return UserInfo.fromJSON(JSON.stringify(value));
    } catch (error) {
      if (error instanceof ServiceError) return error;
      throw error;
    }
  };
}
