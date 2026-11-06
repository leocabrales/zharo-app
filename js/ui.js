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

  // 1) Envío público, sin token. {statusBase}/submit.json → { url, content_type }.
  // raw.githubusercontent.com cachea ~5 min: el query t= evita un 404 viejo.
  // El POST va como text/plain: el mismo JSON, sin preflight. No mandar application/json.
  const pub = await zharoPublicSubmitTarget(cfg.statusBaseUrl);
  if (pub.url) {
    try {
      const r = await fetch(pub.url, {
        method: "POST",
        headers: { "Content-Type": pub.contentType },
        body: JSON.stringify(payload),
        mode: "cors",
        redirect: "follow",
      });
      remote = { ok: r.ok, status: r.status, skipped: false, via: "public" };
      if (remote.ok) return { saved, payload, remote, text, caseId };
    } catch (e) {
      remote = { ok: false, skipped: false, error: String(e && e.message || e), via: "public" };
    }
  }

  // 2) Respaldo: GitHub Actions (repository_dispatch). Solo si el público no está o falló.
  if (cfg.githubToken) {
    try {
      const repo = cfg.githubRepo || "leocabrales/zharo-app";
      const r = await fetch("https://api.github.com/repos/" + repo + "/dispatches", {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
          "Authorization": "Bearer " + cfg.githubToken,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ event_type: "zharo-case", client_payload: payload }),
        mode: "cors",
      });
      // 204 = accepted
      remote = { ok: r.status === 204 || r.ok, status: r.status, skipped: false, via: "github" };
      if (remote.ok) return { saved, payload, remote, text, caseId };
    } catch (e) {
      remote = { ok: false, skipped: false, error: String(e && e.message || e), via: "github" };
    }
  }

  // 3) Respaldo: webhook directo (CORS suele fallar desde github.io hacia api2.cursor.sh).
  if (cfg.webhookUrl) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (cfg.webhookKey) headers["Authorization"] = "Bearer " + cfg.webhookKey;
      const r = await fetch(cfg.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        mode: "cors",
      });
      remote = { ok: r.ok, status: r.status, skipped: false, via: "webhook" };
    } catch (e) {
      remote = { ok: false, skipped: false, error: String(e && e.message || e), via: "webhook" };
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
  const desc = base + "/submit.json?t=" + Date.now();
  try {
    const r = await fetch(desc, { cache: "no-store", mode: "cors" });
    if (!r.ok) return { url: "", contentType: "" };
    const data = await r.json();
    const url = data && typeof data.url === "string" ? zharoHttpsUrl(data.url) : "";
    if (!url) return { url: "", contentType: "" };
    return { url, contentType: zharoPublicContentType(data.content_type) };
  } catch (e) {
    console.warn("submit.json", e && e.message ? e.message : e);
    return { url: "", contentType: "" };
  }
}
