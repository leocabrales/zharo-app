/* Aviso al terminar una cotización (notificación, sonido, vibración, título). */
const ZharoAviso = (() => {
  const askedKey = "zharo_notify_asked";
  const seen = new Set();
  let audioCtx = null;

  function canNotify() {
    return typeof Notification !== "undefined";
  }

  async function ask() {
    if (!canNotify()) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    try {
      const p = await Notification.requestPermission();
      try { localStorage.setItem(askedKey, p); } catch (_) {}
      return p;
    } catch { return "error"; }
  }

  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.05;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      setTimeout(() => { try { o.stop(); } catch (_) {} }, 220);
    } catch (_) {}
  }

  function vibrate() {
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (_) {}
  }

  function done(caso) {
    const id = caso && caso.id;
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    const nombre = (caso && (caso.nombre || caso.cliente)) || "la consulta";
    const title = "Listo · ZHARO";
    try { document.title = title; } catch (_) {}
    beep();
    vibrate();
    if (canNotify() && Notification.permission === "granted") {
      try {
        const n = new Notification("ZHARO · Cotización lista", {
          body: "Ya están las ofertas de " + nombre + ".",
          icon: "assets/apple-touch-icon.png",
          tag: id ? "zharo-" + id : "zharo-done",
        });
        n.onclick = () => { try { window.focus(); n.close(); } catch (_) {} };
      } catch (_) {}
    }
  }

  return { ask, done };
})();
