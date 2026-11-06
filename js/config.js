/* Config local (sin secretos en el repo). Todo vive en localStorage. */
const ZharoConfig = (() => {
  const KEYS = {
    webhookUrl: "zharo_webhook_url",
    webhookKey: "zharo_webhook_key",
    githubToken: "zharo_github_token",
    googleClientId: "zharo_google_client_id",
    replyChatId: "zharo_reply_chat_id",
    statusBaseUrl: "zharo_status_base_url",
    devMode: "zharo_dev",
    user: "zharo_user",
  };

  const DEFAULT_STATUS_BASE = "https://raw.githubusercontent.com/leocabrales/zharo-app/main/status";
  const GITHUB_REPO = "leocabrales/zharo-app";
  const LIVE_CACHE = new Map();
  let apiBlockedUntil = 0;

  function get(k, def = "") {
    try { return localStorage.getItem(KEYS[k] || k) ?? def; } catch { return def; }
  }
  function set(k, v) {
    try {
      if (v === null || v === undefined || v === "") localStorage.removeItem(KEYS[k] || k);
      else localStorage.setItem(KEYS[k] || k, String(v));
    } catch {}
  }
  function statusBase() {
    return (get("statusBaseUrl") || "").trim() || DEFAULT_STATUS_BASE;
  }
  function isDev() {
    const q = new URLSearchParams(location.search);
    if (q.get("dev") === "1") { set("devMode", "1"); return true; }
    if (q.get("dev") === "0") { set("devMode", ""); return false; }
    return get("devMode") === "1";
  }
  function all() {
    return {
      webhookUrl: get("webhookUrl"),
      webhookKey: get("webhookKey"),
      githubToken: get("githubToken"),
      googleClientId: get("googleClientId"),
      replyChatId: get("replyChatId"),
      statusBaseUrl: statusBase(),
      statusBaseDefault: DEFAULT_STATUS_BASE,
      githubRepo: GITHUB_REPO,
      devMode: isDev(),
    };
  }

  // raw.githubusercontent.com (max-age=300) and GitHub Pages (max-age=600) ignore ?t=.
  // jsDelivr @main stays stale for hours; a purge did not refresh a changed file within minutes.
  // The Contents API returns the git blob within seconds. Only this repo's status folder.
  function parseGithubStatus(url) {
    let u;
    try { u = new URL(String(url || "").trim()); } catch { return null; }
    if (u.protocol !== "https:") return null;
    const path = u.pathname;
    let ref = "";
    let file = "";
    if (u.hostname === "raw.githubusercontent.com") {
      const prefix = "/" + GITHUB_REPO + "/";
      if (!path.startsWith(prefix)) return null;
      const rest = path.slice(prefix.length);
      const marker = "/status/";
      const i = rest.indexOf(marker);
      if (i <= 0) return null;
      ref = rest.slice(0, i);
      file = rest.slice(i + marker.length);
    } else if (u.hostname === "leocabrales.github.io") {
      const prefix = "/zharo-app/status/";
      if (!path.startsWith(prefix)) return null;
      ref = "main";
      file = path.slice(prefix.length);
    } else if (u.hostname === "cdn.jsdelivr.net" || u.hostname.endsWith(".jsdelivr.net")) {
      const m = path.match(/^\/gh\/leocabrales\/zharo-app@([^/]+)\/status\/([^/]+)$/);
      if (!m) return null;
      try { ref = decodeURIComponent(m[1]); } catch { return null; }
      file = m[2];
    } else {
      return null;
    }
    if (!ref || !file || ref.includes("..") || file.includes("/") || file.includes("..")) return null;
    if (!/^[A-Za-z0-9._~-]+$/.test(file)) return null;
    return { ref, file };
  }

  function contentsUrl(ref, file) {
    return "https://api.github.com/repos/" + GITHUB_REPO + "/contents/status/"
      + encodeURIComponent(file) + "?ref=" + encodeURIComponent(ref);
  }

  function decodeContents(json) {
    if (!json || json.encoding !== "base64" || json.type !== "file" || typeof json.content !== "string") return json;
    const b64 = json.content.replace(/\s/g, "");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function noteRateLimit(res) {
    if (res.status !== 403 && res.status !== 429) {
      const rawLeft = res.headers.get("X-RateLimit-Remaining");
      if (rawLeft == null || rawLeft === "") return;
      const left = Number(rawLeft);
      if (Number.isFinite(left) && left <= 0) {
        const reset = Number(res.headers.get("X-RateLimit-Reset") || 0);
        apiBlockedUntil = reset ? reset * 1000 : Date.now() + 60000;
      }
      return;
    }
    const retry = Number(res.headers.get("Retry-After") || 0);
    const reset = Number(res.headers.get("X-RateLimit-Reset") || 0);
    const wait = retry ? retry * 1000 : (reset ? Math.max(5000, reset * 1000 - Date.now()) : 60000);
    apiBlockedUntil = Date.now() + wait;
  }

  async function fetchDirectJson(url) {
    const direct = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    const r = await fetch(direct, { cache: "no-store", mode: "cors", credentials: "omit" });
    if (r.status === 404) return { ok: false, notModified: false, missing: true, json: null, via: "direct" };
    if (!r.ok) return { ok: false, notModified: false, missing: false, json: null, via: "direct" };
    return { ok: true, notModified: false, missing: false, json: await r.json(), via: "direct" };
  }

  // Fresh JSON for a status URL. GitHub-hosted files in this repo go through the API
  // so an open tab sees each channel within a few seconds. Any other https base is fetched as-is.
  async function fetchLiveJson(url) {
    const raw = String(url || "").trim();
    if (!raw) return { ok: false, notModified: false, missing: false, json: null, via: "" };
    const gh = parseGithubStatus(raw);
    if (gh && Date.now() >= apiBlockedUntil) {
      const api = contentsUrl(gh.ref, gh.file);
      const headers = {
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      const prev = LIVE_CACHE.get(api);
      if (prev && prev.etag) headers["If-None-Match"] = prev.etag;
      try {
        const r = await fetch(api, { cache: "no-store", mode: "cors", credentials: "omit", headers });
        noteRateLimit(r);
        if (r.status === 304) {
          return { ok: true, notModified: true, missing: false, json: prev ? prev.json : null, via: "api" };
        }
        if (r.status === 404) return { ok: false, notModified: false, missing: true, json: null, via: "api" };
        if (r.ok) {
          const json = decodeContents(await r.json());
          const etag = r.headers.get("ETag");
          LIVE_CACHE.set(api, { etag: etag || "", json });
          return { ok: true, notModified: false, missing: false, json, via: "api" };
        }
      } catch (_) { /* direct fallback below */ }
    }
    try {
      return await fetchDirectJson(raw);
    } catch (_) {
      return { ok: false, notModified: false, missing: false, json: null, via: "direct" };
    }
  }

  return {
    KEYS, get: (k, d) => (k === "statusBaseUrl" ? statusBase() : get(k, d)),
    set, isDev, all, DEFAULT_STATUS_BASE, GITHUB_REPO,
    parseGithubStatus, fetchLiveJson,
  };
})();
