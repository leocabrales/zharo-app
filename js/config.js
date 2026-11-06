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
  const GAS_EXEC_TTL_MS = 10 * 60 * 1000;
  const GAS_JSONP_TIMEOUT_MS = 8000;
  let apiBlockedUntil = 0;
  let gasExec = { base: "", url: "", fetchedAt: 0 };
  let gasExecPromise = null;

  const DEFAULT_GOOGLE_CLIENT_ID = "508282059589-ukbshtuf8u7jck1nto5ir4olrsqbrc6n.apps.googleusercontent.com";

  function get(k, def = "") {
    try {
      const stored = localStorage.getItem(KEYS[k] || k);
      if (stored) return stored;
    } catch {}
    if (k === "googleClientId") return def || DEFAULT_GOOGLE_CLIENT_ID;
    return def;
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

  function emptyLive(via) {
    return { ok: false, notModified: false, missing: false, json: null, via: via || "" };
  }

  function httpsUrl(value) {
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

  // raw.githubusercontent.com (max-age=300) and GitHub Pages (max-age=600) ignore ?t=.
  // jsDelivr @main stays stale for hours; a purge did not refresh a changed file within minutes.
  // Only this repo's status folder is recognized. A case file is not read from those CDNs.
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

  // submit.json is the exec-url descriptor. casos_feed.json is the Mis casos list.
  // Anything else in this folder is one case's public status.
  function caseIdFromStatusFile(file) {
    const name = String(file || "");
    if (!/\.json$/i.test(name)) return "";
    const lower = name.toLowerCase();
    if (lower === "submit.json" || lower === "casos_feed.json") return "";
    const id = name.slice(0, -".json".length);
    if (!id || id.length > 80) return "";
    if (!/^[A-Za-z0-9._~-]+$/.test(id)) return "";
    return id;
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

  async function fetchGithubApi(gh) {
    if (!gh || Date.now() < apiBlockedUntil) return null;
    const api = contentsUrl(gh.ref, gh.file);
    const headers = {
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const prev = LIVE_CACHE.get(api);
    if (prev && prev.etag) headers["If-None-Match"] = prev.etag;
    let r;
    try {
      r = await fetch(api, { cache: "no-store", mode: "cors", credentials: "omit", headers });
    } catch (_) {
      return null;
    }
    noteRateLimit(r);
    if (r.status === 304) {
      return { ok: true, notModified: true, missing: false, json: prev ? prev.json : null, via: "api" };
    }
    if (r.status === 404) return { ok: false, notModified: false, missing: true, json: null, via: "api" };
    if (!r.ok) return null;
    try {
      const json = decodeContents(await r.json());
      const etag = r.headers.get("ETag");
      LIVE_CACHE.set(api, { etag: etag || "", json });
      return { ok: true, notModified: false, missing: false, json, via: "api" };
    } catch (_) {
      return null;
    }
  }

  // The public case file. { ok:true, service:"..." } from the submit probe is not a quote.
  function isPublicStatus(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    if (data.ok === false) return false;
    if (!data.channels || typeof data.channels !== "object" || Array.isArray(data.channels)) return false;
    return true;
  }

  function isMissingStatus(data) {
    return !!(data && typeof data === "object" && !Array.isArray(data) && data.ok === false && data.missing === true);
  }

  function coercePayload(data) {
    if (typeof data !== "string") return data;
    const raw = data.trim();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function classifyGas(data) {
    const payload = coercePayload(data);
    if (isPublicStatus(payload)) {
      return { ok: true, notModified: false, missing: false, json: payload, via: "gas" };
    }
    if (isMissingStatus(payload)) {
      return { ok: false, notModified: false, missing: true, json: null, via: "gas" };
    }
    return null;
  }

  // A fetch that followed the 302 can still come back as callback({...}).
  function parseGasText(text) {
    const raw = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) {}
    const wrapped = raw.match(/^[A-Za-z_$][\w$]*\(([\s\S]*)\)\s*;?$/);
    if (!wrapped) return null;
    try { return JSON.parse(wrapped[1]); } catch (_) { return null; }
  }

  function gasStatusUrl(exec, caseId, extra) {
    const u = new URL(exec);
    u.searchParams.set("action", "status");
    u.searchParams.set("id", caseId);
    if (extra) {
      for (const key of Object.keys(extra)) u.searchParams.set(key, extra[key]);
    }
    // This endpoint caches on the full URL. A repeated t= keeps the previous body.
    u.searchParams.set("t", String(Date.now()));
    return u.toString();
  }

  // submit.json names the Apps Script. Prefer the Contents API; a direct read is only
  // how we learn that URL when the API budget is spent. Case JSON never uses this path.
  async function readSubmitDescriptor(base) {
    const url = String(base || "").replace(/\/$/, "") + "/submit.json";
    const gh = parseGithubStatus(url);
    if (gh) {
      const api = await fetchGithubApi(gh);
      if (api && api.ok && api.json && typeof api.json === "object") return api.json;
    }
    try {
      const direct = await fetchDirectJson(url);
      if (direct.ok && direct.json && typeof direct.json === "object") return direct.json;
    } catch (_) {}
    return null;
  }

  async function gasExecUrl(force) {
    const base = statusBase().replace(/\/$/, "");
    const age = Date.now() - gasExec.fetchedAt;
    const same = !!(gasExec.url && gasExec.base === base);
    if (!force && same && age < GAS_EXEC_TTL_MS) return gasExec.url;
    if (force && same && age < 15000) return gasExec.url;
    if (!force && gasExecPromise && gasExecPromise.base === base) return gasExecPromise.promise;
    const promise = (async () => {
      try {
        const data = await readSubmitDescriptor(base);
        const url = httpsUrl(data && data.url);
        if (url) gasExec = { base, url, fetchedAt: Date.now() };
        return url || (gasExec.base === base ? gasExec.url : "");
      } catch (_) {
        return gasExec.base === base ? gasExec.url : "";
      }
    })();
    const tracked = promise.finally(() => {
      if (gasExecPromise && gasExecPromise.promise === tracked) gasExecPromise = null;
    });
    gasExecPromise = { base, promise: tracked };
    return tracked;
  }

  // CORS on the 302 and on the final body is *. A plain GET is the live read.
  // No custom headers: that would preflight, and this web app does not answer it.
  async function fetchGasHttp(exec, caseId) {
    const url = gasStatusUrl(exec, caseId);
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), GAS_JSONP_TIMEOUT_MS) : 0;
    if (timer && typeof timer.unref === "function") timer.unref();
    try {
      const r = await fetch(url, {
        method: "GET",
        cache: "no-store",
        mode: "cors",
        credentials: "omit",
        redirect: "follow",
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!r.ok) return null;
      return classifyGas(parseGasText(await r.text()));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Fallback when the browser will not expose the redirected body to fetch().
  // Do not reject on load or error: the 302 to script.googleusercontent.com can
  // fire those events before callback() runs, and rejecting here replaces the
  // callback with a no-op so a finished quote never gets painted.
  function jsonpStatus(exec, caseId) {
    return new Promise((resolve, reject) => {
      if (typeof document === "undefined" || !document.head || typeof document.createElement !== "function") {
        reject(new Error("jsonp unavailable"));
        return;
      }
      const cb = "zharoGas_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      let src = "";
      try {
        const u = new URL(exec);
        u.searchParams.set("action", "status");
        u.searchParams.set("id", caseId);
        u.searchParams.set("callback", cb);
        u.searchParams.set("t", String(Date.now()));
        src = u.toString();
      } catch (e) {
        reject(e);
        return;
      }
      const script = document.createElement("script");
      let settled = false;
      let timer = 0;
      const finish = (fn) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        window[cb] = function () {};
        const drop = setTimeout(() => {
          try { if (script.parentNode) script.parentNode.removeChild(script); } catch (_) {}
          try { delete window[cb]; } catch (_) {}
        }, 0);
        if (drop && typeof drop.unref === "function") drop.unref();
        fn();
      };
      window[cb] = (data) => finish(() => resolve(data));
      timer = setTimeout(() => finish(() => reject(new Error("jsonp timeout"))), GAS_JSONP_TIMEOUT_MS);
      script.async = true;
      script.src = src;
      document.head.appendChild(script);
    });
  }

  async function readGas(exec, caseId) {
    let http = null;
    try { http = await fetchGasHttp(exec, caseId); } catch (_) { http = null; }
    if (http && ((http.ok && http.json) || http.missing)) return http;
    try {
      const viaJsonp = classifyGas(await jsonpStatus(exec, caseId));
      if (viaJsonp && ((viaJsonp.ok && viaJsonp.json) || viaJsonp.missing)) return viaJsonp;
    } catch (_) {}
    return null;
  }

  async function fetchGasCase(caseId) {
    const exec = await gasExecUrl(false);
    if (!exec) return null;
    const first = await readGas(exec, caseId);
    if (first) return first;
    const refreshed = await gasExecUrl(true);
    if (!refreshed || refreshed === exec) return null;
    return readGas(refreshed, caseId);
  }

  // Case status: cache-busted Apps Script GET, then JSONP, then the Contents API.
  // Never raw / Pages / jsDelivr.
  // Those CDNs ignore ?t= and can keep serving the first partial snapshot for minutes.
  // Any other https base is fetched as-is so a custom statusBaseUrl still wins.
  async function fetchLiveJson(url) {
    const raw = String(url || "").trim();
    if (!raw) return emptyLive("");
    const gh = parseGithubStatus(raw);
    const caseId = gh ? caseIdFromStatusFile(gh.file) : "";
    if (caseId) {
      const gas = await fetchGasCase(caseId);
      if (gas && gas.ok && gas.json) return gas;
      const api = await fetchGithubApi(gh);
      if (api) return api;
      if (gas && gas.missing) return gas;
      return emptyLive("gas");
    }
    if (gh) {
      const api = await fetchGithubApi(gh);
      if (api) return api;
    }
    try {
      return await fetchDirectJson(raw);
    } catch (_) {
      return emptyLive("direct");
    }
  }

  return {
    KEYS, get: (k, d) => (k === "statusBaseUrl" ? statusBase() : get(k, d)),
    set, isDev, all, DEFAULT_STATUS_BASE, GITHUB_REPO,
    parseGithubStatus, fetchLiveJson,
  };
})();
