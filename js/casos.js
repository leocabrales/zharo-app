/* Casos locales (localStorage) + feed público del bot + panel de gestión. */
const ZharoCasos = (() => {
  const KEY = "zharo_casos_v1";
  const CHANNEL_IDS = ["columbia", "galicia", "creditcar", "nacion"];
  const CHANNEL_LABEL = { columbia: "Columbia", galicia: "Galicia", creditcar: "CreditCar" , nacion: "Nación" };
  const REPEAT_THRESHOLD = 3;

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

  function feedUrl() {
    const base = (typeof ZharoConfig !== "undefined" && ZharoConfig.get)
      ? ZharoConfig.get("statusBaseUrl")
      : "https://raw.githubusercontent.com/leocabrales/zharo-app/main/status";
    return String(base).replace(/\/$/, "") + "/casos_feed.json";
  }

  async function fetchFeed() {
    const url = feedUrl();
    try {
      const got = (typeof ZharoConfig !== "undefined" && ZharoConfig.fetchLiveJson)
        ? await ZharoConfig.fetchLiveJson(url)
        : { ok: false };
      if (!got.ok || !got.json) {
        return { casos: [], updated_at: null, count: 0, error: got.missing ? "404" : "fetch", notModified: false };
      }
      const data = got.json;
      const casos = Array.isArray(data.casos) ? data.casos : [];
      return {
        casos,
        updated_at: data.updated_at || null,
        count: data.count || casos.length,
        notModified: !!got.notModified,
      };
    } catch (e) {
      console.warn("casos_feed", e);
      return { casos: [], updated_at: null, count: 0, error: String(e.message || e), notModified: false };
    }
  }

  function foldState(raw) {
    return String(raw || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Observado, a revisar y notas de score no son una oferta: quedan pendientes.
  function normResultado(raw) {
    const r = foldState(raw);
    if (!r) return "pendiente";
    if (r === "sujeto a analisis" || r === "sujeto analisis" || r === "sujetoanalisis") return "sujeto_analisis";
    if (r === "pre aprobado" || r === "preaprobado" || r === "aprobado" || r === "listo" || r === "ok") return "pre_aprobado";
    if (r === "sin oferta" || r === "sinoferta" || r === "no" || r === "rechazado") return "sin_oferta";
    if (r === "error" || r === "err" || r === "timeout") return "error";
    if (r === "no consultado" || r === "noconsultado") return "no_consultado";
    if (r === "sin consultar" || r === "sinconsultar") return "sin_consultar";
    if (r === "no cotizado" || r === "nocotizado") return "no_cotizado";
    if (r === "dni no coincide" || r === "detenido") return "dni_no_coincide";
    if (r === "esperando" || r === "pendiente" || r === "cotizando" || r === "enviado" || r === "wait") return "pendiente";
    return "pendiente";
  }

  function stateLabel(resultado) {
    const r = normResultado(resultado);
    if (r === "no_consultado") return "—";
    if (r === "no_cotizado") return "No cotizado";
    if (r === "dni_no_coincide") return "DNI no coincide";
    if (r === "sin_consultar") return "Sin consultar";
    if (r === "pre_aprobado") return "Pre aprobado";
    if (r === "sujeto_analisis") return "Sujeto a análisis";
    if (r === "sin_oferta") return "Sin oferta";
    if (r === "error") return "Error temporal";
    return "Cotizando";
  }

  function channelResultFromLocal(ch) {
    if (!ch || typeof ch !== "object") return { resultado: null, neto: null, plazos: null };
    const state = ch.state || ch.resultado || "esperando";
    return {
      resultado: normResultado(state),
      neto: ch.neto ?? null,
      plazos: ch.plazos ?? null,
    };
  }

  function fromLocal(c) {
    const channels = {};
    for (const id of CHANNEL_IDS) {
      channels[id] = channelResultFromLocal((c.channels || {})[id]);
    }
    const when = c.createdAt || c.fecha_hora || c.updatedAt || null;
    return {
      id: c.id,
      fecha_hora: when,
      comercial: c.comercial || (c.email ? String(c.email).split("@")[0] : "Web"),
      agencia: c.agencia || "",
      vehiculo: c.auto || c.vehiculo || "",
      neto_pedido: c.neto ?? c.neto_pedido ?? null,
      plazos: c.plazo != null ? String(c.plazo) : (c.plazos || null),
      dni_tail: c.dni ? String(c.dni).replace(/\D/g, "").slice(-3) : null,
      source: "web",
      origin: "local",
      nombre: c.nombre || null,
      dni: c.dni || null,
      status: c.status || null,
      case_state: c.case_state || null,
      href: "simulando.html?id=" + encodeURIComponent(c.id),
      channels,
      _raw: c,
    };
  }

  function fromFeed(c) {
    const channels = {};
    for (const id of CHANNEL_IDS) {
      const ch = (c.channels || {})[id] || {};
      channels[id] = {
        resultado: ch.resultado ? normResultado(ch.resultado) : null,
        neto: ch.neto ?? null,
        plazos: ch.plazos ?? null,
      };
    }
    const isWeb = c.source === "web" || /^[0-9a-f-]{36}$/i.test(c.id || "");
    return {
      id: c.id,
      fecha_hora: c.fecha_hora,
      comercial: c.comercial || "—",
      agencia: c.agencia || "",
      vehiculo: c.vehiculo || "",
      neto_pedido: c.neto_pedido ?? null,
      plazos: c.plazos || null,
      dni_tail: c.dni_tail || null,
      source: c.source || "csv",
      origin: "feed",
      nombre: null,
      dni: null,
      status: null,
      case_state: c.case_state || null,
      href: isWeb ? ("simulando.html?id=" + encodeURIComponent(c.id)) : null,
      channels,
      _raw: c,
    };
  }

  function mergeCases(localArr, feedArr) {
    const map = new Map();
    for (const f of feedArr) {
      const row = fromFeed(f);
      map.set(row.id, row);
    }
    for (const loc of localArr) {
      const row = fromLocal(loc);
      const prev = map.get(row.id);
      if (!prev) {
        map.set(row.id, row);
        continue;
      }
      // Prefer local richness (nombre/dni/href) but keep feed channel fill if local empty
      const channels = { ...prev.channels };
      for (const id of CHANNEL_IDS) {
        const L = row.channels[id];
        const F = prev.channels[id];
        if (!F || F.resultado == null) channels[id] = L;
        else if (!L || L.resultado == null || L.resultado === "pendiente") channels[id] = F;
        else channels[id] = L;
      }
      map.set(row.id, {
        ...prev,
        ...row,
        channels,
        nombre: row.nombre || prev.nombre,
        dni: row.dni || null,
        href: row.href || prev.href,
        case_state: row.case_state || prev.case_state || null,
        origin: "local+feed",
      });
    }
    return Array.from(map.values()).sort((a, b) => {
      const ta = Date.parse(a.fecha_hora) || 0;
      const tb = Date.parse(b.fecha_hora) || 0;
      return tb - ta;
    });
  }

  function overallStatus(caso) {
    if (caso.case_state === "dni_no_coincide") return "dni_no_coincide";
    const vals = CHANNEL_IDS.map((id) => (caso.channels[id] || {}).resultado).filter((v) => v && v !== "no_consultado" && v !== "sin_consultar");
    if (!vals.length) return "pendiente";
    if (vals.some((v) => v === "pendiente")) return "pendiente";
    if (vals.some((v) => v === "pre_aprobado")) return "pre_aprobado";
    if (vals.some((v) => v === "sujeto_analisis")) return "sujeto_analisis";
    if (vals.every((v) => v === "error")) return "error";
    return "sin_oferta";
  }

  function parseFecha(s) {
    if (!s) return null;
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t);
    // "2026-10-27 14:03" Buenos Aires local → treat as local
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    }
    return null;
  }

  function inDateRange(caso, range) {
    if (!range || range === "todos") return true;
    const d = parseFecha(caso.fecha_hora);
    if (!d) return range === "todos";
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (range === "hoy") return d >= start;
    if (range === "7") {
      const x = new Date(start); x.setDate(x.getDate() - 7); return d >= x;
    }
    if (range === "30") {
      const x = new Date(start); x.setDate(x.getDate() - 30); return d >= x;
    }
    return true;
  }

  function applyFilters(casos, f) {
    return casos.filter((c) => {
      if (!inDateRange(c, f.fecha)) return false;
      if (f.agencia && f.agencia !== "todas" && c.agencia !== f.agencia) return false;
      if (f.comercial && f.comercial !== "todos") {
        if (String(c.comercial || "") !== f.comercial) return false;
      }
      const canal = f.canal && f.canal !== "cualquiera" ? f.canal : null;
      const res = f.resultado && f.resultado !== "todos" ? f.resultado : null;
      if (canal) {
        const ch = c.channels[canal] || {};
        const r = ch.resultado;
        if (r == null) return false;
        if (res) return matchResultado(r, res);
        return true;
      }
      if (res) return matchResultado(overallStatus(c), res);
      return true;
    });
  }

  function computeStats(casos) {
    const total = casos.length;
    const perCanal = {};
    for (const id of CHANNEL_IDS) {
      let ok = 0, n = 0;
      for (const c of casos) {
        const r = (c.channels[id] || {}).resultado;
        if (!r || r === "pendiente" || r === "no_consultado" || r === "sin_consultar" || r === "no_cotizado") continue;
        n++;
        if (r === "pre_aprobado") ok++;
        else if (id === "nacion" && r === "sujeto_analisis") ok++; // Nación solo da oferta preliminar
      }
      perCanal[id] = { ok, n, pct: n ? Math.round((ok / n) * 100) : null };
    }
    let overallOk = 0, stopped = 0;
    for (const c of casos) {
      const ov = overallStatus(c);
      if (ov === "pre_aprobado") overallOk++;
      if (ov === "dni_no_coincide") stopped++;
    }
    const cotizados = total - stopped;       // un caso frenado no se cotizó: fuera de la aprobación
    const agCount = {};
    for (const c of casos) {
      const a = c.agencia || "—";
      agCount[a] = (agCount[a] || 0) + 1;
    }
    const topAgencias = Object.entries(agCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nombre, n]) => ({ nombre, n }));

    return {
      total,
      aprobPct: cotizados ? Math.round((overallOk / cotizados) * 100) : 0,
      cotizados,
      dniNoCoincide: stopped,
      aprobCount: overallOk,
      perCanal,
      topAgencias,
    };
  }

  function repeatAlerts(casos, threshold = REPEAT_THRESHOLD) {
    const keyCount = {};
    for (const c of casos) {
      const k = `${c.comercial || "—"}||${c.agencia || "—"}`;
      if (!keyCount[k]) keyCount[k] = { comercial: c.comercial || "—", agencia: c.agencia || "—", n: 0 };
      keyCount[k].n++;
    }
    return Object.values(keyCount)
      .filter((x) => x.n >= threshold)
      .sort((a, b) => b.n - a.n);
  }

  function uniqueValues(casos, field) {
    const s = new Set();
    for (const c of casos) {
      const v = (c[field] || "").trim();
      if (v) s.add(v);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"));
  }

  function fmtMoney(n) {
    if (n == null || n === "") return "—";
    if (typeof n === "string" && /m[aá]ximo/i.test(n)) return "máximo";
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return num.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }

  function fmtWhen(s) {
    const d = parseFecha(s);
    if (!d) return s || "—";
    return d.toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function clientLabel(c) {
    if (c.nombre) {
      const dni = c.dni ? ` · DNI ${c.dni}` : (c.dni_tail ? ` · …${c.dni_tail}` : "");
      return `${c.nombre}${dni}`;
    }
    if (c.dni_tail) return `Cliente …${c.dni_tail}`;
    return c.source === "web" ? "Caso web" : "Consulta bot";
  }

  function matchResultado(r, res) {
    if (res === "aprobado" || res === "pre_aprobado") return r === "pre_aprobado";
    if (res === "sujeto_analisis") return r === "sujeto_analisis";
    if (res === "sin_oferta") return r === "sin_oferta";
    if (res === "error") return r === "error";
    if (res === "sin_consultar") return r === "sin_consultar";
    if (res === "dni_no_coincide") return r === "dni_no_coincide";
    if (res === "pendiente" || res === "cotizando") return r === "pendiente";
    return true;
  }

  function pillClass(resultado) {
    const r = normResultado(resultado);
    if (r === "pre_aprobado") return "ok";
    if (r === "sujeto_analisis") return "review";
    if (r === "error" || r === "dni_no_coincide") return "err";
    if (r === "sin_oferta" || r === "sin_consultar" || r === "no_cotizado") return "no";
    return "wait";
  }

  function pillLabel(resultado) {
    return stateLabel(resultado);
  }

  return {
    list, add, get, update, mine, emptyChannels, CHANNEL_IDS, CHANNEL_LABEL,
    REPEAT_THRESHOLD, fetchFeed, mergeCases, applyFilters, computeStats,
    repeatAlerts, uniqueValues, overallStatus, fmtMoney, fmtWhen, clientLabel,
    pillClass, pillLabel, stateLabel, normResultado, feedUrl,
  };
})();
