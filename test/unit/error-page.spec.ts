import { describe, expect, it } from "vitest";
import {
  Error400,
  Error404,
  Error419,
  Error502,
} from "~/lib/trophy/error-page.ts";
import { renderQueryBuilder } from "~/lib/trophy/query-builder.ts";

describe("error pages", () => {
  it.each([
    [new Error400(), 400, "Bad Request"],
    [new Error404(), 404, "Not Found"],
    [new Error419(), 419, "Rate Limit Exceeded"],
    [new Error502(), 502, "Bad Gateway"],
  ])("%o has status %i and message %s", (err, status, message) => {
    expect(err.status).toBe(status);
    expect(err.message).toBe(message);
    const html = err.render();
    expect(html).toContain(`${status} - ${message}`);
    expect(html).toContain("<!DOCTYPE html>");
  });
  it("content is inlined into the body when provided", () => {
    const html = new Error400("<p>hello</p>").render();
    expect(html).toContain("<p>hello</p>");
  });
});

describe("renderQueryBuilder", () => {
  it("embeds base URL in preview and copy fields with octocat fallback", () => {
    const html = renderQueryBuilder("https://svc.example");
    expect(html).toContain('src="https://svc.example?username=octocat"');
    expect(html).toContain('value="https://svc.example?username=octocat"');
    expect(html).toContain('id="builder"');
    expect(html).toContain('id="theme"');
  });

  it("renders a markdown snippet wrapping the trophy in a link to the profile", () => {
    const html = renderQueryBuilder("https://svc.example");
    expect(html).toContain(
      'value="[![trophy](https://svc.example?username=octocat)](https://github.com/octocat)"',
    );
    expect(html).toContain('id="copy-md"');
  });

  it("escapes HTML-unsafe characters in the base URL", () => {
    const html = renderQueryBuilder('https://x.test/"><script>');
    expect(html).not.toContain('"><script>');
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });
});
