/* Cascada año→marca→modelo→versión reutilizando autos de zharo-form. */
const AUTOS_BASE = "https://leocabrales.github.io/zharo-form/autos/";
const OTRO = "__otro__";
const CAT = {};
let cur = {};
const $ = (i) => document.getElementById(i);
const lab = { marca: "No está la marca", modelo: "No está el modelo", version: "No está mi versión" };
const PH = { marca: "Elegí la marca", modelo: "Elegí el modelo", version: "Elegí la versión" };
const L = {
  marca: () => Object.keys(cur),
  modelo: () => Object.keys(cur[$("marca").value] || {}),
  version: () => (cur[$("marca").value] || {})[$("modelo").value] || [],
};

function fill(k, items, ph) {
  const sel = $("s_" + k), f = $("f_" + k).value.trim().toUpperCase().split(/\s+/).filter(Boolean), prev = sel.value;
  sel.innerHTML = "";
  sel.add(new Option(ph, ""));
  for (const it of items) if (f.every(w => it.toUpperCase().includes(w))) sel.add(new Option(it, it));
  sel.add(new Option("✏️ " + lab[k] + " (escribir)", OTRO));
  sel.disabled = false;
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}
function reset(k, ph) {
  const sel = $("s_" + k);
  sel.innerHTML = "";
  sel.add(new Option(ph, ""));
  sel.disabled = true;
  $("f_" + k).value = "";
  $(k).value = "";
  $(k).style.display = "none";
}
function otro(k) {
  const o = $("s_" + k).value === OTRO;
  $(k).style.display = o ? "block" : "none";
  if (!o) $(k).value = $("s_" + k).value;
  else { $(k).value = ""; $(k).focus(); }
}

async function loadYear() {
  reset("marca", "Cargando...");
  reset("modelo", "Primero elegí la marca");
  reset("version", "Primero elegí el modelo");
  const a = $("anio").value;
  if (!a) { reset("marca", "Primero elegí el año"); return; }
  try {
    CAT[a] = CAT[a] || await (await fetch(AUTOS_BASE + a + ".json?v=1")).json();
    cur = CAT[a];
  } catch (e) { cur = {}; }
  fill("marca", L.marca(), PH.marca);
  if (!Object.keys(cur).length) { $("s_marca").value = OTRO; otro("marca"); }
}

function initYears() {
  const y = new Date().getFullYear(), s = $("anio");
  s.add(new Option("0km", "0km"));
  for (let a = y; a >= 2011; a--) s.add(new Option(a, a));
}

function validate() {
  let ok = true;
  const req = [
    ["agencia", "Completá la agencia"],
    ["nombre", "Completá nombre y apellido"],
    ["marca", "Completá la marca"],
    ["modelo", "Completá el modelo"],
    ["version", "Elegí o escribí la versión"],
    ["anio", "Elegí el año"],
  ];
  for (const [k, t] of req) {
    const bad = !$(k).value.trim();
    $(k).classList.toggle("err", bad);
    $("m_" + k).textContent = bad ? t : "";
    if (bad) ok = false;
  }
  const d = $("dni").value, bd = !/^\d{7,8}$/.test(d);
  $("dni").classList.toggle("err", bd);
  $("m_dni").textContent = bd ? "El DNI tiene que tener 7 u 8 números" : "";
  if (bd) ok = false;
  const n = $("neto").value.replace(/\D/g, ""), bn = !n && !$("max").checked;
  $("m_neto").textContent = bn ? "Poné un monto o marcá Máximo" : "";
  if (bn) ok = false;
  const pz = !$("plazo").value;
  $("m_plazo").textContent = pz ? "Elegí un plazo" : "";
  if (pz) ok = false;
  return ok;
}

function readForm() {
  const n = $("neto").value.replace(/\D/g, "");
  return {
    plazo: $("plazo").value,
    agencia: $("agencia").value.trim(),
    dni: $("dni").value,
    nombre: $("nombre").value.trim(),
    marca: $("marca").value.trim(),
    modelo: $("modelo").value.trim(),
    version: $("version").value.trim(),
    anio: $("anio").value,
    version_catalogo: $("s_version").value !== OTRO && !!$("s_version").value,
    neto: ($("max").checked || !n) ? "máximo" : Number(n),
  };
}

