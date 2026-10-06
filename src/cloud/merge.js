export const LOCAL_FIELDS = [
  "theme",
  "focus",
  "zoom",
  "phaseCollapsed",
  "lastSavedAt",
];
const copy = (x) =>
  x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (object(a) && object(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
    );
  }
  return false;
}
function merge(
  base,
  local,
  remote,
  choose = "local",
  path = "",
  conflicts = [],
) {
  if (equal(local, remote)) return copy(local);
  if (equal(base, local)) return copy(remote);
  if (equal(base, remote)) return copy(local);
  if (object(local) && object(remote) && (object(base) || base === undefined)) {
    const out = {};
    for (const key of new Set([
      ...Object.keys(base || {}),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      const value = merge(
        base?.[key],
        local[key],
        remote[key],
        choose,
        path ? path + "." + key : key,
        conflicts,
      );
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  conflicts.push(path);
  return copy(choose === "remote" ? remote : local);
}
function progress(value) {
  const out = copy(value);
  for (const field of LOCAL_FIELDS) delete out[field];
  return out;
}
export { copy, object, equal, merge, progress };
