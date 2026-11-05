/* Config local (sin secretos en el repo). Todo vive en localStorage. */
const ZharoConfig = (() => {
  const KEYS = {
    webhookUrl: "zharo_webhook_url",
    webhookKey: "zharo_webhook_key",
    googleClientId: "zharo_google_client_id",
    replyChatId: "zharo_reply_chat_id",
    statusBaseUrl: "zharo_status_base_url",
    devMode: "zharo_dev",
    user: "zharo_user",
  };

  function get(k, def = "") {
    try { return localStorage.getItem(KEYS[k] || k) ?? def; } catch { return def; }
  }
  function set(k, v) {
    try {
      if (v === null || v === undefined || v === "") localStorage.removeItem(KEYS[k] || k);
      else localStorage.setItem(KEYS[k] || k, String(v));
    } catch {}
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
      googleClientId: get("googleClientId"),
      replyChatId: get("replyChatId"),
      statusBaseUrl: get("statusBaseUrl"),
      devMode: isDev(),
    };
  }
  return { KEYS, get, set, isDev, all };
})();
