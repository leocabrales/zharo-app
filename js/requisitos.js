const ZharoRequisitos = (() => {
  let cache = null;
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }
  async function load() {
    if (cache) return cache;
    try {
      cache = await (await fetch("requisitos.json?v=feat2", { cache: "no-store" })).json();
    } catch { cache = {}; }
    return cache;
  }
  function html(id, data) {
    const row = (data || cache || {})[id] || {};
    const items = Array.isArray(row.items) ? row.items.filter(Boolean) : [];
    const body = items.length
      ? `<ul class="req-list">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
      : `<p class="muted">A completar por Leo. Todavía no cargamos la documentación que pide este banco.</p>`;
    const nota = row.nota && items.length ? `<p class="muted">${esc(row.nota)}</p>` : "";
    const src = row.fuente ? `<p class="muted">Fuente: ${esc(row.fuente)}</p>` : "";
    return `<details class="req-box"><summary>Qué documentación pide</summary>${body}${nota}${src}</details>`;
  }
  return { load, html };
})();
