/* Pantalla de cotización en vivo — terminal ZHARO */
(function () {
  const CHANNELS = [
    { id: "columbia", name: "Columbia", short: "COL", wait: "Esperando oferta de Columbia…" },
    { id: "galicia", name: "Galicia", short: "GAL", wait: "Esperando oferta de Galicia…" },
    { id: "creditcar", name: "CreditCar", short: "CC", wait: "Esperando oferta de CreditCar…" },
  ];

  const TICKERS = {
    columbia: "consulta bandas · plazos · neto agencia · sin solicitud · ",
    galicia: "scoring · oferta neta · PDF propuesta · sin bruto banco · ",
    creditcar: "evaluación · capital neto · propuesta · canal agencia · ",
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
    $("clientName").textContent = caso.nombre || "Cliente";
    const chips = [
      caso.dni ? `<span class="sim-chip">DNI <span class="mono">${caso.dni}</span></span>` : "",
      caso.agencia ? `<span class="sim-chip">${escapeHtml(caso.agencia)}</span>` : "",
      caso.auto ? `<span class="sim-chip">${escapeHtml(caso.auto)}</span>` : "",
      `<span class="sim-chip">Neto ${escapeHtml(String(caso.neto ?? "máximo"))}</span>`,
      caso.plazo ? `<span class="sim-chip">${escapeHtml(String(caso.plazo))} meses</span>` : "",
    ].filter(Boolean);
    $("clientMeta").innerHTML = chips.join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function channelHtml(ch, st) {
    const state = st?.state || "esperando";
    const cls =
      state === "pre_aprobado" || state === "ok" ? "is-ok" :
      state === "sin_oferta" || state === "no" ? "is-no" :
      state === "error" ? "is-err" : "is-wait";

    let statusLabel = "Calculando";
    if (cls === "is-ok") statusLabel = "Pre aprobado";
    else if (cls === "is-no") statusLabel = "Sin oferta";
    else if (cls === "is-err") statusLabel = "Error temporal";
    else statusLabel = "Cotizando";

    let result = "";
    if (cls === "is-ok") {
      result = `<div class="ch-result">
        <div class="ch-neto"><small>NETO AGENCIA</small>${money(st.neto)}</div>
        <div class="ch-actions">
          ${st.pdf_url ? `<a class="ch-pdf" href="${escapeHtml(st.pdf_url)}" target="_blank" rel="noopener">Abrir PDF</a>` : `<span class="ch-msg">Oferta lista</span>`}
        </div>
      </div>`;
    } else if (cls === "is-no") {
      result = `<div class="ch-result"><div class="ch-msg">Sin oferta disponible en este canal.</div></div>`;
    } else if (cls === "is-err") {
      result = `<div class="ch-result"><div class="ch-msg">${escapeHtml(st.message || "No se pudo consultar. Reintentá más tarde.")}</div></div>`;
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

  function updateProgress(caso) {
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

  function applyRemoteStatus(caso, remote) {
    if (!remote || typeof remote !== "object") return false;
    let changed = false;
    const chans = remote.channels || remote;
    for (const ch of CHANNELS) {
      const r = chans[ch.id];
      if (!r) continue;
      const cur = caso.channels[ch.id] || {};
      const next = {
        state: normalizeState(r.state || r.resultado || r.status),
        neto: r.neto != null ? r.neto : cur.neto,
        pdf_url: r.pdf_url || r.pdf || cur.pdf_url || null,
        message: r.message || r.msg || null,
        updated_at: r.updated_at || new Date().toISOString(),
      };
      if (next.state !== cur.state || next.neto !== cur.neto || next.pdf_url !== cur.pdf_url) {
        caso.channels[ch.id] = next;
        changed = true;
      }
    }
    if (remote.status === "listo" || settledCount(caso) === CHANNELS.length) {
      if (caso.status !== "listo") { caso.status = "listo"; changed = true; }
    }
    return changed;
  }

  function normalizeState(s) {
    const v = String(s || "").toLowerCase();
    if (["pre_aprobado", "preaprobado", "ok", "aprobado", "oferta"].includes(v)) return "pre_aprobado";
    if (["sin_oferta", "sin oferta", "no", "sinoferta"].includes(v)) return "sin_oferta";
    if (["error", "err", "timeout"].includes(v)) return "error";
    if (["esperando", "cotizando", "pending", "wait"].includes(v)) return "esperando";
    return "esperando";
  }

  async function pollOnce(caso) {
    const url = statusUrlFor(caso.id);
    if (!url) return false;
    try {
      const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return false;
      const json = await r.json();
      if (applyRemoteStatus(caso, json)) {
        ZharoCasos.update(caso.id, { channels: caso.channels, status: caso.status });
        paintChannels(caso, { flip: true });
        return true;
      }
    } catch (_) { /* ignore */ }
    return false;
  }

  function startDemo(caso) {
    const plan = [
      { at: 1800, id: "columbia", state: "pre_aprobado", neto: 4850000, pdf_url: "" },
      { at: 3800, id: "galicia", state: "sin_oferta" },
      { at: 5600, id: "creditcar", state: "pre_aprobado", neto: 4200000, pdf_url: "" },
    ];
    // Variación leve según dni para que no siempre sea igual
    const seed = Number(String(caso.dni || "1").slice(-1)) || 1;
    if (seed % 2 === 0) {
      plan[0] = { at: 1600, id: "columbia", state: "sin_oferta" };
      plan[1] = { at: 3400, id: "galicia", state: "pre_aprobado", neto: 5100000, pdf_url: "" };
    }
    for (const step of plan) {
      setTimeout(() => {
        const fresh = ensureChannels(ZharoCasos.get(caso.id) || caso);
        fresh.channels[step.id] = {
          state: step.state,
          neto: step.neto ?? null,
          pdf_url: step.pdf_url || null,
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
        $("clientMeta").innerHTML = `<span class="sim-chip">Volvé a Mis casos e ingresá de nuevo</span>`;
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
      const tick = async () => {
        const c = ensureChannels(ZharoCasos.get(caso.id) || caso);
        await pollOnce(c);
        const fresh = ensureChannels(ZharoCasos.get(caso.id) || c);
        if (settledCount(fresh) < CHANNELS.length && fresh.status !== "listo") setTimeout(tick, 2500);
      };
      // Siempre pedimos el status al abrir (también si ya está listo) para no mostrar demo viejo
      setTimeout(tick, 200);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
