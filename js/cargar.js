/* Cascada año→marca→modelo→versión con combobox buscable (un solo campo). */
const AUTOS_BASE = "https://leocabrales.github.io/zharo-form/autos/";
const OTRO = "__otro__";
const CAT = {};
let cur = {};
const $ = (i) => document.getElementById(i);
const lab = { marca: "No está la marca", modelo: "No está el modelo", version: "No está mi versión" };
const PH = {
  marca: "Elegí o buscá marca",
  modelo: "Elegí o buscá modelo",
  version: "Elegí o buscá versión",
};
const WAIT = {
  marca: "Primero elegí el año",
  modelo: "Primero elegí la marca",
  version: "Primero elegí el modelo",
};
/* selected[k] = valor de catálogo o OTRO o "" */
const selected = { marca: "", modelo: "", version: "" };
const itemsCache = { marca: [], modelo: [], version: [] };

const L = {
  marca: () => Object.keys(cur),
  modelo: () => Object.keys(cur[$("marca").value] || {}),
  version: () => (cur[$("marca").value] || {})[$("modelo").value] || [],
};

function comboIn(k) { return $("c_" + k); }
function comboList(k) { return $("list_" + k); }

function filterItems(k, q) {
  const words = String(q || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  const base = itemsCache[k] || [];
  if (!words.length) return base.slice();
  return base.filter(it => words.every(w => it.toUpperCase().includes(w)));
}

function renderList(k, q) {
  const ul = comboList(k);
  ul.innerHTML = "";
  const filtered = filterItems(k, q);
  if (!filtered.length && !(itemsCache[k] || []).length) {
    const empty = document.createElement("li");
    empty.className = "combo-empty";
    empty.textContent = "Sin opciones";
    ul.appendChild(empty);
  } else {
    for (const it of filtered) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.dataset.value = it;
      li.textContent = it;
      if (selected[k] === it) li.classList.add("active");
      ul.appendChild(li);
    }
  }
  const other = document.createElement("li");
  other.setAttribute("role", "option");
  other.dataset.value = OTRO;
  other.className = "combo-other";
  other.textContent = "✏️ " + lab[k] + " (escribir)";
  if (selected[k] === OTRO) other.classList.add("active");
  ul.appendChild(other);
}

function openList(k) {
  if (comboIn(k).disabled) return;
  renderList(k, comboIn(k).value === displayLabel(k) ? "" : comboIn(k).value);
  comboList(k).classList.remove("hidden");
}

function closeList(k) {
  comboList(k).classList.add("hidden");
}

function closeAll(except) {
  for (const k of ["marca", "modelo", "version"]) {
    if (k !== except) closeList(k);
  }
}

function displayLabel(k) {
  if (selected[k] === OTRO) return "✏️ " + lab[k];
  return selected[k] || "";
}

function setOtroVisible(k, on) {
  $(k).style.display = on ? "block" : "none";
  if (on) {
    if (!$(k).value) $(k).focus();
  }
}

function pick(k, value) {
  selected[k] = value;
  if (value === OTRO) {
    comboIn(k).value = displayLabel(k);
    $(k).value = "";
    setOtroVisible(k, true);
  } else if (value) {
    comboIn(k).value = value;
    $(k).value = value;
    setOtroVisible(k, false);
  } else {
    comboIn(k).value = "";
    $(k).value = "";
    setOtroVisible(k, false);
  }
  closeList(k);
  onPicked(k);
}

function onPicked(k) {
  if (k === "marca") {
    reset("modelo", WAIT.modelo);
    reset("version", WAIT.version);
    if (selected.marca === OTRO) {
      enableManual("modelo");
      enableManual("version");
    } else if (selected.marca) {
      fill("modelo", L.modelo());
    }
  } else if (k === "modelo") {
    reset("version", WAIT.version);
    if (selected.modelo === OTRO) {
      enableManual("version");
    } else if (selected.modelo) {
      fill("version", L.version());
    }
  }
}

function enableManual(k) {
  itemsCache[k] = [];
  selected[k] = OTRO;
  const inp = comboIn(k);
  inp.disabled = false;
  inp.placeholder = PH[k];
  inp.value = displayLabel(k);
  $(k).value = "";
  setOtroVisible(k, true);
  closeList(k);
}

function fill(k, items) {
  itemsCache[k] = items.slice();
  selected[k] = "";
  const inp = comboIn(k);
  inp.disabled = false;
  inp.placeholder = PH[k];
  inp.value = "";
  $(k).value = "";
  setOtroVisible(k, false);
  closeList(k);
}

function reset(k, placeholder) {
  itemsCache[k] = [];
  selected[k] = "";
  const inp = comboIn(k);
  inp.disabled = true;
  inp.placeholder = placeholder || WAIT[k];
  inp.value = "";
  $(k).value = "";
  setOtroVisible(k, false);
  closeList(k);
}

async function loadYear() {
  reset("marca", "Cargando…");
  reset("modelo", WAIT.modelo);
  reset("version", WAIT.version);
  const a = $("anio").value;
  if (!a) { reset("marca", WAIT.marca); return; }
  try {
    CAT[a] = CAT[a] || await (await fetch(AUTOS_BASE + a + ".json?v=1")).json();
    cur = CAT[a];
  } catch (e) { cur = {}; }
  fill("marca", L.marca());
  if (!Object.keys(cur).length) pick("marca", OTRO);
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
    if (["marca", "modelo", "version"].includes(k)) {
      comboIn(k).classList.toggle("err", bad && selected[k] !== OTRO);
    }
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
    version_catalogo: selected.version !== OTRO && !!selected.version,
    neto: ($("max").checked || !n) ? "máximo" : Number(n),
  };
}

function wireCombo(k) {
  const inp = comboIn(k);
  const ul = comboList(k);

  inp.addEventListener("focus", () => {
    closeAll(k);
    if (!inp.disabled) openList(k);
  });

  inp.addEventListener("click", () => {
    if (!inp.disabled) openList(k);
  });

  inp.addEventListener("input", () => {
    if (inp.disabled) return;
    // Si estaba elegido algo del catálogo y el usuario escribe, limpiar selección
    if (selected[k] && selected[k] !== OTRO && inp.value !== selected[k]) {
      selected[k] = "";
      $(k).value = "";
      setOtroVisible(k, false);
    }
    if (selected[k] === OTRO && inp.value !== displayLabel(k)) {
      // usuario borró el label de "otro" → vuelve a buscar
      selected[k] = "";
      setOtroVisible(k, false);
    }
    openList(k);
    renderList(k, inp.value);
  });

  inp.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeList(k); inp.blur(); }
    if (e.key === "Enter") {
      e.preventDefault();
      const first = ul.querySelector('li[role="option"]');
      if (first) pick(k, first.dataset.value);
    }
  });

  ul.addEventListener("mousedown", (e) => {
    const li = e.target.closest('li[role="option"]');
    if (!li) return;
    e.preventDefault();
    pick(k, li.dataset.value);
  });
}

async function bootCargar() {
  const user = await ZharoAuth.requireAuth();
  if (!user) return;
  zharoPaintChrome("cargar");
  initYears();
  $("anio").onchange = loadYear;

  for (const k of ["marca", "modelo", "version"]) wireCombo(k);

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".combo")) closeAll();
  });

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
