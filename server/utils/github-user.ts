import { defineCachedFunction } from "nitro/cache";
import type { HTTPEvent } from "nitro/h3";
import type { CachedFunctionOptions } from "nitro/types";
import { EServiceKindError, fetchUserInfo, ServiceError, UserInfo } from "~/lib/trophy/index.ts";

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

type CachedArgs = [event: HTTPEvent, username: string, hadEntry?: boolean];

interface ErrorMarker {
  __error: { message: string; kind: EServiceKindError };
}

function isErrorMarker(value: unknown): value is ErrorMarker {
  return typeof value === "object" && value !== null && "__error" in value;
}

export function createUserResolver(deps: UserResolverDeps): ResolveUser {
  // The event must stay the first argument: ocache uses it for `req.waitUntil`
  // so SWR refreshes and writes survive past the response on Workers.
  const options: CachedFunctionOptions<unknown, CachedArgs> = {
    ...USER_CACHE_OPTIONS,
    getKey: (_event, username) => username.toLowerCase(),
    shouldBypassCache: () => deps.bypass === true,
    // Errors are returned as a marker and rejected here, so ocache neither
    // writes them nor (on a miss) evicts with a null write. When a valid entry
    // exists we also flag it in the args (ocache calls the resolver with this
    // same array afterwards): a failed refresh then throws instead, which makes
    // ocache keep the stale entry rather than evict it with `set(key, null)`.
    validate: (entry, ctx) => {
      if (isErrorMarker(entry.value)) return false;
      if (entry.value !== undefined) ctx.args[2] = true;
      return true;
    },
    ...(deps.storage ? { storage: deps.storage as CachedFunctionOptions["storage"] } : {}),
  };
  const cached = defineCachedFunction(
    async (_event: HTTPEvent, username: string, hadEntry?: boolean): Promise<unknown> => {
      const result = await fetchUserInfo(username, {
        tokens: deps.tokens,
        endpoint: deps.endpoint,
        fetchImpl: deps.fetchImpl,
      });
      if (result instanceof ServiceError) {
        if (hadEntry) throw result;
        return { __error: { message: result.message, kind: result.kind } } satisfies ErrorMarker;
      }
      return JSON.parse(JSON.stringify(result));
    },
    options,
  );

  return async (event, username) => {
    try {
      const value = await cached(event, username);
      if (isErrorMarker(value)) {
        return new ServiceError(value.__error.message, value.__error.kind);
      }
      return UserInfo.fromJSON(JSON.stringify(value));
    } catch (error) {
      if (error instanceof ServiceError) return error;
      // ocache TimeoutError, storage or network failures: surface as 502, not a generic 500.
      return new ServiceError(
        error instanceof Error ? error.message : "Unexpected error",
        EServiceKindError.BAD_GATEWAY,
      );
    }
  };
}
