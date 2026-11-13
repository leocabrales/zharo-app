/* Pantalla de cotización en vivo — terminal ZHARO */
(function () {
  const CHANNELS = [
    { id: "columbia", name: "Columbia", short: "COL", wait: "Esperando oferta de Columbia…" },
    { id: "galicia", name: "Galicia", short: "GAL", wait: "Esperando oferta de Galicia…" },
    { id: "creditcar", name: "CreditCar", short: "CC", wait: "Esperando oferta de CreditCar…" },
    { id: "nacion", name: "Nación", short: "BNA", wait: "Esperando oferta de Nación…" },
  ];

  const TICKERS = {
    columbia: "consulta bandas · plazos · neto agencia · sin solicitud · ",
    galicia: "scoring · oferta neta · PDF propuesta · sin bruto banco · ",
    creditcar: "evaluación · capital neto · propuesta · canal agencia · ",
    nacion: "evaluación CUIL · oferta preliminar · plazo mínimo · sin solicitud · ",
  };

  const $ = (id) => document.getElementById(id);
  const money = (n) => {
    if (n == null || n === "" || n === "máximo") return "—";
    const num = Number(String(n).replace(/\D/g, "")) || Number(n);
    if (!Number.isFinite(num)) return String(n);
    return "$ " + num.toLocaleString("es-AR");
  };

  function q() {
    return new URLSearchParams(location.search);
  }

  function statusUrlFor(caseId) {
    const base = (ZharoConfig.get("statusBaseUrl") || "").trim().replace(/\/$/, "");
    if (!base) return "";
    return base + "/" + encodeURIComponent(caseId) + ".json";
  }

  function ensureChannels(caso) {
    if (!caso.channels) {
      caso.channels = {};
      for (const ch of CHANNELS) {
        caso.channels[ch.id] = { state: "esperando", neto: null, pdf_url: null, updated_at: null };
      }
    }
    return caso;
  }

  function renderClient(caso) {
    $("clientName").textContent = caso.nombre || (caso.remoteOnly ? "Cotización" : "Cliente");
    const netoKnown = caso.neto != null && caso.neto !== "";
    const chips = [
      caso.dni ? `<span class="sim-chip">DNI <span class="mono">${caso.dni}</span></span>` : "",
      caso.agencia ? `<span class="sim-chip">${escapeHtml(caso.agencia)}</span>` : "",
      caso.auto ? `<span class="sim-chip">${escapeHtml(caso.auto)}</span>` : "",
      (netoKnown || !caso.remoteOnly) ? `<span class="sim-chip">Neto ${escapeHtml(String(caso.neto ?? "máximo"))}</span>` : "",
      caso.plazo ? `<span class="sim-chip">${escapeHtml(String(caso.plazo))} meses</span>` : "",
    ].filter(Boolean);
    $("clientMeta").innerHTML = chips.join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  const INTERNAL_MARK = /observado|\bscore\b|l[ií]nea|\ba\s+revisar\b|versi[oó]n\s+cotizada|conclusi[oó]n\s+interna|sujeto a an[aá]lisis crediticio|\bpasa\b|\brechazo\b/i;

  function publicText(text) {
    if (text == null) return "";
    const raw = String(text).replace(/\u00a0/g, " ").trim();
    if (!raw) return "";
    const parts = raw.split(/\n+|(?<=[.!?])\s+|\s+[·•|]\s+/).map((s) => s.trim()).filter(Boolean);
    return parts.filter((p) => !INTERNAL_MARK.test(p)).join(" ").replace(/\s+/g, " ").trim();
  }

  function isPlazosTip(text) {
    return /ajusta el monto seg[uú]n lo que puede pagar el cliente/i.test(String(text || ""));
  }

  function rawTip(st) {
    const t = st?.tip_plazos;
    if (t == null || t === "") return "";
    if (typeof t === "string") return t;
    if (typeof t === "object") return t.text || t.message || t.tip || "";
    return "";
  }

  function channelCopy(ch, st) {
    const message = publicText(st?.message);
    const tipField = publicText(rawTip(st));
    let tip = "";
    if (ch.id === "galicia") {
      if (tipField) tip = tipField;
      else if (isPlazosTip(message)) tip = message;
    }
    const note = message && message !== tip ? message : "";
    return { tip, note };
  }

  function galiciaOptions(ch, st) {
    if (ch.id !== "galicia" || !Array.isArray(st?.options)) return null;
    const fija = [];
    const uva = [];
    for (const o of st.options) {
      if (!o || typeof o !== "object") continue;
      const tipoRaw = String(o.tipo || o.type || "").trim();
      if (!tipoRaw || o.neto == null || o.neto === "") continue;
      if (/uva/i.test(tipoRaw)) uva.push(o.neto);
      else if (/tasa\s*fija|\bfija\b/i.test(tipoRaw)) fija.push(o.neto);
    }
    if (!fija.length || !uva.length) return null;
    return [
      ...fija.map((neto) => ({ tipo: "TASA FIJA", neto })),
      ...uva.map((neto) => ({ tipo: "UVA", neto })),
    ];
  }

  const pct = (v) => (v == null || v === "" || !Number.isFinite(Number(v)))
    ? "—" : Number(v).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "%";
  const cuotaFmt = (v) => (v == null || v === "" || !Number.isFinite(Number(v)))
    ? "—" : "$ " + Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Nación: neto agencia, total financiado y 1° cuota por plazo (sin seguro). Nunca gasto ni costo.
  function nacionHtml(st) {
    const opts = Array.isArray(st?.options) ? st.options : [];
    if (!opts.length) return "";
    return `<div class="ch-options">${opts.map((o) => {
      const tipo = /uva/i.test(o.tipo) ? "UVA" : "Tasa fija";
      const neto = (o.neto != null && o.neto !== "")
        ? `<div class="ch-neto"><small>NETO AGENCIA</small>${escapeHtml(money(o.neto))}</div>` : "";
      const total = o.total_financiado != null
        ? `<div class="ch-opt-line">Total financiado <b>${escapeHtml(money(o.total_financiado))}</b></div>` : "";
      const dif = (o.alcanza === false && o.diferencia != null)
        ? `<div class="ch-opt-line ch-opt-warn">No alcanza lo pedido · diferencia <b>-${escapeHtml(money(Math.abs(o.diferencia)))}</b></div>` : "";
      const pls = Array.isArray(o.plazos) && o.plazos.length
        ? `<div class="ch-opt-plazos">${o.plazos.map((x) => `<span class="${x.plazo === o.plazo ? "is-sel" : ""}">${escapeHtml(String(x.plazo))} m · ${escapeHtml(cuotaFmt(x.plazo === o.plazo ? o.primera_cuota : x.primera_cuota))}</span>`).join("")}</div>` : "";
      return `<div class="ch-opt ch-opt-nacion">
        <div class="ch-opt-head"><span class="ch-opt-tipo">${escapeHtml(tipo)} · TNA ${escapeHtml(pct(o.tna))}</span>${neto}</div>
        ${total}${dif}
        <div class="ch-opt-line"><b>${escapeHtml(String(o.plazo ?? "—"))} meses</b> · 1° cuota <b>${escapeHtml(cuotaFmt(o.primera_cuota))}</b></div>
        ${pls}</div>`;
    }).join("")}</div>`;
  }

  function netoHtml(ch, st) {
    if (ch.id === "nacion") return nacionHtml(st);
    const options = galiciaOptions(ch, st);
    if (!options) {
      return `<div class="ch-neto"><small>NETO AGENCIA</small>${escapeHtml(money(st?.neto))}</div>`;
    }
    return `<div class="ch-options">${options.map((o) => `<div class="ch-opt"><span class="ch-opt-tipo">${escapeHtml(o.tipo)}</span><div class="ch-neto"><small>NETO AGENCIA</small>${escapeHtml(money(o.neto))}</div></div>`).join("")}</div>`;
  }

  function copyHtml(ch, st) {
    const { tip, note } = channelCopy(ch, st);
    return `${tip ? `<p class="ch-tip">${escapeHtml(tip)}</p>` : ""}${note ? `<p class="ch-note">${escapeHtml(note)}</p>` : ""}`;
  }

  function channelHtml(ch, st) {
    const state = st?.state || "esperando";
    // Casos anteriores a Nación (o canal no consultado): no se muestra la tarjeta.
    if (state === "no_consultado") return "";
    const cls =
      state === "no_cotizado" ? "is-stop" :
      state === "sin_consultar" ? "is-skip" :
      state === "sujeto_analisis" ? "is-analisis" :
      state === "pre_aprobado" ? "is-ok" :
      state === "sin_oferta" ? "is-no" :
      state === "error" ? "is-err" : "is-wait";

    let statusLabel = "Cotizando";
    if (cls === "is-stop") statusLabel = "No cotizado";
    else if (cls === "is-skip") statusLabel = "Sin consultar";
    else if (cls === "is-analisis") statusLabel = "Sujeto a análisis";
    else if (cls === "is-ok") statusLabel = "Pre aprobado";
    else if (cls === "is-no") statusLabel = "Sin oferta";
    else if (cls === "is-err") statusLabel = "Error temporal";

    let result = "";
    if (cls === "is-ok" || cls === "is-analisis") {
      const pdf = st?.pdf_url
        ? `<a class="ch-pdf" href="${escapeHtml(st.pdf_url)}" target="_blank" rel="noopener">Abrir PDF</a>`
        : (cls === "is-ok" ? `<span class="ch-msg">Oferta lista</span>` : "");
      result = `<div class="ch-result">
        ${netoHtml(ch, st)}
        ${pdf ? `<div class="ch-actions">${pdf}</div>` : ""}
        ${copyHtml(ch, st)}
      </div>`;
    } else if (cls === "is-stop") {
      result = `<div class="ch-result"><div class="ch-msg">No cotizado.</div></div>`;
    } else if (cls === "is-skip") {
      result = `<div class="ch-result"><div class="ch-msg">${escapeHtml(ch.name)}: sin consultar (no se obtuvo el CUIT del cliente)</div></div>`;
    } else if (cls === "is-no") {
      result = `<div class="ch-result"><div class="ch-msg">Sin oferta disponible en este canal.</div></div>`;
    } else if (cls === "is-err") {
      const msg = publicText(st?.message) || "No se pudo consultar. Reintentá más tarde.";
      result = `<div class="ch-result"><div class="ch-msg">${escapeHtml(msg)}</div></div>`;
    }

    const tick = (TICKERS[ch.id] || "").repeat(4);

    return `<article class="ch glass ${cls}" data-ch="${ch.id}" id="ch_${ch.id}">
      <div class="ch-head">
        <div class="ch-name"><span class="ch-ico">${ch.short}</span>${ch.name}</div>
        <span class="ch-status">${statusLabel}</span>
      </div>
      <div class="ch-body">
        <div class="ch-waitline"><span class="ch-scan" aria-hidden="true"></span><span>${ch.wait}</span></div>
        <div class="ch-ticker" aria-hidden="true"><span>${tick}${tick}</span></div>
        ${result}
      </div>
    </article>`;
  }

  function paintChannels(caso, opts = {}) {
    const box = $("channels");
    const prev = {};
    for (const ch of CHANNELS) {
      const el = document.getElementById("ch_" + ch.id);
      if (el) prev[ch.id] = el.className;
    }
    box.innerHTML = CHANNELS.map((ch) => channelHtml(ch, caso.channels[ch.id])).join("");
    if (opts.flip) {
      for (const ch of CHANNELS) {
        const el = document.getElementById("ch_" + ch.id);
        const wasWait = prev[ch.id] && prev[ch.id].includes("is-wait");
        const nowDone = el && !el.classList.contains("is-wait");
        if (wasWait && nowDone) el.classList.add("flip-in");
      }
    }
    updateProgress(caso);
  }

  function settledCount(caso) {
    return CHANNELS.filter((ch) => {
      const s = caso.channels[ch.id]?.state;
      return s && s !== "esperando" && s !== "cotizando";
    }).length;
  }

  const DNI_MSG = "El DNI no corresponde a la persona declarada. Revisá los datos y volvé a cargar.";
  const CASE_MSGS = { dni_no_coincide: DNI_MSG };

  function isStopped(caso) {
    return !!(caso && caso.case_state && CASE_MSGS[caso.case_state]);
  }

  function renderStop(caso) {
    const box = $("stopBox");
    if (!box) return;
    if (!isStopped(caso)) { box.classList.add("hidden"); return; }
    $("stopMsg").textContent = CASE_MSGS[caso.case_state];
    box.classList.remove("hidden");
  }

  function updateProgress(caso) {
    renderStop(caso);
    if (isStopped(caso)) {
      $("progressBar").style.width = "100%";
      $("progressBar").classList.add("is-stop");
      $("progressLabel").textContent = "Caso detenido · no se cotizó";
      const live = $("liveBadge");
      live.classList.remove("is-done");
      live.classList.add("is-stop");
      $("liveLabel").textContent = "DETENIDO";
      $("doneBox").classList.add("hidden");
      return;
    }
    const n = settledCount(caso);
    const pct = Math.max(8, Math.round((n / CHANNELS.length) * 100));
    $("progressBar").style.width = pct + "%";
    if (n === 0) $("progressLabel").textContent = "Consultando canales…";
    else if (n < CHANNELS.length) $("progressLabel").textContent = `${n} de ${CHANNELS.length} canales respondieron`;
    else $("progressLabel").textContent = "Cotización completa";

    const live = $("liveBadge");
    if (n === CHANNELS.length) {
      live.classList.add("is-done");
      $("liveLabel").textContent = "LISTO";
      $("doneBox").classList.remove("hidden");
      if (caso.status !== "listo") {
        ZharoCasos.update(caso.id, { status: "listo" });
      }
    } else {
      live.classList.remove("is-done");
      $("liveLabel").textContent = "COTIZANDO EN VIVO";
      $("doneBox").classList.add("hidden");
    }
  }

  // Caso frenado (p.ej. DNI que no corresponde a la persona). Se reconoce por case_state, por
  // status "detenido" o, si el endpoint en vivo todavía no conoce el estado, por el mensaje del caso.
  function remoteCaseState(remote) {
    if (CASE_MSGS[remote.case_state]) return remote.case_state;
    const chans = remote.channels || {};
    const msgs = CHANNELS.map((ch) => (chans[ch.id] || {}).message).filter(Boolean);
    if (msgs.length && msgs.every((m) => /^El DNI no corresponde a la persona declarada/i.test(String(m)))) return "dni_no_coincide";
    if (remote.status === "detenido") return "dni_no_coincide";
    return null;
  }

  function applyRemoteStatus(caso, remote) {
    if (!remote || typeof remote !== "object") return false;
    let changed = false;
    const cs = remoteCaseState(remote);
    if (cs) {
      if (caso.case_state !== cs || caso.status !== "detenido") changed = true;
      caso.case_state = cs;
      caso.status = "detenido";
      for (const ch of CHANNELS) {
        const cur = caso.channels[ch.id] || {};
        if (cur.state !== "no_cotizado") changed = true;
        caso.channels[ch.id] = { state: "no_cotizado", neto: null, pdf_url: null, message: null, options: null, updated_at: null };
      }
      return changed;
    }
    const chans = remote.channels || remote;
    for (const ch of CHANNELS) {
      const r = chans[ch.id];
      const cur = caso.channels[ch.id] || {};
      const remoteDone = remote.status === "listo";
      if (!r || (remoteDone && normalizeState(r.state || r.resultado || r.status) === "esperando")) {
        // El caso terminó sin este canal (p.ej. cotizado antes de sumar Nación).
        if (remoteDone && cur.state !== "no_consultado" && normalizeState(cur.state) === "esperando") {
          caso.channels[ch.id] = { state: "no_consultado", neto: null, pdf_url: null, updated_at: null };
          changed = true;
        }
        continue;
      }
      const next = {
        state: normalizeState(r.state || r.resultado || r.status),
        neto: r.neto != null ? r.neto : cur.neto,
        pdf_url: r.pdf_url || r.pdf || cur.pdf_url || null,
        message: Object.prototype.hasOwnProperty.call(r, "message") || Object.prototype.hasOwnProperty.call(r, "msg")
          ? (r.message || r.msg || null)
          : (cur.message || null),
        tip_plazos: Object.prototype.hasOwnProperty.call(r, "tip_plazos") ? (r.tip_plazos ?? null) : (cur.tip_plazos || null),
        options: Object.prototype.hasOwnProperty.call(r, "options") ? sanitizeOptions(r.options, ch.id) : (cur.options || null),
        updated_at: r.updated_at || new Date().toISOString(),
      };
      if (channelSignature(next) !== channelSignature(cur)) {
        caso.channels[ch.id] = next;
        changed = true;
      }
    }
    if (remote.status === "listo" || settledCount(caso) === CHANNELS.length) {
      if (caso.status !== "listo") { caso.status = "listo"; changed = true; }
    }
    return changed;
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

  function sanitizeOptions(options, chId) {
    if (!Array.isArray(options)) return null;
    const out = [];
    for (const o of options) {
      if (!o || typeof o !== "object") continue;
      const tipo = String(o.tipo || o.type || "").trim();
      if (chId === "nacion") {
        // Solo plazo / tasas / cuota (y neto si algún día hay regla). Nunca montos del banco.
        if (!tipo || o.plazo == null) continue;
        const row = { tipo, plazo: o.plazo };
        for (const k of ["tna", "tea", "cft", "primera_cuota", "neto", "total_financiado", "diferencia"]) if (o[k] != null && o[k] !== "") row[k] = o[k];
        if (typeof o.alcanza === "boolean") row.alcanza = o.alcanza;
        if (Array.isArray(o.plazos)) row.plazos = o.plazos.filter((x) => x && x.plazo != null).map((x) => ({ plazo: x.plazo, primera_cuota: x.primera_cuota ?? null })).slice(0, 12);
        out.push(row);
        continue;
      }
      if (!tipo || o.neto == null || o.neto === "") continue;
      out.push({ tipo, neto: o.neto });
    }
    return out.length ? out : null;
  }

  function channelSignature(ch) {
    const c = ch || {};
    return JSON.stringify({
      state: c.state || null,
      neto: c.neto ?? null,
      pdf_url: c.pdf_url || null,
      message: c.message || null,
      tip_plazos: c.tip_plazos || null,
      options: c.options || null,
    });
  }

  // Observado, a revisar y notas de score no se muestran como pre aprobado.
  function normalizeState(s) {
    const v = foldState(s);
    if (v === "sujeto a analisis" || v === "sujeto analisis" || v === "sujetoanalisis") return "sujeto_analisis";
    if (["pre aprobado", "preaprobado", "ok", "aprobado", "oferta"].includes(v)) return "pre_aprobado";
    if (["sin oferta", "sinoferta", "no", "rechazado"].includes(v)) return "sin_oferta";
    if (["error", "err", "timeout"].includes(v)) return "error";
    if (v === "no consultado" || v === "noconsultado") return "no_consultado";
    if (v === "no cotizado" || v === "nocotizado") return "no_cotizado";
    if (v === "sin consultar" || v === "sinconsultar") return "sin_consultar";
    if (["esperando", "cotizando", "pending", "wait", "pendiente", "enviado"].includes(v)) return "esperando";
    return "esperando";
  }

  // "updated" pinta. "same" es un 304 (el archivo no cambió). "missing" todavía no está en git.
  async function pollOnce(caso) {
    const url = statusUrlFor(caso.id);
    if (!url) return "error";
    try {
      const got = await ZharoConfig.fetchLiveJson(url);
      if (got.missing) return "missing";
      if (!got.ok || !got.json || got.notModified) return got.ok ? "same" : "error";
      if (applyRemoteStatus(caso, got.json)) {
        ZharoCasos.update(caso.id, { channels: caso.channels, status: caso.status, case_state: caso.case_state || null });
        paintChannels(caso, { flip: true });
        return "updated";
      }
      return "same";
    } catch (_) {
      return "error";
    }
  }

  function startDemo(caso) {
    const plan = [
      { at: 1800, id: "columbia", state: "pre_aprobado", neto: 4850000, pdf_url: "" },
      { at: 3800, id: "galicia", state: "sin_oferta" },
      { at: 5600, id: "creditcar", state: "sujeto_analisis", neto: 4200000, pdf_url: "" },
    ];
    // Variación leve según dni. El 0 final es par (0 % 2 === 0).
    const lastDigit = String(caso.dni || "").slice(-1);
    const seed = /^\d$/.test(lastDigit) ? Number(lastDigit) : 1;
    if (seed % 2 === 0) {
      plan[0] = { at: 1600, id: "columbia", state: "sin_oferta" };
      plan[1] = {
        at: 3400,
        id: "galicia",
        state: "pre_aprobado",
        neto: 5100000,
        pdf_url: "",
        message: "Este canal ajusta el monto según lo que puede pagar el cliente. A 18 meses: neto hasta $12.000.000 (cuota aprox $1.211.009).",
        options: [
          { tipo: "TASA FIJA", neto: 5100000 },
          { tipo: "UVA", neto: 4700000 },
        ],
      };
    }
    for (const step of plan) {
      setTimeout(() => {
        const fresh = ensureChannels(ZharoCasos.get(caso.id) || caso);
        fresh.channels[step.id] = {
          state: step.state,
          neto: step.neto ?? null,
          pdf_url: step.pdf_url || null,
          message: step.message || null,
          tip_plazos: step.tip_plazos || null,
          options: step.options || null,
          updated_at: new Date().toISOString(),
        };
        if (settledCount(fresh) === CHANNELS.length) fresh.status = "listo";
        else fresh.status = "cotizando";
        ZharoCasos.update(fresh.id, { channels: fresh.channels, status: fresh.status });
        paintChannels(fresh, { flip: true });
      }, step.at);
    }
  }

  function listenLocal(casoId) {
    try {
      const bc = new BroadcastChannel("zharo_casos");
      bc.onmessage = (ev) => {
        if (!ev.data || ev.data.id !== casoId) return;
        const c = ensureChannels(ZharoCasos.get(casoId));
        if (c) paintChannels(c, { flip: true });
      };
    } catch (_) {}
    window.addEventListener("storage", (ev) => {
      if (ev.key !== "zharo_casos_v1") return;
      const c = ensureChannels(ZharoCasos.get(casoId));
      if (c) paintChannels(c, { flip: true });
    });
  }

  async function boot() {
    const user = await ZharoAuth.requireAuth();
    if (!user) return;

    const params = q();
    const id = params.get("id");
    const forceDemo = params.get("demo") === "1";

    let caso = id ? ZharoCasos.get(id) : null;
    if (!caso && id && !forceDemo) {
      // The public status file has no nombre and no DNI. Paint the banks anyway.
      caso = ZharoCasos.add({
        id,
        email: user.email,
        agencia: "",
        dni: "",
        nombre: "",
        auto: "",
        neto: null,
        plazo: "",
        status: "cotizando",
        channels: null,
        remoteOnly: true,
      });
    }
    if (!caso) {
      if (forceDemo) {
        caso = ZharoCasos.add({
          email: user.email,
          agencia: "Demo Agencia",
          dni: "30111222",
          nombre: "Cliente Demo",
          auto: "VW Gol Trend 2020",
          neto: "máximo",
          plazo: "48",
          status: "cotizando",
          channels: null,
          demo: true,
        });
        history.replaceState(null, "", "simulando.html?id=" + encodeURIComponent(caso.id) + "&demo=1");
      } else {
        $("clientName").textContent = "Caso no encontrado";
        $("clientMeta").innerHTML = `<span class="sim-chip">Volvé a Mis consultas e ingresá de nuevo</span>`;
        $("channels").innerHTML = `<p class="muted" style="padding:16px;color:#fff">No hay un caso con este id en este dispositivo. Si cotizaste acá, no borres el almacenamiento del sitio.</p>`;
        return;
      }
    }

    caso = ensureChannels(caso);
    // Si alguna vez quedó marcado demo pero ya hay status real, no volver a demo
    if (caso.demo && !forceDemo) {
      ZharoCasos.update(caso.id, { demo: false });
      caso.demo = false;
    }
    if (caso.status === "enviado") {
      ZharoCasos.update(caso.id, { status: "cotizando" });
      caso.status = "cotizando";
    }

    renderClient(caso);
    paintChannels(caso);
    listenLocal(caso.id);

    const hasStatusBase = !!statusUrlFor(caso.id);
    // Demo SOLO con ?demo=1 explícito. Nunca al reabrir una cotización real.
    const useDemo = forceDemo && settledCount(caso) < CHANNELS.length;

    if (useDemo) {
      startDemo(caso);
      return;
    }

    if (hasStatusBase) {
      let missStreak = 0;
      const tick = async () => {
        const c = ensureChannels(ZharoCasos.get(caso.id) || caso);
        const result = await pollOnce(c);
        if (result === "missing") missStreak += 1;
        else missStreak = 0;
        const fresh = ensureChannels(ZharoCasos.get(caso.id) || c);
        // Cada canal se pinta solo. Recién con los tres (o status listo) se deja de pedir.
        if (!isStopped(fresh) && settledCount(fresh) < CHANNELS.length && fresh.status !== "listo") {
          setTimeout(tick, missStreak >= 8 ? 8000 : 2500);
        }
      };
      // Siempre pedimos el status al abrir (también si ya está listo) para no mostrar demo viejo
      setTimeout(tick, 200);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
