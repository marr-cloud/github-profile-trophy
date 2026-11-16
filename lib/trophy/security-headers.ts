export type ContentKind = "landing" | "error" | "svg";

// Framing stays open to any origin (embedded via <img>/<iframe> everywhere):
// every CSP ends with `frame-ancestors *` and X-Frame-Options is never sent.
export const CSP: Record<ContentKind, string> = {
  landing:
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors *",
  error:
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors *",
  svg: "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *",
};

export const BASE_SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

export function securityHeaders(kind: ContentKind): Record<string, string> {
  return { ...BASE_SECURITY_HEADERS, "Content-Security-Policy": CSP[kind] };
}
