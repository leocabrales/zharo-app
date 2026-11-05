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
  if (bar && u) {
    bar.innerHTML = `${u.picture ? `<img src="${u.picture}" alt="">` : ""}<span>${u.name || u.email}</span>
      <button class="btn ghost" type="button" id="btnLogout" style="padding:6px 10px;font-size:12px">Salir</button>`;
    const b = document.getElementById("btnLogout");
    if (b) b.onclick = () => ZharoAuth.logout();
  }
  if (ZharoConfig.isDev()) {
    const host = document.getElementById("devBanner");
    if (host) {
      host.className = "banner dev";
      host.innerHTML = "⚠️ MODO PRUEBA — sin Google real. Solo para Leo. Sacalo desde Configuración.";
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
  const payload = {
    source: "zharo-web",
    bot: "AgenteZharoWeb",
    chat_id: cfg.replyChatId ? Number(cfg.replyChatId) || cfg.replyChatId : 1664242933,
    from_name: user?.name || "",
    username: user?.email || "",
    email: user?.email || "",
    text,
    date: Math.floor(Date.now() / 1000),
    form: data,
  };

  const saved = ZharoCasos.add({
    email: user?.email,
    agencia: data.agencia,
    dni: data.dni,
    nombre: data.nombre,
    auto: [data.marca, data.modelo, data.version, data.anio].filter(Boolean).join(" "),
    neto: data.neto,
    plazo: data.plazo,
    status: "enviado",
    payload,
  });

  let remote = { ok: false, skipped: true, reason: "sin_webhook" };
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
      remote = { ok: r.ok, status: r.status, skipped: false };
    } catch (e) {
      remote = { ok: false, skipped: false, error: String(e && e.message || e) };
    }
  }
  return { saved, payload, remote, text };
}
