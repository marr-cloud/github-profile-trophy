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
  column: "6",
  row: "3",
  "margin-w": "0",
  "margin-h": "0",
  "no-bg": "false",
  "no-frame": "false",
} as const;

const PICO_CDN = "https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css";

const OG_TITLE = "GitHub Profile Trophy";
const OG_DESCRIPTION = "Add dynamically generated trophy cards to your GitHub README.";
const OG_DOMAIN = "trophy.infraforge.cc";
const OG_LOGO = "https://trophy.infraforge.cc/favicon.ico";

/**
 * Social preview image, generated at the edge by the external OG service
 * (workerscando/og-image). Sunset theme + standard layout picked for the gold
 * accent that matches the trophy motif. Swap the base host when we move to
 * our own OG worker.
 */
const OG_IMAGE = "https://og.workerscando.com/api/og"
  + "?title=" + encodeURIComponent(OG_TITLE)
  + "&subtitle=" + encodeURIComponent(OG_DESCRIPTION)
  + "&domain=" + encodeURIComponent(OG_DOMAIN)
  + "&theme=sunset&layout=standard"
  + "&logo=" + encodeURIComponent(OG_LOGO);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * JSON-encode a value for embedding inside an inline `<script>` tag: also
 * escapes `<`, `>`, `&` so a payload cannot break out with `</script>` or
 * introduce a nested `<script>`.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * Landing page for `GET /` when the caller has not supplied a username: a
 * self-contained HTML form that live-previews a trophy card. Styled with
 * Pico CSS (auto light/dark via `prefers-color-scheme`); the preview `<img>`
 * points back at the same endpoint (defaulting to `octocat`).
 */
