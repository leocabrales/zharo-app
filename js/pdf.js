/* PDFs privados: los links "drive:<caso>/<canal>" se piden al Apps Script con el login del comercial.
   El PDF nunca está en una dirección pública. */
(() => {
  // Devuelve el PDF como archivo (para compartirlo). Cache por caso/canal mientras la página está abierta.
  const cache = new Map();
  function obtenerArchivo(ref, nombre) {
    const key = String(ref);
    if (!cache.has(key)) {
      const p = (async () => {
        const m = key.match(/^drive:([A-Za-z0-9_.-]+)\/([a-z]+)$/);
        if (!m) throw new Error("ref");
        let u = null;
        try { u = JSON.parse(localStorage.getItem(ZharoConfig.KEYS.user) || "null"); } catch (_) {}
        if (!u || !u.id_token) throw new Error("unauthorized");
        const exec = await ZharoConfig.gasExecUrl();
        const url = new URL(exec);
        url.searchParams.set("action", "pdf");
        url.searchParams.set("id", m[1]);
        url.searchParams.set("canal", m[2]);
        url.searchParams.set("id_token", u.id_token);
        url.searchParams.set("t", String(Date.now()));
        const r = await fetch(url.toString(), { cache: "no-store", mode: "cors", credentials: "omit", redirect: "follow" });
        const j = await r.json();
        if (!j || !j.ok || !j.b64) throw new Error(j && j.error || "sin PDF");
        const bin = atob(j.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      })();
      p.catch(() => cache.delete(key));      // si falla, se reintenta la próxima vez
      cache.set(key, p);
    }
    return cache.get(key).then((bytes) => new File([bytes], nombre || "Propuesta_ZHARO.pdf", { type: "application/pdf" }));
  }

  async function abrirPdf(ref, win) {
    const m = String(ref).match(/^drive:([A-Za-z0-9_.-]+)\/([a-z]+)$/);
    if (!m) return;
    let u = null;
    try { u = JSON.parse(localStorage.getItem(ZharoConfig.KEYS.user) || "null"); } catch (_) {}
    if (!u || !u.id_token) { if (win) win.close(); alert("Tu sesión venció. Volvé a entrar."); return; }
    try {
      const exec = await ZharoConfig.gasExecUrl();
      const url = new URL(exec);
      url.searchParams.set("action", "pdf");
      url.searchParams.set("id", m[1]);
      url.searchParams.set("canal", m[2]);
      url.searchParams.set("id_token", u.id_token);
      url.searchParams.set("t", String(Date.now()));
      const r = await fetch(url.toString(), { cache: "no-store", mode: "cors", credentials: "omit", redirect: "follow" });
      const j = await r.json();
      if (!j || !j.ok || !j.b64) throw new Error(j && j.error || "sin PDF");
      const bin = atob(j.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], j.name || "Propuesta_ZHARO.pdf", { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(file);
      if (win) win.location.href = blobUrl; else window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    } catch (e) {
      if (win) win.close();
      alert(/unauthorized/.test(String(e && e.message)) ? "Tu sesión venció. Volvé a entrar." : "No se pudo abrir el PDF.");
    }
  }
  document.addEventListener("click", (ev) => {
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href^="drive:"]') : null;
    if (!a) return;
    ev.preventDefault();
    const win = window.open("", "_blank");          // se abre ya (si no, el navegador lo bloquea)
    abrirPdf(a.getAttribute("href"), win);
  });
  window.ZharoPdf = { abrir: abrirPdf, archivo: obtenerArchivo };
})();
