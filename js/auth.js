/* Login Google (GIS) + allowlist + modo prueba. */
const ZharoAuth = (() => {
  const ALLOW_URL = "allowed_users.json";
  let allow = { emails: [], domains: [] };
  let ready = false;

  async function loadAllow() {
    try {
      allow = await (await fetch(ALLOW_URL + "?v=" + Date.now())).json();
    } catch {
      allow = { emails: ["leonel.cabrales91@gmail.com"], domains: [] };
    }
    ready = true;
    return allow;
  }

  function normEmail(e) {
    return String(e || "").trim().toLowerCase();
  }

  function isAllowed(email) {
    const e = normEmail(email);
    if (!e) return false;
    const list = (allow.emails || []).map(normEmail);
    if (list.includes(e)) return true;
    const domains = (allow.domains || []).map(d => String(d).replace(/^@/, "").toLowerCase());
    const domain = e.split("@")[1] || "";
    return domains.includes(domain);
  }

  function currentUser() {
    try {
      const raw = localStorage.getItem(ZharoConfig.KEYS.user);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveUser(u) {
    localStorage.setItem(ZharoConfig.KEYS.user, JSON.stringify(u));
  }

  function logout() {
    localStorage.removeItem(ZharoConfig.KEYS.user);
    location.href = "index.html";
  }

  function requireAuth(opts = {}) {
    const u = currentUser();
    if (u && isAllowed(u.email)) return u;
    if (opts.redirect !== false) {
      const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
      location.href = "index.html?next=" + next;
    }
    return null;
  }

  function enterDev() {
    if (!ZharoConfig.isDev()) return null;
    const u = {
      email: "leonel.cabrales91@gmail.com",
      name: "Leo (modo prueba)",
      picture: "",
      provider: "dev",
      at: Date.now(),
    };
    saveUser(u);
    return u;
  }

  function parseJwt(token) {
    try {
      const payload = token.split(".")[1];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch { return null; }
  }

  function onCredential(response) {
    const data = parseJwt(response.credential);
    if (!data || !data.email) {
      alert("No pude leer el login de Google.");
      return;
    }
    if (!isAllowed(data.email)) {
      alert("Tu mail no está autorizado en ZHARO.\nPedile a Leo que te agregue a allowed_users.json.");
      return;
    }
    saveUser({
      email: normEmail(data.email),
      name: data.name || data.email,
      picture: data.picture || "",
      provider: "google",
      at: Date.now(),
    });
    const q = new URLSearchParams(location.search);
    const next = q.get("next") || "cargar.html";
    location.href = next;
  }

  async function initGoogleButton(elId) {
    await loadAllow();
    const clientId = ZharoConfig.get("googleClientId");
    const wrap = document.getElementById(elId);
    if (!wrap) return;

    if (!clientId) {
      wrap.innerHTML = `<div class="muted" style="text-align:center">
        Falta el <b>Google Client ID</b>. Andá a <a href="config.html">Configuración</a> y pegalo
        (una sola vez, gratis en Google Cloud). Mientras tanto usá <b>modo prueba</b>.
      </div>`;
      return;
    }

    if (!window.google || !google.accounts || !google.accounts.id) {
      wrap.innerHTML = `<div class="muted">Cargando Google…</div>`;
      return;
    }

    google.accounts.id.initialize({
      client_id: clientId,
      callback: onCredential,
      auto_select: false,
      ux_mode: "popup",
    });
    wrap.innerHTML = "";
    google.accounts.id.renderButton(wrap, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "signin_with",
      locale: "es-419",
      width: 320,
    });
  }

  return { loadAllow, isAllowed, currentUser, saveUser, logout, requireAuth, enterDev, initGoogleButton, onCredential };
})();
