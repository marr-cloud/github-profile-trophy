import type { GitHubUserAll } from "~/lib/trophy/user-info.ts";
import { UserInfo } from "~/lib/trophy/user-info.ts";
import { CONSTANTS } from "~/lib/trophy/utils.ts";

export enum EServiceKindError {
  NOT_FOUND = "NOT_FOUND",
  RATE_LIMIT = "RATE_LIMIT",
  BAD_GATEWAY = "BAD_GATEWAY",
}

export class ServiceError extends Error {
  readonly code: 400 | 404 | 419 | 502;
  readonly kind: EServiceKindError;
  constructor(message: string, kind: EServiceKindError) {
    super(message);
    this.kind = kind;
    this.code = kind === EServiceKindError.NOT_FOUND
      ? 404
      : kind === EServiceKindError.RATE_LIMIT
      ? 419
      : 502;
  }
}

export const queryUserAll = `
  query userInfo($username: String!) {
    user(login: $username) {
      createdAt
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
        totalPullRequestReviewContributions
      }
      organizations(first: 1) { totalCount }
      followers(first: 1) { totalCount }
      openIssues: issues(states: OPEN) { totalCount }
      closedIssues: issues(states: CLOSED) { totalCount }
      pullRequests(first: 1) { totalCount }
      repositories(first: 50, ownerAffiliations: OWNER, orderBy: {direction: DESC, field: STARGAZERS}) {
        totalCount
        nodes {
          languages(first: 2, orderBy: {direction:DESC, field: SIZE}) { nodes { name } }
          stargazerCount
          createdAt
        }
      }
    }
  }
`;

export interface FetchUserInfoOptions {
  tokens: string[];
  retryDelayMs?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

const isAuthErr = (status: number) => status === 401 || status === 403 || status === 404;
const isRateErr = (status: number) => status === 429;

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

export async function fetchUserInfo(
  username: string,
  opts: FetchUserInfoOptions,
): Promise<UserInfo | ServiceError> {
  const tokens = opts.tokens.filter((t) => t && t.length > 0);
  if (tokens.length === 0) {
    throw new Error("fetchUserInfo requires at least one GitHub token");
  }
  const endpoint = opts.endpoint ?? CONSTANTS.DEFAULT_GITHUB_API;
  const delay = opts.retryDelayMs ?? CONSTANTS.DEFAULT_GITHUB_RETRY_DELAY;
  const doFetch = opts.fetchImpl ?? fetch;

  let lastErr: ServiceError | null = null;

  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) await sleep(delay);
    const token = tokens[i];
    try {
      const res = await doFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `bearer ${token}`,
          "User-Agent": "github-profile-trophy-nitro",
        },
        body: JSON.stringify({ query: queryUserAll, variables: { username } }),
      });
      if (isAuthErr(res.status)) {
        return new ServiceError(`Auth/NotFound (${res.status})`, EServiceKindError.NOT_FOUND);
      }
      if (isRateErr(res.status)) {
        return new ServiceError(`Rate limited (${res.status})`, EServiceKindError.RATE_LIMIT);
      }
      if (!res.ok) {
        lastErr = new ServiceError(`Upstream ${res.status}`, EServiceKindError.BAD_GATEWAY);
        continue;
      }
      const body = await res.json() as { data?: { user: GitHubUserAll | null }; errors?: unknown[] };
      if (body.errors && body.errors.length) {
        lastErr = new ServiceError("GraphQL error", EServiceKindError.BAD_GATEWAY);
        continue;
      }
      if (!body.data?.user) {
        return new ServiceError("User not found", EServiceKindError.NOT_FOUND);
      }
      return UserInfo.fromCombined(body.data.user);
    } catch (err) {
      lastErr = new ServiceError(
        err instanceof Error ? err.message : "fetch failed",
        EServiceKindError.BAD_GATEWAY,
      );
    }
  }
  return lastErr ?? new ServiceError("Unknown error", EServiceKindError.BAD_GATEWAY);
}
