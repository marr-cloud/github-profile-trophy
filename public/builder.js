(function () {
  var form = document.getElementById("builder");
  var base = form.dataset.base;
  var defaults = JSON.parse(form.dataset.defaults);
  var preview = document.getElementById("preview");
  var urlInput = document.getElementById("url");
  var mdInput = document.getElementById("markdown");
  var status = document.getElementById("copy-status");
  var timer = null;
  var FAST_DEBOUNCE_MS = 250;
  var USERNAME_DEBOUNCE_MS = 700;

  var STATES = ["neutral", "include", "exclude"];
  var PRESSED = { neutral: "false", include: "true", exclude: "mixed" };
  var LABELS = { neutral: "any", include: "included", exclude: "excluded" };

  function collect(group) {
    var values = [];
    form.querySelectorAll('button.chip[data-group="' + group + '"]').forEach(function (c) {
      if (c.dataset.state === "include") values.push(c.dataset.value);
      else if (c.dataset.state === "exclude") values.push("-" + c.dataset.value);
    });
    return values.join(",");
  }

  function cycle(chip) {
    var next = STATES[(STATES.indexOf(chip.dataset.state) + 1) % STATES.length];
    chip.dataset.state = next;
    chip.setAttribute("aria-pressed", PRESSED[next]);
    chip.setAttribute("aria-label", chip.dataset.value + ": " + LABELS[next]);
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
    var username = form.querySelector("#username").value.trim() || "octocat";
    urlInput.value = url;
    mdInput.value = "[![trophy](" + url + ")](https://github.com/" + username + ")";
    preview.src = url;
  }

  function flash(msg) {
    status.textContent = msg;
    setTimeout(function () { status.textContent = ""; }, 1500);
  }

  function copyFrom(input, okMsg) {
    function fail() {
      input.select();
      flash("Copy failed — text selected, press Ctrl+C");
    }
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      fail();
      return;
    }
    try {
      navigator.clipboard.writeText(input.value).then(function () {
        flash(okMsg);
      }, fail);
    } catch (e) {
      fail();
    }
  }

  function schedule(ev) {
    if (timer) clearTimeout(timer);
    var delay = (ev && ev.target && ev.target.id === "username")
      ? USERNAME_DEBOUNCE_MS
      : FAST_DEBOUNCE_MS;
    timer = setTimeout(update, delay);
  }

  form.addEventListener("click", function (e) {
    var chip = e.target.closest && e.target.closest("button.chip");
    if (!chip) return;
    cycle(chip);
    schedule(e);
  });
  form.addEventListener("input", schedule);
  form.addEventListener("change", schedule);
  form.addEventListener("submit", function (e) { e.preventDefault(); });

  document.getElementById("copy").addEventListener("click", function () {
    copyFrom(urlInput, "URL copied!");
  });
  document.getElementById("copy-md").addEventListener("click", function () {
    copyFrom(mdInput, "Markdown copied!");
  });
})();
