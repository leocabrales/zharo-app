/* Login Google. Quién está habilitado lo decide SOLO el servidor (Apps Script, lista privada):
   después del login se pregunta "whoami" con el token de Google. No hay lista pública de mails. */
const ZharoAuth = (() => {
  async function loadAllow() { return {}; }

  function normEmail(e) {
    return String(e || "").trim().toLowerCase();
  }

  function vigente(u) {
    return !!(u && u.provider === "google" && u.verified && u.id_token && (!u.exp || u.exp * 1000 > Date.now() + 60000));
  }

  function isAllowed(email) {
    const u = currentUser();
    return vigente(u) && normEmail(u.email) === normEmail(email);
  }

  function isAdmin(email) {
    const u = currentUser();
    if (!vigente(u) || !u.admin) return false;
    return !email || normEmail(email) === normEmail(u.email);
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

  async function requireAuth(opts = {}) {
    const u = currentUser();
    if (vigente(u)) return u;
    if (u) localStorage.removeItem(ZharoConfig.KEYS.user);      // sesión vencida: volver a entrar
    if (opts.redirect !== false) {
      const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
      location.href = "index.html?next=" + next;
    }
    return null;
  }

  function enterDev() { return null; }   // modo prueba desactivado: sin login real no se usa nada

  async function whoami(idToken) {
    const exec = await ZharoConfig.gasExecUrl();
    const url = new URL(exec);
    url.searchParams.set("action", "whoami");
    url.searchParams.set("id_token", idToken);
    url.searchParams.set("t", String(Date.now()));
    const r = await fetch(url.toString(), { method: "GET", cache: "no-store", mode: "cors", credentials: "omit", redirect: "follow" });
    return r.json();
  }

  function parseJwt(token) {
    try {
      const payload = token.split(".")[1];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch { return null; }
  }

  async function onCredential(response) {
    const data = parseJwt(response.credential);
    if (!data || !data.email) {
      alert("No pude leer el login de Google.");
      return;
    }
    let who = null;
    try { who = await whoami(response.credential); } catch { who = null; }
    if (!who || !who.ok) {
      alert("Tu mail no está habilitado en ZHARO.\nPedile a Leo que te dé de alta.");
      return;
    }
    saveUser({
      email: normEmail(who.email || data.email),
      name: data.name || data.email,
      picture: data.picture || "",
      provider: "google",
      verified: true,
      admin: !!who.admin,
      sub: data.sub || "",
      at: Date.now(),
      exp: data.exp || null,
      id_token: response.credential || "",
    });
    const q = new URLSearchParams(location.search);
    const next = q.get("next") || "cargar.html";
    location.href = /^[\w.-]+\.html(\?.*)?$/.test(next) ? next : "cargar.html";
  }

  async function initGoogleButton(elId) {
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
      auto_select: true,
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

  return { loadAllow, isAllowed, isAdmin, normEmail, currentUser, saveUser, logout, requireAuth, enterDev, initGoogleButton, onCredential };
})();
