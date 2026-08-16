import { useStorage } from "nitro/storage";
import { UserInfo } from "~/lib/trophy/user-info.ts";
import { CONSTANTS } from "~/lib/trophy/utils.ts";

interface CacheEnvelope {
  data: unknown;
  expiresAt: number;
}

function keyFor(username: string): string {
  return `v1-${username}`;
}

export async function getCachedUser(username: string): Promise<UserInfo | null> {
  const storage = useStorage("cache:trophy");
  const raw = await storage.getItem<CacheEnvelope>(keyFor(username));
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.expiresAt !== "number" || raw.expiresAt < Date.now()) return null;
  return UserInfo.fromJSON(JSON.stringify(raw.data));
}

export async function setCachedUser(username: string, info: UserInfo): Promise<void> {
  const storage = useStorage("cache:trophy");
  const envelope: CacheEnvelope = {
    data: JSON.parse(JSON.stringify(info)),
    expiresAt: Date.now() + CONSTANTS.CACHE_TTL_MS,
  };
  await storage.setItem(keyFor(username), envelope);
}
