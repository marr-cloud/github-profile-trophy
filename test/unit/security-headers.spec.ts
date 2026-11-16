import { describe, expect, it } from "vitest";
import { BASE_SECURITY_HEADERS, CSP, securityHeaders, type ContentKind } from "~/lib/trophy/security-headers.ts";

const EXPECTED: Record<ContentKind, string> = {
  landing:
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors *",
  error:
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *",
  svg: "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *",
};

describe("security headers", () => {
  for (const kind of Object.keys(EXPECTED) as ContentKind[]) {
    it(`CSP ${kind} is exact and keeps framing open`, () => {
      expect(CSP[kind]).toBe(EXPECTED[kind]);
      expect(CSP[kind].endsWith("frame-ancestors *")).toBe(true);
    });

    it(`securityHeaders(${kind}) has base + CSP and no X-Frame-Options`, () => {
      const h = securityHeaders(kind);
      for (const [k, v] of Object.entries(BASE_SECURITY_HEADERS)) expect(h[k]).toBe(v);
      expect(Object.keys(BASE_SECURITY_HEADERS)).toHaveLength(4);
      expect(h["Content-Security-Policy"]).toBe(CSP[kind]);
      expect(Object.keys(h).some((k) => /x-frame-options/i.test(k))).toBe(false);
    });
  }
});
