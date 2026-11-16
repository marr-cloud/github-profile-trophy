import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderQueryBuilder } from "~/lib/trophy/query-builder.ts";

const BASE = "https://trophy.example/";

describe("renderQueryBuilder", () => {
  const html = renderQueryBuilder(BASE);

  it("has no inline style or script (strict CSP ready)", () => {
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
  });

  it("does not reference a third-party CDN", () => {
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).not.toContain("picocss");
  });

  it("links self-hosted assets", () => {
    expect(html).toContain('href="/vendor/pico.min.css"');
    expect(html).toContain('href="/builder.css"');
    expect(html).toContain('src="/builder.js"');
  });

  it("exposes the base URL via data-base", () => {
    expect(html).toContain('data-base="https://trophy.example/"');
  });

  it("escapes a hostile base URL", () => {
    const evil = renderQueryBuilder('https://x/"><script>alert(1)</script>');
    expect(evil).not.toContain("<script>alert");
    expect(evil).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("round-trips data-defaults", () => {
    const m = html.match(/data-defaults="([^"]*)"/);
    expect(m).not.toBeNull();
    const json = m![1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    expect(JSON.parse(json)).toEqual({
      theme: "default",
      column: "8",
      row: "3",
      "margin-w": "0",
      "margin-h": "0",
      "no-bg": "false",
      "no-frame": "false",
    });
  });
  it("renders tri-state chips for titles and ranks", () => {
    expect(html.match(/data-group="title"/g)).toHaveLength(15);
    expect(html.match(/data-group="rank"/g)).toHaveLength(9);
    expect(html.match(/data-state="neutral" aria-pressed="false"/g)).toHaveLength(24);
    expect(html).not.toContain('<input type="checkbox" name="rank"');
    expect(html).not.toContain('<input type="checkbox" name="title"');
  });

  it("renders the footer links", () => {
    const footer = html.match(/<footer class="site-footer">[\s\S]*<\/footer>/)?.[0] ?? "";
    for (
      const href of [
        "https://github.com/marr-cloud/github-profile-trophy",
        "https://github.com/ryo-ma/github-profile-trophy",
        "https://github.com/marr-cloud/github-profile-trophy#usage",
        "https://github.com/marr-cloud/github-profile-trophy/issues/new",
        "https://github.com/marr-cloud/github-profile-trophy/blob/main/LICENSE",
      ]
    ) {
      expect(footer).toMatch(
        new RegExp(`<a href="${href}" target="_blank" rel="noopener noreferrer">`),
      );
    }
  });

  it("keeps chip glyph escapes ASCII-safe in builder.css", () => {
    const css = readFileSync(new URL("../../public/builder.css", import.meta.url), "utf8");
    expect(css).toMatch(/\[data-state="include"\]::before \{ content: "\\2713/);
    expect(css).toMatch(/\[data-state="exclude"\]::before \{ content: "\\2715/);
    expect(css).not.toMatch(/[^\x00-\x7F]/);
  });

  it("chip CSS does not use Pico's per-button local vars", () => {
    const css = readFileSync(new URL("../../public/builder.css", import.meta.url), "utf8");
    const chipRules = css.match(/^[.]chip.*$/gm) ?? [];
    expect(chipRules.length).toBeGreaterThan(0);
    for (const rule of chipRules) {
      expect(rule).not.toContain("var(--pico-background-color)");
      expect(rule).not.toMatch(/var\(--pico-color\)/);
    }
  });

  it("initial Columns input matches the backend default (8)", () => {
    expect(html).toMatch(/id="column"[^>]*value="8"/);
  });

  it("derives the social preview image from the request origin", () => {
    const page = renderQueryBuilder("https://trophy.maurrod.dev/");
    expect(page).toContain('property="og:image" content="https://trophy.maurrod.dev/og-preview.png"');
    expect(page).toContain('name="twitter:image" content="https://trophy.maurrod.dev/og-preview.png"');
    expect(page).not.toContain("infraforge");
  });
});
