function clone(x) {
  return JSON.parse(JSON.stringify(x));
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
}
function nowISO() {
  return new Date().toISOString();
}
function fmtDate(x) {
  if (!x) return "—";
  const d = new Date(x);
  return Number.isNaN(d.getTime())
    ? "Некорректная дата"
    : d.toLocaleString("ru-RU");
}
function storageAvailable() {
  try {
    const k = "__jrtest";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
function safeURL(value) {
  try {
    const u = new URL(String(value));
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
export { clone, esc, nowISO, fmtDate, safeURL, storageAvailable };
