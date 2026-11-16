import { THEME_NAMES } from "~/lib/trophy/theme.ts";

const TITLE_OPTIONS = [
  "MultipleLang",
  "AllSuperRank",
  "Joined2020",
  "AncientUser",
  "LongTimeUser",
  "Organizations",
  "OGUser",
  "Review",
  "Experience",
  "Star",
  "Commit",
  "Follower",
  "Issue",
  "PullRequest",
  "Repository",
] as const;

const RANK_OPTIONS = ["SECRET", "SSS", "SS", "S", "AAA", "AA", "A", "B", "C"] as const;

const DEFAULTS = {
  theme: "default",
  column: "8",
  row: "3",
  "margin-w": "0",
  "margin-h": "0",
  "no-bg": "false",
  "no-frame": "false",
} as const;

const CHIP_HINT = "Click: include ✓ · again: exclude ✕ · again: clear. Exclusions win.";

const OG_TITLE = "GitHub Profile Trophy";
const OG_DESCRIPTION = "Add dynamically generated trophy cards to your GitHub README.";

/**
 * Social preview image, served as a static PNG from `public/og-preview.png`.
 * Discord/Twitter/LinkedIn reject SVG for OG previews, so we ship a pre-
 * rendered raster of the workerscando/og-image sunset+standard card. When
 * we deploy our own OG worker with dynamic PNG output, swap this to its
 * endpoint and delete public/og-preview.png.
 */
const OG_IMAGE = "https://trophy.infraforge.cc/og-preview.png";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chip(group: "title" | "rank", value: string): string {
  const v = escapeHtml(value);
  return `<button type="button" class="chip" data-group="${group}" data-value="${v}" data-state="neutral" aria-pressed="false" aria-label="${v}: any">${v}</button>`;
}

const FOOTER_LINKS = [
  ["Source code", "https://github.com/marr-cloud/github-profile-trophy"],
  ["Original project", "https://github.com/ryo-ma/github-profile-trophy"],
  ["Parameters", "https://github.com/marr-cloud/github-profile-trophy#usage"],
  ["Report an issue", "https://github.com/marr-cloud/github-profile-trophy/issues/new"],
  ["License (MIT)", "https://github.com/marr-cloud/github-profile-trophy/blob/main/LICENSE"],
] as const;

/**
 * Landing page for `GET /` when the caller has not supplied a username: a
 * self-contained HTML form that live-previews a trophy card. Styled with
 * Pico CSS (auto light/dark via `prefers-color-scheme`); the preview `<img>`
 * points back at the same endpoint (defaulting to `octocat`).
 */
export function renderQueryBuilder(baseUrl: string): string {
  const safeBase = escapeHtml(baseUrl);
  const safeDefaults = escapeHtml(JSON.stringify(DEFAULTS));
  const themeOptions = THEME_NAMES
    .map((n) => `<option value="${n}"${n === "default" ? " selected" : ""}>${n}</option>`)
    .join("");
  const titleBoxes = TITLE_OPTIONS
    .map((t) => chip("title", t))
    .join("");
  const rankBoxes = RANK_OPTIONS
    .map((r) => chip("rank", r))
    .join("");

  const footerLinks = FOOTER_LINKS
    .map(([label, href]) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GitHub Profile Trophy — Query Builder</title>
<meta name="description" content="Build and preview a GitHub Profile Trophy card">
<link rel="canonical" href="${safeBase}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(OG_TITLE)}">
<meta property="og:title" content="${escapeHtml(OG_TITLE)} — Query Builder">
<meta property="og:description" content="${escapeHtml(OG_DESCRIPTION)}">
<meta property="og:url" content="${safeBase}">
<meta property="og:image" content="${escapeHtml(OG_IMAGE)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(OG_DESCRIPTION)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(OG_TITLE)} — Query Builder">
<meta name="twitter:description" content="${escapeHtml(OG_DESCRIPTION)}">
<meta name="twitter:image" content="${escapeHtml(OG_IMAGE)}">
<link rel="stylesheet" href="/vendor/pico.min.css">
<link rel="stylesheet" href="/builder.css">
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <h1>GitHub Profile Trophy</h1>
      <p>Build a trophy card and copy the URL for your README.</p>
    </header>
    <div class="layout">
      <form class="panel" id="builder" autocomplete="off" data-base="${safeBase}" data-defaults="${safeDefaults}">
        <fieldset>
          <legend><label for="username">GitHub username</label></legend>
          <input type="text" id="username" data-key="username" placeholder="octocat">
          <div class="hint">Preview uses <code>octocat</code> if empty.</div>
        </fieldset>
        <fieldset>
          <legend><label for="theme">Theme</label></legend>
          <select id="theme" data-key="theme">${themeOptions}</select>
        </fieldset>
        <fieldset>
          <legend>Layout</legend>
          <div class="grid2">
            <label>Columns
              <input type="number" id="column" data-key="column" min="-1" max="20" value="8">
            </label>
            <label>Rows
              <input type="number" id="row" data-key="row" min="1" max="10" value="3">
            </label>
            <div class="hint span-all">Set <code>Columns</code> to <code>-1</code> to fit every trophy in a single adaptive row.</div>
            <label>Margin W
              <input type="number" id="margin-w" data-key="margin-w" min="0" max="40" value="0">
            </label>
            <label>Margin H
              <input type="number" id="margin-h" data-key="margin-h" min="0" max="40" value="0">
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Style</legend>
          <div class="toggles">
            <label><input type="checkbox" id="no-bg" data-key="no-bg"> no-bg</label>
            <label><input type="checkbox" id="no-frame" data-key="no-frame"> no-frame</label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Titles</legend>
          <div class="checkgroup">${titleBoxes}</div>
          <div class="hint">${CHIP_HINT}</div>
        </fieldset>
        <fieldset>
          <legend>Ranks</legend>
          <div class="checkgroup">${rankBoxes}</div>
          <div class="hint">${CHIP_HINT} Exact match: <code>S</code> does not include <code>SS</code>/<code>SSS</code>.</div>
        </fieldset>
      </form>
      <section class="panel">
        <div class="url-row">
          <input id="url" readonly value="${safeBase}?username=octocat">
          <button type="button" id="copy">Copy URL</button>
        </div>
        <div class="url-row">
          <input id="markdown" readonly value="[![trophy](${safeBase}?username=octocat)](https://github.com/octocat)">
          <button type="button" id="copy-md">Copy Markdown</button>
        </div>
        <div id="copy-status" aria-live="polite"></div>
        <div class="preview-frame">
          <img id="preview" alt="Trophy preview" src="${safeBase}?username=octocat">
        </div>
      </section>
    </div>
    <footer class="site-footer">${footerLinks}</footer>
  </div>
  <script src="/builder.js" defer></script>
</body>
</html>`;
}
