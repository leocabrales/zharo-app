/* Casos locales (localStorage) hasta que haya backend de resultados. */
const ZharoCasos = (() => {
  const KEY = "zharo_casos_v1";

  function list() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  }
  function save(arr) {
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, 100)));
  }
  function add(caso) {
    const arr = list();
    arr.unshift({
      id: "c_" + Date.now().toString(36),
      createdAt: new Date().toISOString(),
      status: "enviado",
      ...caso,
    });
    save(arr);
    return arr[0];
  }
  function mine(email) {
    const e = String(email || "").toLowerCase();
    return list().filter(c => !e || String(c.email || "").toLowerCase() === e);
  }
  return { list, add, mine };
})();
