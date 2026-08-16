export function setupApp(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>("#preview-form");
  const out = document.getElementById("preview-out");
  if (!form || !out) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of data.entries()) {
      if (typeof v === "string" && v.length > 0) params.set(k, v);
    }
    out.innerHTML = `<img alt="trophies" src="/?${params.toString()}" />`;
  });
}
