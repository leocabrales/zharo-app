/* Armar y aplicar una precarga de Cargar (recotizar / otro monto). */
const ZharoPrefill = (() => {
  const KEY = "zharo_prefill_v1";

  function yearFromVehicle(v) {
    const m = String(v || "").match(/\b((?:19|20)\d{2}|0km)\b/i);
    return m ? m[1] : "";
  }

  function fromCaso(caso, mode) {
    const c = caso || {};
    const raw = c._raw && typeof c._raw === "object" ? c._raw : c;
    const vehiculo = c.vehiculo || raw.vehiculo || raw.auto || "";
    const netoSrc = c.neto_pedido ?? raw.neto_pedido ?? raw.neto;
    const max = netoSrc === "máximo" || (typeof netoSrc === "string" && /m[aá]ximo/i.test(netoSrc));
    const recotizar = mode !== "otro_monto";
    let marca = raw.marca || c.marca || "";
    let modelo = raw.modelo || c.modelo || "";
    const version = raw.version || c.version || "";
    if (!marca && vehiculo) {
      const cleaned = String(vehiculo).replace(/\b((?:19|20)\d{2}|0\s*km)\b/ig, " ").replace(/\s+/g, " ").trim();
      const parts = cleaned.split(" ").filter(Boolean);
      if (parts.length) {
        marca = parts[0];
        modelo = parts.slice(1).join(" ");
      }
    }
    return {
      mode: recotizar ? "recotizar" : "otro_monto",
      agencia: c.agencia || raw.agencia || "",
      dni: String(c.dni || raw.dni || "").replace(/\D/g, "").slice(0, 8),
      nombre: c.nombre || raw.nombre || "",
      anio: String(raw.anio || c.anio || yearFromVehicle(vehiculo) || ""),
      marca,
      modelo,
      version,
      vehiculo,
      plazo: String(c.plazos || c.plazo || raw.plazo || raw.plazos || ""),
      neto: recotizar && !max && netoSrc != null && netoSrc !== "" ? Number(netoSrc) || netoSrc : "",
      max: recotizar && (max || netoSrc == null || netoSrc === ""),
    };
  }

  function save(payload) {
    try { sessionStorage.setItem(KEY, JSON.stringify(payload || {})); } catch (_) {}
  }

  function consume() {
    try {
      const raw = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function peek() {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function cargarUrl(caso, mode) {
    save(fromCaso(caso, mode));
    return "cargar.html";
  }

  return { KEY, fromCaso, save, consume, peek, cargarUrl, yearFromVehicle };
})();
