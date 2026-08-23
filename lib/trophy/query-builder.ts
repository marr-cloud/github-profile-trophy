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

const RANK_OPTIONS = ["S", "A", "B", "C"] as const;

const DEFAULTS = {
  theme: "default",
  column: "6",
  row: "3",
  "margin-w": "0",
  "margin-h": "0",
  "no-bg": "false",
  "no-frame": "false",
} as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * JSON-encode a value for embedding inside an inline `<script>` tag. Also
 * escapes `<`, `>`, `&` so a payload cannot break out with `</script>` or
 * introduce a nested `<script>` (the standard hardening used by frameworks
 * that serialize state into HTML).
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * Landing page for `GET /` when the caller has not supplied a username: a
 * self-contained HTML form that live-previews a trophy card. The preview
 * `<img>` points back at the same endpoint (defaulting to `octocat`), so the
 * server delivers the real SVG the visitor's URL will render.
 */
export function renderQueryBuilder(baseUrl: string): string {
  const safeBase = escapeHtml(baseUrl);
  const themeOptions = THEME_NAMES
    .map((n) => `<option value="${n}"${n === "default" ? " selected" : ""}>${n}</option>`)
    .join("");
  const titleBoxes = TITLE_OPTIONS
    .map((t) =>
      `<label><input type="checkbox" name="title" value="${t}"> ${t}</label>`
    )
    .join("");
  const rankBoxes = RANK_OPTIONS
    .map((r) =>
      `<label><input type="checkbox" name="rank" value="${r}"> ${r}</label>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GitHub Profile Trophy — Query Builder</title>
<meta name="description" content="Build and preview a GitHub Profile Trophy card">
<style>
  :root {
    --bg: #f6f8fa;
    --panel: #fff;
    --border: #d0d7de;
    --text: #1f2328;
    --muted: #656d76;
    --accent: #0969da;
    --accent-hover: #0550ae;
    --code-bg: #eff1f3;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }
  header {
    padding: 24px 20px 8px;
    text-align: center;
  }
  header h1 { margin: 0; font-size: 24px; }
  header p { margin: 4px 0 0; color: var(--muted); font-size: 14px; }
  main {
    display: grid;
    grid-template-columns: minmax(280px, 380px) 1fr;
    gap: 20px;
    max-width: 1100px;
    margin: 16px auto;
    padding: 0 20px 32px;
  }
  @media (max-width: 820px) {
    main { grid-template-columns: 1fr; }
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  .field { margin-bottom: 12px; }
  .field label.heading {
    display: block;
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
  }
  input[type="text"], input[type="number"], select {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font: inherit;
    background: #fff;
  }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .toggles { display: flex; gap: 16px; }
  .toggles label { display: flex; align-items: center; gap: 6px; font-size: 14px; }
  .checkgroup {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 4px 8px;
    max-height: 168px;
    overflow-y: auto;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: #fff;
  }
  .checkgroup label { font-size: 13px; display: flex; align-items: center; gap: 4px; }
  .preview-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .preview-wrap img {
    max-width: 100%;
    height: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: #fff;
  }
  .url-row {
    display: flex;
    gap: 8px;
    width: 100%;
  }
  .url-row input {
    flex: 1;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    background: var(--code-bg);
  }
  button {
    padding: 6px 14px;
    border: 1px solid var(--border);
    background: var(--accent);
    color: #fff;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }
  button:hover { background: var(--accent-hover); }
  #copy-status {
    color: var(--muted);
    font-size: 12px;
    min-height: 16px;
  }
  .hint { color: var(--muted); font-size: 12px; margin-top: 4px; }
</style>
</head>
<body>
  <header>
    <h1>GitHub Profile Trophy</h1>
    <p>Customize your trophy card and copy the URL for your README.</p>
  </header>
  <main>
    <form class="panel" id="builder" autocomplete="off">
      <div class="field">
        <label class="heading" for="username">GitHub username</label>
        <input type="text" id="username" data-key="username" placeholder="octocat">
        <div class="hint">Preview uses <code>octocat</code> if empty.</div>
      </div>
      <div class="field">
        <label class="heading" for="theme">Theme</label>
        <select id="theme" data-key="theme">${themeOptions}</select>
      </div>
      <div class="field grid2">
        <div>
          <label class="heading" for="column">Columns</label>
          <input type="number" id="column" data-key="column" min="1" max="10" value="6">
        </div>
        <div>
          <label class="heading" for="row">Rows</label>
          <input type="number" id="row" data-key="row" min="1" max="10" value="3">
        </div>
      </div>
      <div class="field grid2">
        <div>
          <label class="heading" for="margin-w">Margin W</label>
          <input type="number" id="margin-w" data-key="margin-w" min="0" max="40" value="0">
        </div>
        <div>
          <label class="heading" for="margin-h">Margin H</label>
          <input type="number" id="margin-h" data-key="margin-h" min="0" max="40" value="0">
        </div>
      </div>
      <div class="field toggles">
        <label><input type="checkbox" id="no-bg" data-key="no-bg"> no-bg</label>
        <label><input type="checkbox" id="no-frame" data-key="no-frame"> no-frame</label>
      </div>
      <div class="field">
        <label class="heading">Include titles (all if none checked)</label>
        <div class="checkgroup">${titleBoxes}</div>
      </div>
      <div class="field">
        <label class="heading">Include ranks (all if none checked)</label>
        <div class="checkgroup">${rankBoxes}</div>
      </div>
    </form>
    <section class="panel preview-wrap">
      <img id="preview" alt="Trophy preview" src="${safeBase}?username=octocat">
      <div class="url-row">
        <input id="url" readonly value="${safeBase}?username=octocat">
        <button type="button" id="copy">Copy</button>
      </div>
      <div id="copy-status"></div>
    </section>
  </main>
  <script>
    (function () {
      var base = ${jsonForScript(baseUrl)};
      var defaults = ${jsonForScript(DEFAULTS)};
      var form = document.getElementById("builder");
      var preview = document.getElementById("preview");
      var urlInput = document.getElementById("url");
      var status = document.getElementById("copy-status");
      var timer = null;

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

      function collect(name) {
        var boxes = form.querySelectorAll('input[name="' + name + '"]:checked');
        var values = [];
        boxes.forEach(function (b) { values.push(b.value); });
        return values.join(",");
      }

      function update() {
        var url = build();
        urlInput.value = url;
        preview.src = url;
      }

      function schedule() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(update, 250);
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
