// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderQueryBuilder } from "~/lib/trophy/query-builder.ts";

const script = readFileSync("public/builder.js", "utf8");

function $(sel: string): HTMLElement {
  return document.querySelector(sel) as HTMLElement;
}
function chip(group: string, value: string): HTMLElement {
  return $(`button[data-group="${group}"][data-value="${value}"]`);
}
function click(el: HTMLElement, times = 1) {
  for (let i = 0; i < times; i++) el.click();
  vi.advanceTimersByTime(300);
}
function urlValue(): string {
  return ($("#url") as HTMLInputElement).value;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = renderQueryBuilder("https://t.example/")
    .replace(/<!DOCTYPE html>/i, "")
    .replace(/<link rel="stylesheet"[^>]*>/g, "");
  (window as unknown as { eval: (s: string) => void }).eval(script);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("builder.js", () => {
  it("omits defaults initially", () => {
    expect(urlValue()).toBe("https://t.example/?username=octocat");
  });

  it("cycles chip state neutral -> include -> exclude -> neutral", () => {
    const c = chip("rank", "C");
    click(c);
    expect(c.dataset.state).toBe("include");
    expect(c.getAttribute("aria-pressed")).toBe("true");
    click(c);
    expect(c.dataset.state).toBe("exclude");
    expect(c.getAttribute("aria-pressed")).toBe("mixed");
    expect(c.getAttribute("aria-label")).toBe("C: excluded");
    expect(urlValue()).toContain("rank=-C");
    click(c);
    expect(c.dataset.state).toBe("neutral");
    expect(c.getAttribute("aria-label")).toBe("C: any");
    expect(urlValue()).not.toContain("rank=");
  });

  it("builds a mixed rank CSV in DOM order and updates preview", () => {
    click(chip("rank", "SS"));
    click(chip("rank", "S"));
    click(chip("rank", "C"), 2);
    expect(new URL(urlValue()).searchParams.get("rank")).toBe("SS,S,-C");
    expect(($("#preview") as HTMLImageElement).src).toBe(urlValue());
  });

  it("excludes a title", () => {
    click(chip("title", "Star"), 2);
    expect(new URL(urlValue()).searchParams.get("title")).toBe("-Star");
  });

  it("prevents form submit", () => {
    const ev = new window.Event("submit", { cancelable: true });
    $("#builder").dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("falls back when navigator.clipboard is missing", () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
    expect(() => $("#copy").click()).not.toThrow();
    vi.advanceTimersByTime(0);
    expect($("#copy-status").textContent).toBe("Copy failed — text selected, press Ctrl+C");
  });

  it("falls back when writeText rejects", async () => {
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
    $("#copy").click();
    await vi.advanceTimersByTimeAsync(0);
    expect($("#copy-status").textContent).toBe("Copy failed — text selected, press Ctrl+C");
  });
});
