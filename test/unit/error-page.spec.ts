import { describe, expect, it } from "vitest";
import {
  Error400,
  Error404,
  Error419,
  Error502,
  renderMissingUsernameForm,
} from "~/lib/trophy/error-page.ts";

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

describe("renderMissingUsernameForm", () => {
  it("interpolates the base URL into the recovery form", () => {
    const html = renderMissingUsernameForm("https://svc.example");
    expect(html).toContain("https://svc.example?username=USERNAME");
    expect(html).toContain('name="username"');
    expect(html).toContain('name="theme"');
  });
});