async function bootCargar() {
  const user = ZharoAuth.requireAuth();
  if (!user) return;
  zharoPaintChrome("cargar");
  initYears();
  $("anio").onchange = loadYear;
  for (const k of ["marca", "modelo", "version"]) {
    $("f_" + k).oninput = () => { if (!$("s_" + k).disabled) fill(k, L[k](), PH[k]); };
  }
  $("s_marca").onchange = () => {
    otro("marca");
    reset("modelo", "Elegí el modelo");
    reset("version", "Primero elegí el modelo");
    if ($("s_marca").value === OTRO) {
      $("s_modelo").innerHTML = ""; $("s_modelo").add(new Option("✏️ Escribir", OTRO)); $("s_modelo").value = OTRO; otro("modelo");
      $("s_version").innerHTML = ""; $("s_version").add(new Option("✏️ Escribir", OTRO)); $("s_version").value = OTRO; otro("version");
    } else if ($("marca").value) fill("modelo", L.modelo(), PH.modelo);
  };
  $("s_modelo").onchange = () => {
    otro("modelo");
    reset("version", "Elegí la versión");
    if ($("s_modelo").value === OTRO) {
      $("s_version").innerHTML = ""; $("s_version").add(new Option("✏️ Escribir", OTRO)); $("s_version").value = OTRO; otro("version");
    } else if ($("modelo").value) fill("version", L.version(), PH.version);
  };
  $("s_version").onchange = () => otro("version");
  $("dni").oninput = e => e.target.value = e.target.value.replace(/\D/g, "").slice(0, 8);
  $("neto").oninput = e => {
    const d = e.target.value.replace(/\D/g, "");
    e.target.value = d ? Number(d).toLocaleString("es-AR") : "";
    $("max").checked = !d;
  };
  $("max").onchange = e => { if (e.target.checked) $("neto").value = ""; };

  const out = $("resultBox");
  async function doSend(copyOnly) {
    if (!validate()) { zharoToast("Revisá los campos"); return; }
    const data = readForm();
    const btn = $("send");
    btn.disabled = true;
    try {
      if (copyOnly) {
        const text = zharoBuildText(data);
        await navigator.clipboard.writeText(text);
        out.classList.remove("hidden");
        out.innerHTML = `<div class="banner ok">Payload copiado</div><pre class="payload">${text.replace(/</g, "&lt;")}</pre>`;
        zharoToast("Copiado");
        return;
      }
      const res = await zharoSubmitCase(data, user);
      out.classList.remove("hidden");
      let msg = "";
      if (res.remote.skipped) {
        msg = `<div class="banner">Guardado en Mis casos. Falta configurar el webhook en Configuración para mandarlo al bot.</div>`;
      } else if (res.remote.ok) {
        msg = `<div class="banner ok">Enviado al bot (HTTP ${res.remote.status}). El resultado te llega por Telegram si configuraste el chat_id, o lo ves después en Mis casos.</div>`;
      } else {
        msg = `<div class="banner">No llegó al webhook (${res.remote.status || res.remote.error || "error"}). El caso quedó guardado local y podés copiar el payload.</div>`;
      }
      out.innerHTML = msg + `<pre class="payload">${res.text.replace(/</g, "&lt;")}</pre>
        <div class="actions">
          <button class="btn" type="button" id="copyAgain">Copiar payload</button>
          <a class="btn primary" href="casos.html">Ver mis casos</a>
        </div>`;
      $("copyAgain").onclick = async () => {
        await navigator.clipboard.writeText(res.text);
        zharoToast("Copiado");
      };
      zharoToast(res.remote.ok ? "Enviado" : "Guardado");
    } finally {
      btn.disabled = false;
    }
  }
  $("send").onclick = () => doSend(false);
  $("copy").onclick = () => doSend(true);
}

document.addEventListener("DOMContentLoaded", bootCargar);
