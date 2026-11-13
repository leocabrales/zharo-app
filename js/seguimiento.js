/* Estado comercial de una consulta: local por email, con sync opcional al GAS. Sin nombres ni DNI. */
const ZharoSeguimiento = (() => {
  const KEY = "zharo_seguimiento_v1";
  const ESTADOS = [
    { id: "nueva", label: "Nueva" },
    { id: "presentado", label: "Presentado" },
    { id: "liquidado", label: "Liquidado" },
    { id: "cayo", label: "Cayó" },
  ];
  const IDS = new Set(ESTADOS.map((e) => e.id));

  function normEmail(email) {
    if (typeof ZharoCasos !== "undefined" && ZharoCasos.normEmail) return ZharoCasos.normEmail(email);
    return String(email || "").trim().toLowerCase();
  }

  function currentEmail(email) {
    if (email) return normEmail(email);
    if (typeof ZharoCasos !== "undefined" && ZharoCasos.currentEmail) return ZharoCasos.currentEmail();
    try {
      const u = JSON.parse(localStorage.getItem("zharo_user") || "null");
      return normEmail(u && u.email);
    } catch { return ""; }
  }

  function storeKey(email) {
    const e = currentEmail(email);
    return e ? KEY + ":" + e : KEY + ":_anon";
  }

  function read(email) {
    try {
      const raw = JSON.parse(localStorage.getItem(storeKey(email)) || "{}");
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch { return {}; }
  }

  function write(map, email) {
    localStorage.setItem(storeKey(email), JSON.stringify(map || {}));
  }

  function labelOf(id) {
    const hit = ESTADOS.find((e) => e.id === id);
    return hit ? hit.label : "Nueva";
  }

  function pillClass(id) {
    if (id === "liquidado") return "ok";
    if (id === "presentado") return "seg-presentado";
    if (id === "cayo") return "no";
    return "void";
  }

  function get(caseId, email) {
    const row = read(email)[caseId];
    if (!row || !IDS.has(row.estado)) return { estado: "nueva", nota: "", fecha: null };
    return { estado: row.estado, nota: String(row.nota || ""), fecha: row.fecha || null };
  }

  function set(caseId, patch, email) {
    if (!caseId) return get(caseId, email);
    const prev = get(caseId, email);
    const estado = IDS.has(patch && patch.estado) ? patch.estado : prev.estado;
    const nota = patch && Object.prototype.hasOwnProperty.call(patch, "nota")
      ? String(patch.nota || "").slice(0, 500) : prev.nota;
    const row = { estado, nota, fecha: new Date().toISOString() };
    const map = read(email);
    map[caseId] = row;
    write(map, email);
    pushGas(caseId, row).catch(() => {});
    return row;
  }

  function all(email) {
    return read(email);
  }

  function conversion(casos, email) {
    const list = Array.isArray(casos) ? casos : [];
    const porAgencia = {};
    const porComercial = {};
    const bump = (bag, key, liq) => {
      const k = key || "—";
      if (!bag[k]) bag[k] = { n: 0, liquidados: 0 };
      bag[k].n += 1;
      if (liq) bag[k].liquidados += 1;
    };
    let liquidados = 0;
    for (const c of list) {
      const e = get(c && c.id, email).estado;
      const liq = e === "liquidado";
      if (liq) liquidados += 1;
      bump(porAgencia, c && c.agencia, liq);
      bump(porComercial, c && c.comercial, liq);
    }
    const total = list.length;
    const pack = (bag) => Object.entries(bag)
      .map(([nombre, v]) => ({ nombre, n: v.n, liquidados: v.liquidados, pct: v.n ? Math.round((v.liquidados / v.n) * 100) : 0 }))
      .sort((a, b) => b.liquidados - a.liquidados || b.n - a.n || a.nombre.localeCompare(b.nombre, "es"));
    return {
      total,
      liquidados,
      pct: total ? Math.round((liquidados / total) * 100) : 0,
      porAgencia: pack(porAgencia),
      porComercial: pack(porComercial),
    };
  }

  function idToken() {
    try {
      const u = (typeof ZharoAuth !== "undefined" && ZharoAuth.currentUser) ? ZharoAuth.currentUser() : null;
      if (!u || !u.id_token) return "";
      if (u.exp && (Number(u.exp) * 1000) < Date.now() + 15000) return "";
      return u.id_token;
    } catch { return ""; }
  }

  async function execUrl() {
    if (typeof ZharoConfig === "undefined" || !ZharoConfig.gasExecUrl) return "";
    try { return (await ZharoConfig.gasExecUrl(false)) || ""; } catch { return ""; }
  }

  async function pullGas(email) {
    const token = idToken();
    const exec = await execUrl();
    if (!token || !exec) return { ok: false, skipped: true };
    try {
      const u = new URL(exec);
      u.searchParams.set("action", "get_seguimiento");
      u.searchParams.set("id_token", token);
      u.searchParams.set("t", String(Date.now()));
      const r = await fetch(u.toString(), { method: "GET", cache: "no-store", mode: "cors", credentials: "omit", redirect: "follow" });
      if (!r.ok) return { ok: false };
      const data = await r.json();
      if (!data || data.ok !== true || !Array.isArray(data.items)) return { ok: false };
      const map = read(email);
      for (const it of data.items) {
        if (!it || !it.case_id || !IDS.has(it.estado)) continue;
        const prev = map[it.case_id];
        const incoming = Date.parse(it.fecha || "") || 0;
        const local = Date.parse(prev && prev.fecha ? prev.fecha : "") || 0;
        if (!prev || incoming >= local) {
          map[it.case_id] = { estado: it.estado, nota: String(it.nota || "").slice(0, 500), fecha: it.fecha || null };
        }
      }
      write(map, email);
      return { ok: true, count: data.items.length };
    } catch { return { ok: false }; }
  }

  async function pushGas(caseId, row) {
    const token = idToken();
    const exec = await execUrl();
    if (!token || !exec) return { ok: false, skipped: true };
    try {
      const r = await fetch(exec, {
        method: "POST",
        cache: "no-store",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({
          action: "set_seguimiento",
          id_token: token,
          case_id: caseId,
          estado: row.estado,
          nota: row.nota || "",
        }),
      });
      if (!r.ok) return { ok: false };
      const data = await r.json();
      return { ok: !!(data && data.ok) };
    } catch { return { ok: false }; }
  }

  function pillHtml(caseId, email) {
    const row = get(caseId, email);
    return `<span class="ops-st ${pillClass(row.estado)}">${labelOf(row.estado)}</span>`;
  }

  function selectHtml(caseId, email, extraClass) {
    const row = get(caseId, email);
    const opts = ESTADOS.map((e) => `<option value="${e.id}"${e.id === row.estado ? " selected" : ""}>${e.label}</option>`).join("");
    return `<select class="seg-select ${extraClass || ""}" data-seg-estado="${String(caseId).replace(/"/g, "")}">${opts}</select>`;
  }

  return {
    ESTADOS, get, set, all, conversion, pullGas, pushGas,
    labelOf, pillClass, pillHtml, selectHtml, currentEmail, storeKey,
  };
})();
