/* Casos locales (localStorage) + estado de canales para la web. */
const ZharoCasos = (() => {
  const KEY = "zharo_casos_v1";
  const CHANNEL_IDS = ["columbia", "galicia", "creditcar"];

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function emptyChannels() {
    const o = {};
    for (const id of CHANNEL_IDS) {
      o[id] = { state: "esperando", neto: null, pdf_url: null, updated_at: null };
    }
    return o;
  }

  function list() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  }
  function save(arr) {
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, 100)));
    try {
      const bc = new BroadcastChannel("zharo_casos");
      bc.postMessage({ type: "casos_updated" });
      bc.close();
    } catch {}
  }
  function get(id) {
    return list().find((c) => c.id === id) || null;
  }
  function add(caso) {
    const arr = list();
    const row = {
      ...caso,
      id: caso.id || uuid(),
      createdAt: caso.createdAt || new Date().toISOString(),
      status: caso.status || "cotizando",
      channels: (caso.channels && typeof caso.channels === "object") ? caso.channels : emptyChannels(),
    };
    arr.unshift(row);
    save(arr);
    try {
      const bc = new BroadcastChannel("zharo_casos");
      bc.postMessage({ type: "case", id: row.id });
      bc.close();
    } catch {}
    return arr[0];
  }
  function update(id, patch) {
    const arr = list();
    const i = arr.findIndex((c) => c.id === id);
    if (i < 0) return null;
    arr[i] = { ...arr[i], ...patch, updatedAt: new Date().toISOString() };
    save(arr);
    try {
      const bc = new BroadcastChannel("zharo_casos");
      bc.postMessage({ type: "case", id });
      bc.close();
    } catch {}
    return arr[i];
  }
  function mine(email) {
    const e = String(email || "").toLowerCase();
    return list().filter((c) => !e || String(c.email || "").toLowerCase() === e);
  }
  return { list, add, get, update, mine, emptyChannels, CHANNEL_IDS };
})();
