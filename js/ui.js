function zharoToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove("show"), 2200);
}

function zharoPaintChrome(active) {
  const u = ZharoAuth.currentUser();
  const bar = document.getElementById("userbar");
  const dark = document.body.classList.contains("login-body");
  if (bar && u) {
    if (dark) {
      bar.innerHTML = `<div class="who">${u.picture ? `<img src="${u.picture}" alt="">` : ""}<div><span>${u.name || u.email}</span><small>${u.email || ""}</small></div></div>
        <button type="button" id="btnLogout">Salir</button>`;
    } else {
      bar.innerHTML = `${u.picture ? `<img src="${u.picture}" alt="">` : ""}<span>${u.name || u.email}</span>
        <button class="btn ghost" type="button" id="btnLogout" style="padding:6px 10px;font-size:12px">Salir</button>`;
    }
    const b = document.getElementById("btnLogout");
    if (b) b.onclick = () => ZharoAuth.logout();
  }
  if (ZharoConfig.isDev()) {
    const host = document.getElementById("devBanner");
    if (host) {
      host.className = dark ? "login-dev" : "banner dev";
      host.innerHTML = dark
        ? "MODO PRUEBA — sin Google real. Solo para Leo. Sacalo desde Configuración."
        : "⚠️ MODO PRUEBA — sin Google real. Solo para Leo. Sacalo desde Configuración.";
      host.classList.remove("hidden");
    }
  }
  document.querySelectorAll("[data-nav]").forEach(a => {
    if (a.getAttribute("data-nav") === active) a.classList.add("active");
  });
}

function zharoBuildText(d) {
  const auto = [d.marca, d.modelo, d.version, d.anio].filter(Boolean).join(" ");
  const neto = d.neto === "máximo" || d.neto == null ? "máximo" :
    (typeof d.neto === "number" ? d.neto.toLocaleString("es-AR").replace(/,/g, ".") : String(d.neto));
  return [
    `AGENCIA: ${d.agencia || ""}`,
    `DNI: ${d.dni || ""}`,
    `NOMBRE Y APELLIDO: ${d.nombre || ""}`,
    `AUTO (marca, modelo, versión y año): ${auto}`,
    `NETO A SOLICITAR: ${neto}`,
    `PLAZO (meses): ${d.plazo || ""}`,
  ].join("\n");
}

async function zharoSubmitCase(data, user) {
  const cfg = ZharoConfig.all();
  const text = zharoBuildText(data);
  const caseId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ("c_" + Date.now().toString(36));
  const auto = [data.marca, data.modelo, data.version, data.anio].filter(Boolean).join(" ");

  const payload = {
    source: "zharo-web",
    bot: "AgenteZharoWeb",
    reply_mode: "web",
    case_id: caseId,
    from_name: user?.name || "",
    username: user?.email || "",
    email: user?.email || "",
    text,
    date: Math.floor(Date.now() / 1000),
    form: data,
  };
  // Solo incluir chat_id si el comercial lo configuró explícitamente (legacy).
  // En modo web NO se responde por Telegram.
  if (cfg.replyChatId) {
    payload.chat_id = Number(cfg.replyChatId) || cfg.replyChatId;
  }

  const saved = ZharoCasos.add({
    id: caseId,
    email: user?.email,
    agencia: data.agencia,
    dni: data.dni,
    nombre: data.nombre,
    auto,
    neto: data.neto,
    plazo: data.plazo,
    status: "cotizando",
    payload,
    channels: ZharoCasos.emptyChannels(),
  });

  let remote = { ok: false, skipped: true, reason: "sin_envio" };

  // Único camino: el Apps Script, con el login de Google del comercial (el servidor lo verifica).
  // Sin respaldos por GitHub ni webhooks: ningún dato del cliente pasa por lugares públicos.
  const idToken = (user && user.id_token) || "";
  if (!idToken) {
    remote = { ok: false, skipped: false, error: "Tu sesión venció. Volvé a entrar.", unauthorized: true };
    return { saved, payload, remote, text, caseId };
  }
  const pub = await zharoPublicSubmitTarget(cfg.statusBaseUrl);
  if (pub.url) {
    try {
      const r = await fetch(pub.url, {
        method: "POST",
        headers: { "Content-Type": pub.contentType },
        body: JSON.stringify({ ...payload, id_token: idToken }),
        mode: "cors",
        redirect: "follow",
      });
      let j = null;
      try { j = await r.json(); } catch (_) { j = null; }
      const ok = r.ok && !!(j && j.ok);
      remote = { ok, status: r.status, skipped: false, via: "public" };
      if (j && j.error === "unauthorized") {
        remote.unauthorized = true;
        remote.error = "Tu sesión venció o tu mail no está habilitado. Volvé a entrar.";
      } else if (!ok) {
        remote.error = (j && j.error) || ("HTTP " + r.status);
      }
    } catch (e) {
      remote = { ok: false, skipped: false, error: String(e && e.message || e), via: "public" };
    }
  }
  return { saved, payload, remote, text, caseId };
}

function zharoHttpsUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !u.hostname) return "";
    return raw;
  } catch {
    return "";
  }
}

// text/plain no dispara preflight. application/json sí, y este endpoint no lo responde.
function zharoPublicContentType(value) {
  const raw = String(value || "").trim();
  if (!raw || /^text\/plain\b/i.test(raw) || /^application\/json\b/i.test(raw)) {
    return "text/plain;charset=UTF-8";
  }
  return raw;
}

async function zharoPublicSubmitTarget(statusBase) {
  const base = String(statusBase || "").trim().replace(/\/$/, "");
  if (!base) return { url: "", contentType: "" };
  const desc = base + "/submit.json";
  try {
    const got = await ZharoConfig.fetchLiveJson(desc);
    const data = got && got.json;
    if (!got || !got.ok || !data || typeof data !== "object") return { url: "", contentType: "" };
    const url = typeof data.url === "string" ? zharoHttpsUrl(data.url) : "";
    if (!url) return { url: "", contentType: "" };
    return { url, contentType: zharoPublicContentType(data.content_type) };
  } catch (e) {
    console.warn("submit.json", e && e.message ? e.message : e);
    return { url: "", contentType: "" };
  }
}


function zharoRegisterSW() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const host = location.hostname;
  const ok = location.protocol === "https:" || host === "localhost" || host === "127.0.0.1";
  if (!ok) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (typeof window !== "undefined") {
  if (document.readyState === "complete") zharoRegisterSW();
  else window.addEventListener("load", zharoRegisterSW);
}
