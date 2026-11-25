/* Mejor opción + compartir (WhatsApp / Web Share). Solo datos reales del banco. */
const ZharoOferta = (() => {
  const LABELS = { columbia: "Columbia", galicia: "Galicia", creditcar: "CreditCar", nacion: "Nación" };
  const IDS = ["columbia", "galicia", "creditcar", "nacion"];
  const OFFER = new Set(["pre_aprobado", "sujeto_analisis"]);

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  function ids() {
    return (typeof ZharoCasos !== "undefined" && ZharoCasos.CHANNEL_IDS) || IDS;
  }

  function label(id) {
    if (typeof ZharoCasos !== "undefined" && ZharoCasos.CHANNEL_LABEL) return ZharoCasos.CHANNEL_LABEL[id] || id;
    return LABELS[id] || id;
  }

  function stateOf(ch) {
    const raw = (ch && (ch.resultado || ch.state)) || "";
    if (typeof ZharoCasos !== "undefined" && ZharoCasos.normResultado) return ZharoCasos.normResultado(raw);
    return String(raw || "");
  }

  function stateLabel(s) {
    if (typeof ZharoCasos !== "undefined" && ZharoCasos.stateLabel) return ZharoCasos.stateLabel(s);
    if (s === "pre_aprobado") return "Pre aprobado";
    if (s === "sujeto_analisis") return "Sujeto a análisis";
    return s || "";
  }

  function num(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    let s = String(v).trim().replace(/[$\s]/g, "");
    if (!s || /m[aá]ximo/i.test(s)) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function requestedPlazo(caso) {
    const raw = caso && (caso.plazo ?? caso.plazos ?? (caso._raw && (caso._raw.plazo ?? caso._raw.plazos)));
    const n = Number(String(raw == null ? "" : raw).replace(/\D/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function cuotaFromOptions(options, plazo) {
    if (!Array.isArray(options)) return null;
    let fallback = null;
    for (const o of options) {
      if (!o || typeof o !== "object") continue;
      if (Array.isArray(o.plazos)) {
        if (plazo != null) {
          const hit = o.plazos.find((x) => x && Number(x.plazo) === plazo && num(x.primera_cuota) != null);
          if (hit) return { valor: num(hit.primera_cuota), plazo: Number(hit.plazo), kind: "primera" };
        }
        const sel = o.plazos.find((x) => x && (plazo == null || Number(x.plazo) === Number(o.plazo)) && num(x.primera_cuota) != null);
        if (sel && fallback == null) fallback = { valor: num(sel.primera_cuota), plazo: Number(sel.plazo), kind: "primera" };
      }
      const v = num(o.primera_cuota);
      if (v != null) {
        const p = num(o.plazo);
        if (plazo != null && p === plazo) return { valor: v, plazo: p, kind: "primera" };
        if (fallback == null) fallback = { valor: v, plazo: p, kind: "primera" };
      }
    }
    return fallback;
  }

  function netoFrom(ch) {
    const direct = num(ch && ch.neto);
    let best = direct;
    if (Array.isArray(ch && ch.options)) {
      for (const o of ch.options) {
        const n = num(o && o.neto);
        if (n != null && (best == null || n > best)) best = n;
      }
    }
    return best;
  }

  function cuotaFrom(ch, plazo) {
    const fromOpts = cuotaFromOptions(ch && ch.options, plazo);
    if (fromOpts) return fromOpts;
    const primera = num(ch && (ch.primera_cuota ?? ch.cuota));
    if (primera != null) return { valor: primera, plazo: num(ch.plazo) || plazo, kind: "primera" };
    const prom = num(ch && (ch.cuota_promedio ?? ch.promedio));
    if (prom != null) return { valor: prom, plazo: num(ch.plazo) || plazo, kind: "promedio" };
    return null;
  }

  // Costo comparable: 1ª cuota (sin seguro) por cada $1.000.000 de neto, al plazo pedido.
  // UVA no entra: su 1ª cuota es más baja pero se ajusta, no es comparable con tasa fija.
  function costoAlPlazo(ch, plazo) {
    if (plazo == null || !Array.isArray(ch && ch.options)) return null;
    let best = null;
    const consider = (cuota, neto) => {
      if (cuota == null || neto == null || neto <= 0) return;
      const ratio = cuota * 1e6 / neto;
      if (!best || ratio < best.ratio) best = { cuota, neto, ratio, plazo };
    };
    for (const o of ch.options) {
      if (!o || typeof o !== "object" || /uva/i.test(String(o.tipo || ""))) continue;
      const neto = num(o.neto) ?? num(ch.neto);
      if (Array.isArray(o.plazos) && o.plazos.length) {
        const hit = o.plazos.find((x) => x && Number(x.plazo) === plazo);
        if (hit) consider(num(hit.primera_cuota), neto);
      } else if (num(o.plazo) === plazo) {
        consider(num(o.primera_cuota), neto);
      }
    }
    return best;
  }

  function offerList(caso) {
    const plazo = requestedPlazo(caso);
    const channels = (caso && caso.channels) || {};
    const out = [];
    for (const id of ids()) {
      const ch = channels[id] || {};
      const state = stateOf(ch);
      if (!OFFER.has(state)) continue;
      const neto = netoFrom(ch);
      const cuota = cuotaFrom(ch, plazo);
      out.push({
        id,
        nombre: label(id),
        state,
        stateLabel: stateLabel(state),
        neto,
        cuota: cuota ? cuota.valor : null,
        cuotaKind: cuota ? cuota.kind : null,
        cuotaPlazo: cuota ? cuota.plazo : null,
        costo: costoAlPlazo(ch, plazo),
        pdf_url: ch.pdf_url || null,
      });
    }
    return out;
  }

  function cmpNeto(a, b) {
    if (b.neto !== a.neto) return (b.neto == null ? -1 : b.neto) - (a.neto == null ? -1 : a.neto);
    // Mismo neto (p. ej. todos dan lo pedido): primero pre aprobado, después el más barato al plazo pedido.
    if (a.state !== b.state) return a.state === "pre_aprobado" ? -1 : 1;
    const ra = a.costo ? a.costo.ratio : Infinity, rb = b.costo ? b.costo.ratio : Infinity;
    if (ra !== rb) return ra - rb;
    if (a.state !== b.state) return a.state === "pre_aprobado" ? -1 : 1;
    return ids().indexOf(a.id) - ids().indexOf(b.id);
  }

  function cmpCosto(a, b) {
    if (a.costo.ratio !== b.costo.ratio) return a.costo.ratio - b.costo.ratio;
    if (a.state !== b.state) return a.state === "pre_aprobado" ? -1 : 1;
    return ids().indexOf(a.id) - ids().indexOf(b.id);
  }

  function bestOption(caso) {
    const offers = offerList(caso);
    const withNeto = offers.filter((o) => o.neto != null);
    const mayorNeto = withNeto.length ? [...withNeto].sort(cmpNeto)[0] : null;
    // "Más barata": menor cuota por cada $1M de neto, al plazo pedido (solo bancos con cuota a ese plazo).
    const withCosto = offers.filter((o) => o.costo);
    const barata = withCosto.length ? [...withCosto].sort(cmpCosto)[0] : null;
    const menorCuota = barata ? Object.assign({}, barata, {
      cuota: barata.costo.cuota, cuotaPlazo: barata.costo.plazo, cuotaKind: "primera",
      porMillon: barata.costo.ratio }) : null;
    const same = !!(mayorNeto && menorCuota && mayorNeto.id === menorCuota.id);
    return { offers, mayorNeto, menorCuota, same };
  }

  // Cuotas reales del banco por plazo (mismo neto) para un canal: {plazo: cuota}. Sin UVA.
  function cuotasPorPlazo(ch) {
    const m = {};
    for (const o of (ch && ch.options) || []) {
      if (!o || /uva/i.test(String(o.tipo || ""))) continue;
      for (const x of o.plazos || []) {
        const pl = num(x && x.plazo), cu = num(x && x.primera_cuota);
        if (pl != null && cu != null && m[pl] == null) m[pl] = cu;
      }
      const pl = num(o.plazo), cu = num(o.primera_cuota);
      if (pl != null && cu != null && m[pl] == null) m[pl] = cu;
    }
    return m;
  }

  // Una sola sugerencia para el comercial, siempre con números reales del banco (no va al PDF ni a WhatsApp).
  function sugerencia(caso, best) {
    best = best || bestOption(caso);
    if (!best.offers.length) return null;
    const pedido = num(caso && (caso.neto_pedido ?? caso.neto));
    const plazo = requestedPlazo(caso);
    const pre = best.offers.filter((o) => o.state === "pre_aprobado" && o.neto != null);
    // 1) Lo pedido solo sale sujeto a análisis (o no sale): bajar el monto lo deja pre aprobado.
    if (pedido && !pre.some((o) => o.neto >= pedido * 0.995)) {
      const cand = pre.filter((o) => o.neto >= pedido * 0.6).sort(cmpNeto)[0];
      if (cand) {
        const llega = best.offers.some((o) => o.neto != null && o.neto >= pedido * 0.995);
        return `Si bajás el pedido a ${fmtNeto(cand.neto)}, ${cand.nombre} lo da pre aprobado` +
          (llega ? " (lo pedido solo sale sujeto a análisis)." : " (ningún banco llega a lo pedido).");
      }
    }
    // 2) Más plazo con el mismo banco baja la cuota bastante (mismo neto).
    if (plazo) {
      const o = best.same ? best.mayorNeto : (best.mayorNeto || best.menorCuota);
      const chans = [o, best.menorCuota].filter(Boolean);
      for (const x of chans) {
        const m = cuotasPorPlazo(((caso && caso.channels) || {})[x.id]);
        const base = m[plazo];
        if (base == null) continue;
        const pl = Object.keys(m).map(Number).filter((p) => p > plazo && m[p] <= base * 0.85).sort((a, b) => a - b)[0];
        if (pl) return `Pasando a ${pl} meses con ${x.nombre}, la 1ª cuota baja de ${fmtCuota(base)} a ${fmtCuota(m[pl])} (mismo neto).`;
      }
    }
    return null;
  }

  function fmtNeto(n) {
    if (n == null) return "—";
    if (typeof ZharoCasos !== "undefined" && ZharoCasos.fmtMoney) return "$ " + ZharoCasos.fmtMoney(n);
    return "$ " + Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }

  function fmtCuota(n) {
    const v = num(n);
    if (v == null) return "—";
    return "$ " + v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function cuotaCaption(o) {
    if (!o || o.cuota == null) return null;
    const kind = o.cuotaKind === "promedio" ? "Cuota promedio (sin seguro)" : "1ª cuota (sin seguro)";
    const pl = o.cuotaPlazo ? ` · ${o.cuotaPlazo} meses` : "";
    return kind + pl + ": " + fmtCuota(o.cuota);
  }

  function porMillonCaption(o) {
    if (!o || o.porMillon == null) return null;
    return "≈ " + fmtNeto(Math.round(o.porMillon)) + " de cuota por cada $ 1.000.000";
  }

  function clientName(caso) {
    if (caso && caso.nombre) return String(caso.nombre);
    if (typeof ZharoCasos !== "undefined" && ZharoCasos.clientLabel) {
      return String(ZharoCasos.clientLabel(caso || {})).replace(/\s*·\s*DNI.*$/, "").replace(/^Cliente\s+….*$/, "Cliente");
    }
    return "Cliente";
  }

  function vehicle(caso) {
    return (caso && (caso.vehiculo || caso.auto || (caso._raw && (caso._raw.vehiculo || caso._raw.auto)))) || "—";
  }

  function offerLines(o) {
    const lines = [`${o.nombre} · ${o.stateLabel}`];
    if (o.neto != null) lines.push("Neto " + fmtNeto(o.neto));
    const cap = cuotaCaption(o);
    if (cap) lines.push(cap);
    if (o.pdf_url && !/^drive:/.test(o.pdf_url)) lines.push("PDF: " + o.pdf_url);
    return lines;
  }

  function shareSummary(caso, opts) {
    const opt = opts || {};
    const lines = ["ZHARO — cotización", ""];
    lines.push("Agencia: " + ((caso && caso.agencia) || "—"));
    lines.push("Cliente: " + clientName(caso));
    lines.push("Vehículo: " + vehicle(caso));
    const plazo = requestedPlazo(caso);
    if (plazo) lines.push("Plazo pedido: " + plazo + " meses");
    lines.push("");
    const best = bestOption(caso);
    if (opt.channelId) {
      const o = best.offers.find((x) => x.id === opt.channelId);
      if (!o) return lines.concat("Sin oferta en este canal.").join("\n");
      lines.push("Oferta:");
      lines.push(...offerLines(o));
      return lines.join("\n");
    }
    if (!best.offers.length) {
      lines.push("Todavía no hay una oferta de los bancos.");
      return lines.join("\n");
    }
    if (best.same && best.mayorNeto) {
      lines.push("Mejor opción: " + best.mayorNeto.nombre + " — más plata y más barata.");
      lines.push(...offerLines(best.mayorNeto));
    } else {
      if (best.mayorNeto) {
        lines.push("Más plata: " + best.mayorNeto.nombre);
        lines.push(...offerLines(best.mayorNeto));
      }
      if (best.menorCuota) {
        if (best.mayorNeto) lines.push("");
        lines.push("Más barata: " + best.menorCuota.nombre);
        lines.push(...offerLines(best.menorCuota));
      }
    }
    return lines.join("\n");
  }

  function waUrl(text) {
    return "https://wa.me/?text=" + encodeURIComponent(text);
  }

  function pdfNombre(caso, o) {
    const ap = String(clientName(caso) || "").trim().split(/\s+/)[0] || "";
    const limpio = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return ["Propuesta_ZHARO", limpio(o.nombre), limpio(ap)].filter(Boolean).join("_") + ".pdf";
  }

  // Qué PDFs se comparten: el banco elegido, o la mejor opción (más plata y, si es otro banco, más barata).
  function shareTargets(caso, channelId) {
    const best = bestOption(caso);
    if (channelId) {
      const o = best.offers.find((x) => x.id === channelId);
      return o && o.pdf_url ? [o] : [];
    }
    const out = [];
    for (const o of [best.mayorNeto, best.menorCuota]) {
      if (o && o.pdf_url && !out.some((x) => x.id === o.id)) out.push(o);
    }
    return out;
  }

  // Precarga los PDFs para que al tocar "Compartir" salga al instante.
  function prefetch(caso) {
    if (typeof ZharoPdf === "undefined" || !ZharoPdf.archivo) return;
    const best = bestOption(caso);
    for (const o of best.offers) {
      if (o.pdf_url && /^drive:/.test(o.pdf_url)) ZharoPdf.archivo(o.pdf_url, pdfNombre(caso, o)).catch(() => {});
    }
  }

  async function share(caso, opts) {
    const opt = opts || {};
    const targets = shareTargets(caso, opt.channelId);
    // Se comparte el PDF (no el texto con todos los datos).
    if (targets.length && typeof ZharoPdf !== "undefined" && ZharoPdf.archivo) {
      let files = null;
      try {
        files = await Promise.all(targets.map((o) => ZharoPdf.archivo(o.pdf_url, pdfNombre(caso, o))));
      } catch (e) {
        alert(/unauthorized/.test(String(e && e.message)) ? "Tu sesión venció. Volvé a entrar." : "No se pudo traer el PDF. Probá de nuevo en un momento.");
        return "error";
      }
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files })) {
        try {
          await navigator.share({ files, title: "Propuesta ZHARO" });
          return "share";
        } catch (err) {
          if (err && err.name === "AbortError") return "abort";
        }
      }
      // Sin "compartir archivos" (p. ej. compu): se descarga el PDF para adjuntarlo a mano.
      for (const f of files) {
        const u = URL.createObjectURL(f);
        const a = document.createElement("a");
        a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 60000);
      }
      alert("Se descargó el PDF. Adjuntalo en WhatsApp.");
      return "download";
    }
    alert(opt.channelId ? "Este banco todavía no tiene PDF." : "Todavía no hay un PDF para compartir.");
    return "none";
  }

  function wire(root, casoOrFn) {
    if (!root || root._zharoShareWired) return;
    root._zharoShareWired = true;
    root.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-share]");
      if (!btn || !root.contains(btn)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const caso = typeof casoOrFn === "function" ? casoOrFn() : casoOrFn;
      if (!caso) return;
      const ch = btn.getAttribute("data-share");
      share(caso, { channelId: !ch || ch === "all" ? null : ch });
    });
  }

  function shareBtn(channelId, extraClass) {
    const id = channelId || "all";
    const lab = id === "all" ? "Compartir PDF por WhatsApp" : "Compartir PDF";
    return `<button type="button" class="share-btn ${extraClass || ""}" data-share="${esc(id)}">${lab}</button>`;
  }

  function cardHtml(caso, theme, opts) {
    opts = opts || {};
    const best = bestOption(caso);
    if (!best.offers.length) return "";
    const block = (title, o) => {
      if (!o) return "";
      const cap = cuotaCaption(o);
      const pdf = o.pdf_url
        ? `<a class="share-pdf" href="${esc(o.pdf_url)}" target="_blank" rel="noopener">Ver PDF</a> ${shareBtn(o.id, "share-btn-mini")}`
        : "";
      return `<div class="best-block">
        <div class="best-block-h">${esc(title)}</div>
        <div class="best-bank">${esc(o.nombre)} <span class="ops-st ${o.state === "pre_aprobado" ? "ok" : "review"}">${esc(o.stateLabel)}</span></div>
        ${o.neto != null ? `<div class="best-neto">Neto ${esc(fmtNeto(o.neto))}</div>` : ""}
        ${cap ? `<div class="best-cuota">${esc(cap)}</div>` : ""}
        ${porMillonCaption(o) ? `<div class="best-cuota best-pm">${esc(porMillonCaption(o))}</div>` : ""}
        ${pdf ? `<div class="best-actions">${pdf}</div>` : ""}
      </div>`;
    };
    let body;
    if (best.same && best.mayorNeto) {
      body = block("Más plata y más barata", best.menorCuota);
    } else if (!best.menorCuota) {
      body = block("Más plata", best.mayorNeto);
    } else {
      body = block("Más plata", best.mayorNeto) + block("Más barata", best.menorCuota);
    }
    const tip = sugerencia(caso, best);
    try { prefetch(caso); } catch (_) {}
    return `<div class="best-card ${theme || ""}">
      <div class="best-kicker">Mejor opción</div>
      ${body}
      ${tip ? `<div class="best-tip"><b>Sugerencia:</b> ${esc(tip)}</div>` : ""}
      <div class="best-share">${shareBtn("all")}${(typeof ZharoPrefill !== "undefined" && !opts.hideOtroMonto) ? ` <a class="share-btn share-btn-mini" href="cargar.html" data-prefill="otro_monto">¿Otro monto?</a>` : ""}</div>
    </div>`;
  }


  function plazosOf(ch) {
    const out = [];
    const seen = new Set();
    const add = (plazo, cuota, tipo) => {
      const p = num(plazo);
      const c = num(cuota);
      if (p == null || c == null) return;
      const key = String(p) + ":" + String(tipo || "");
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ plazo: p, primera_cuota: c, tipo: tipo || null });
    };
    if (Array.isArray(ch && ch.options)) {
      for (const o of ch.options) {
        if (!o) continue;
        if (Array.isArray(o.plazos) && o.plazos.length) {
          for (const x of o.plazos) add(x && x.plazo, x && x.primera_cuota, o.tipo);
        } else {
          add(o.plazo, o.primera_cuota, o.tipo);
        }
      }
    }
    return out.sort((a, b) => a.plazo - b.plazo || String(a.tipo||"").localeCompare(String(b.tipo||"")));
  }

  function plazosHtml(ch, chId) {
    const rows = plazosOf(ch);
    if (rows.length < 2) return "";
    const tipos = [...new Set(rows.map((r) => r.tipo || ""))];
    const blocks = (tipos.length > 1 ? tipos : [tipos[0] || ""]).map((tipo) => {
      const list = tipo ? rows.filter((r) => (r.tipo || "") === tipo) : rows;
      if (list.length < 2 && tipos.length > 1) return "";
      const chips = list.map((r, i) =>
        `<button type="button" class="plazo-chip${i === 0 ? " is-sel" : ""}" data-plazo-pick data-plazo="${r.plazo}" data-cuota="${r.primera_cuota}">${r.plazo} m · ${esc(fmtCuota(r.primera_cuota))}</button>`
      ).join("");
      const lab = tipo ? `<div class="plazo-tipo">${esc(tipo)}</div>` : "";
      const first = list[0];
      const line = first
        ? `<div class="ch-opt-line" data-plazo-line><b>${first.plazo} meses</b> · 1ª cuota (sin seguro) <b>${esc(fmtCuota(first.primera_cuota))}</b></div>`
        : "";
      return `<div class="plazo-box" data-plazo-box>${lab}<div class="ch-opt-plazos plazo-chips">${chips}</div>${line}</div>`;
    }).join("");
    return blocks ? `<div class="plazo-switch" data-ch="${esc(chId || "")}">${blocks}</div>` : "";
  }

  function wirePlazos(root) {
    if (!root || root._zharoPlazoWired) return;
    root._zharoPlazoWired = true;
    root.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-plazo-pick]");
      if (!b || !root.contains(b)) return;
      ev.preventDefault();
      const wrap = b.closest("[data-plazo-box]");
      if (!wrap) return;
      wrap.querySelectorAll("[data-plazo-pick]").forEach((x) => { if (x === b) x.classList.add("is-sel"); else x.classList.remove("is-sel"); });
      const line = wrap.querySelector("[data-plazo-line]");
      const plazo = b.getAttribute("data-plazo");
      const cuota = num(b.getAttribute("data-cuota"));
      if (line) line.innerHTML = `<b>${esc(plazo)} meses</b> · 1ª cuota (sin seguro) <b>${esc(fmtCuota(cuota))}</b>`;
    });
  }

  return {
    offerList, bestOption, plazosOf, plazosHtml, wirePlazos, shareSummary, share, waUrl, wire, cardHtml, shareBtn,
    fmtNeto, fmtCuota, cuotaCaption, requestedPlazo, num, clientName, sugerencia, prefetch,
  };
})();
