import { useRuntimeConfig } from "nitro/runtime-config";

export function getTokens(): string[] {
  const cfg = useRuntimeConfig();
  const csv = String(cfg.githubTokens ?? "").split(",");
  const extras = [String(cfg.githubToken1 ?? ""), String(cfg.githubToken2 ?? "")];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...csv, ...extras]) {
    const trimmed = t.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
