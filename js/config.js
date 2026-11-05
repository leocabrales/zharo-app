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
  return {
    KEYS, get: (k, d) => (k === "statusBaseUrl" ? statusBase() : get(k, d)),
    set, isDev, all, DEFAULT_STATUS_BASE, GITHUB_REPO,
  };
})();