export function renderQueryBuilder(baseUrl: string): string {
  const safeBase = escapeHtml(baseUrl);
  const themeOptions = THEME_NAMES
    .map((n) => `<option value="${n}"${n === "default" ? " selected" : ""}>${n}</option>`)
    .join("");
  const titleBoxes = TITLE_OPTIONS
    .map((t) =>
      `<label class="chip"><input type="checkbox" name="title" value="${t}"><span>${t}</span></label>`
    )
    .join("");
  const rankBoxes = RANK_OPTIONS
    .map((r) =>
      `<label class="chip"><input type="checkbox" name="rank" value="${r}"><span>${r}</span></label>`
    )
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
<meta property="og:image:type" content="image/svg+xml">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeHtml(OG_DESCRIPTION)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(OG_TITLE)} — Query Builder">
<meta name="twitter:description" content="${escapeHtml(OG_DESCRIPTION)}">
<meta name="twitter:image" content="${escapeHtml(OG_IMAGE)}">
<link rel="stylesheet" href="${PICO_CDN}">
<style>
  :root { --pico-form-element-spacing-vertical: 0.5rem; --pico-form-element-spacing-horizontal: 0.75rem; }
  .wrap { max-width: 1400px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
  header.hero { text-align: center; margin-bottom: 1.5rem; }
  header.hero h1 { margin: 0; font-size: 1.75rem; }
  header.hero p { margin: 0.25rem 0 0; color: var(--pico-muted-color); }
  .layout { display: grid; grid-template-columns: minmax(320px, 380px) 1fr; gap: 1.5rem; align-items: start; }
  @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
  form.panel, section.panel { background: var(--pico-card-background-color); border: 1px solid var(--pico-card-border-color); border-radius: var(--pico-border-radius); padding: 1.25rem; }
  form.panel fieldset { margin: 0 0 1rem; padding: 0; border: 0; }
  form.panel fieldset:last-child { margin-bottom: 0; }
  form.panel legend { font-weight: 600; font-size: 0.875rem; padding: 0; margin-bottom: 0.5rem; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .toggles { display: flex; gap: 1.25rem; flex-wrap: wrap; }
  .toggles label { display: inline-flex; align-items: center; gap: 0.4rem; margin: 0; }
  .toggles input[type="checkbox"] { margin: 0; }
  .checkgroup { display: flex; flex-wrap: wrap; gap: 0.4rem; max-height: 12rem; overflow-x: hidden; overflow-y: auto; padding: 0.6rem 0.7rem; border: 1px solid var(--pico-form-element-border-color); border-radius: var(--pico-border-radius); background: var(--pico-form-element-background-color); }
  .chip { display: inline-block; margin: 0; cursor: pointer; }
  .chip input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .chip span { display: inline-block; padding: 0.28rem 0.7rem; border: 1px solid var(--pico-form-element-border-color); border-radius: 999px; font-size: 0.82rem; line-height: 1.2; color: var(--pico-color); background: var(--pico-background-color); transition: background-color 0.12s, color 0.12s, border-color 0.12s; user-select: none; }
  .chip:hover span { border-color: var(--pico-primary); }
  .chip input:checked + span { background: var(--pico-primary); color: var(--pico-primary-inverse); border-color: var(--pico-primary); }
  .chip input:focus-visible + span { outline: 2px solid var(--pico-primary-focus); outline-offset: 2px; }
  .checkgroup input[type="checkbox"] { margin: 0; }
  .hint { color: var(--pico-muted-color); font-size: 0.8rem; margin-top: 0.35rem; }
  .preview-frame { min-height: 260px; display: flex; align-items: center; justify-content: center; background: var(--pico-form-element-background-color); border: 1px dashed var(--pico-form-element-border-color); border-radius: var(--pico-border-radius); padding: 1rem; margin-bottom: 1rem; }
  .preview-frame img { max-width: 100%; height: auto; display: block; }
  .url-row { display: grid; grid-template-columns: 1fr auto; gap: 0.5rem; margin-bottom: 0.25rem; }
  .url-row input { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; }
  .url-row button { margin: 0; }
  #copy-status { color: var(--pico-muted-color); font-size: 0.8rem; min-height: 1rem; margin-bottom: 0.75rem; }
  form.panel select, form.panel input[type="text"], form.panel input[type="number"] { margin-bottom: 0; }
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <h1>GitHub Profile Trophy</h1>
      <p>Build a trophy card and copy the URL for your README.</p>
    </header>
    <div class="layout">
      <form class="panel" id="builder" autocomplete="off">
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
              <input type="number" id="column" data-key="column" min="-1" max="20" value="6">
            </label>
            <label>Rows
              <input type="number" id="row" data-key="row" min="1" max="10" value="3">
            </label>
            <div class="hint" style="grid-column: 1 / -1;">Set <code>Columns</code> to <code>-1</code> to fit every trophy in a single adaptive row.</div>
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
          <legend>Include titles</legend>
          <div class="checkgroup">${titleBoxes}</div>
          <div class="hint">All trophies shown when none are checked.</div>
        </fieldset>
        <fieldset>
          <legend>Include ranks</legend>
          <div class="checkgroup">${rankBoxes}</div>
          <div class="hint">Exact match: <code>S</code> does not include <code>SS</code>/<code>SSS</code>. Pick each tier you want to keep.</div>
        </fieldset>
      </form>
      <section class="panel">
        <div class="url-row">
          <input id="url" readonly value="${safeBase}?username=octocat">
          <button type="button" id="copy">Copy URL</button>
        </div>
        <div id="copy-status" aria-live="polite"></div>
        <div class="preview-frame">
          <img id="preview" alt="Trophy preview" src="${safeBase}?username=octocat">
        </div>
      </section>
    </div>
  </div>
  <script>
    (function () {
      var base = ${jsonForScript(baseUrl)};
      var defaults = ${jsonForScript(DEFAULTS)};
      var form = document.getElementById("builder");
      var preview = document.getElementById("preview");
      var urlInput = document.getElementById("url");
      var status = document.getElementById("copy-status");
      var timer = null;
      var FAST_DEBOUNCE_MS = 250;
      var USERNAME_DEBOUNCE_MS = 700;

      function collect(name) {
        var boxes = form.querySelectorAll('input[name="' + name + '"]:checked');
        var values = [];
        boxes.forEach(function (b) { values.push(b.value); });
        return values.join(",");
      }

      function build() {
        var params = new URLSearchParams();
        var username = form.querySelector("#username").value.trim();
        params.set("username", username || "octocat");
        form.querySelectorAll("[data-key]").forEach(function (el) {
          if (el.id === "username") return;
          var key = el.dataset.key;
          if (el.type === "checkbox") {
            if (el.checked) params.set(key, "true");
          } else {
            var v = String(el.value).trim();
            if (v && v !== defaults[key]) params.set(key, v);
          }
        });
        var titles = collect("title");
        if (titles) params.set("title", titles);
        var ranks = collect("rank");
        if (ranks) params.set("rank", ranks);
        return base + "?" + params.toString();
      }

      function update() {
        var url = build();
        urlInput.value = url;
        preview.src = url;
      }

      function schedule(ev) {
        if (timer) clearTimeout(timer);
        var delay = (ev && ev.target && ev.target.id === "username")
          ? USERNAME_DEBOUNCE_MS
          : FAST_DEBOUNCE_MS;
        timer = setTimeout(update, delay);
      }

      form.addEventListener("input", schedule);
      form.addEventListener("change", schedule);

      document.getElementById("copy").addEventListener("click", function () {
        navigator.clipboard.writeText(urlInput.value).then(function () {
          status.textContent = "Copied!";
          setTimeout(function () { status.textContent = ""; }, 1500);
        }).catch(function () {
          status.textContent = "Copy failed";
        });
      });
    })();
  </script>
</body>
</html>`;
}
