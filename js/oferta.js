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
        pdf_url: ch.pdf_url || null,
      });
    }
    return out;
  }

  function cmpNeto(a, b) {
    if (b.neto !== a.neto) return (b.neto == null ? -1 : b.neto) - (a.neto == null ? -1 : a.neto);
    if (a.state !== b.state) return a.state === "pre_aprobado" ? -1 : 1;
    return ids().indexOf(a.id) - ids().indexOf(b.id);
  }

  function cmpCuota(a, b) {
    if (a.cuota !== b.cuota) return a.cuota - b.cuota;
    if (a.state !== b.state) return a.state === "pre_aprobado" ? -1 : 1;
    return ids().indexOf(a.id) - ids().indexOf(b.id);
  }

  function bestOption(caso) {
    const offers = offerList(caso);
    const withNeto = offers.filter((o) => o.neto != null);
    const withCuota = offers.filter((o) => o.cuota != null);
    const mayorNeto = withNeto.length ? [...withNeto].sort(cmpNeto)[0] : null;
    const menorCuota = withCuota.length ? [...withCuota].sort(cmpCuota)[0] : null;
    const same = !!(mayorNeto && menorCuota && mayorNeto.id === menorCuota.id);
    return { offers, mayorNeto, menorCuota, same };
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
    if (o.pdf_url) lines.push("PDF: " + o.pdf_url);
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
      lines.push("Mejor opción: " + best.mayorNeto.nombre + " — mayor neto y menor cuota (sin seguro).");
      lines.push(...offerLines(best.mayorNeto));
    } else {
      if (best.mayorNeto) {
        lines.push("Mayor neto: " + best.mayorNeto.nombre);
        lines.push(...offerLines(best.mayorNeto));
      }
      if (best.menorCuota) {
        if (best.mayorNeto) lines.push("");
        lines.push("Menor cuota (sin seguro): " + best.menorCuota.nombre);
        lines.push(...offerLines(best.menorCuota));
      }
    }
    return lines.join("\n");
  }

  function waUrl(text) {
    return "https://wa.me/?text=" + encodeURIComponent(text);
  }

  async function share(caso, opts) {
    const opt = opts || {};
    const text = shareSummary(caso, opt);
    let url;
    if (opt.channelId) {
      const ch = ((caso && caso.channels) || {})[opt.channelId] || {};
      url = ch.pdf_url || null;
    } else {
      const best = bestOption(caso);
      url = (best.mayorNeto && best.mayorNeto.pdf_url) || (best.offers.find((o) => o.pdf_url) || {}).pdf_url || null;
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const payload = { title: "ZHARO", text };
        if (url) payload.url = url;
        await navigator.share(payload);
        return "share";
      } catch (err) {
        if (err && err.name === "AbortError") return "abort";
      }
    }
    if (typeof window !== "undefined") window.open(waUrl(text), "_blank", "noopener");
    return "whatsapp";
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
    const lab = id === "all" ? "Compartir por WhatsApp" : "Compartir PDF";
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
        ${pdf ? `<div class="best-actions">${pdf}</div>` : ""}
      </div>`;
    };
    let body;
    if (best.same && best.mayorNeto) {
      body = block("Mayor neto y menor cuota", best.mayorNeto);
    } else if (!best.menorCuota) {
      body = block("Mayor neto", best.mayorNeto);
    } else {
      body = block("Mayor neto", best.mayorNeto) + block("Menor cuota (sin seguro)", best.menorCuota);
    }
    return `<div class="best-card ${theme || ""}">
      <div class="best-kicker">Mejor opción</div>
      ${body}
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
    fmtNeto, fmtCuota, cuotaCaption, requestedPlazo, num, clientName,
  };
})();
