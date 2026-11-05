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

  // 1) GitHub Actions relay (CORS OK desde github.io). Dispara los scripts vía webhook en el runner.
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

  // 2) Webhook directo (falla CORS desde github.io hacia api2.cursor.sh; útil desde otros orígenes).
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
