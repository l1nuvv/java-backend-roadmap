import { clone } from "../lib/utils.js";
export const SCHEMA_VERSION = 3,
  STORAGE_KEY = "javaRoadmapV3",
  SNAPSHOT_KEY = "javaRoadmapV3Snapshots",
  AUTO_BACKUP_KEY = "javaRoadmapV3AutoBackup";
const defaultState = {
  schemaVersion: SCHEMA_VERSION,
  mode: "minimum",
  theme: "dark",
  focus: false,
  zoom: 100,
  phaseStatus: {},
  mastery: {},
  practice: {},
  evidence: {},
  phaseCollapsed: {},
  checkpoint: {},
  days: {},
  gates: {},
  skills: {},
  resources: {},
  blocker: "",
  next15: "",
  today: [],
  noai: [],
  mistakes: [],
  activity: [],
  career: [],
  careerMeta: { relevantFound: 0 },
  vacancies: [],
  market: { total: 0, kafka: 0, kotlin: 0, threshold: 30 },
  aqa: {},
  finalExam: false,
  lastSavedAt: null,
};
function migrate(x) {
  validateImport(x);
  const n = { ...clone(defaultState), ...clone(x), schemaVersion: 3 };
  for (const k of ["market", "careerMeta"])
    n[k] = { ...defaultState[k], ...(x[k] || {}) };
  if (Number(x.schemaVersion) !== 3 && x.checks) {
    Object.entries(x.checks).forEach(([k, v]) => {
      if (!v) return;
      if (k.includes(":t:")) n.mastery[k.replace(":t:", ":m:")] = 3;
      else if (k.includes(":p:")) n.practice[k] = true;
    });
    if (x.noAi) n.finalExam = true;
  }
  return n;
}
function validateImport(x) {
  const obj = (v) => v && typeof v === "object" && !Array.isArray(v),
    fail = (k) => {
      throw new Error("Некорректное поле: " + k);
    };
  if (!obj(x)) fail("root");
  const raw = JSON.stringify(x);
  if (raw.length > 2000000) fail("слишком большой файл");
  function checkKeys(v) {
    if (v && typeof v === "object") {
      for (const key of Object.keys(v)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          fail("опасный ключ");
        checkKeys(v[key]);
      }
    }
  }
  checkKeys(x);
  if (
    x.schemaVersion !== undefined &&
    ![2, 3].includes(Number(x.schemaVersion))
  )
    fail("schemaVersion");
  if (
    ![
      "schemaVersion",
      "mastery",
      "phaseStatus",
      "checks",
      "practice",
      "today",
      "checkpoint",
    ].some((k) => Object.hasOwn(x, k))
  )
    fail("не progress state");
  for (const k of [
    "phaseStatus",
    "mastery",
    "practice",
    "evidence",
    "phaseCollapsed",
    "checkpoint",
    "days",
    "gates",
    "skills",
    "resources",
    "market",
    "aqa",
    "careerMeta",
    "checks",
  ])
    if (x[k] !== undefined && !obj(x[k])) fail(k);
  for (const k of [
    "today",
    "noai",
    "mistakes",
    "activity",
    "career",
    "vacancies",
  ])
    if (
      x[k] !== undefined &&
      (!Array.isArray(x[k]) || x[k].some((v) => !obj(v)))
    )
      fail(k);
  for (const k of ["mastery", "skills", "aqa"])
    for (const v of Object.values(x[k] || {}))
      if (!Number.isInteger(v) || v < 0 || v > 4) fail(k);
  for (const k of [
    "practice",
    "phaseCollapsed",
    "days",
    "gates",
    "resources",
    "checks",
  ])
    for (const v of Object.values(x[k] || {}))
      if (typeof v !== "boolean") fail(k);
  for (const v of Object.values(x.phaseStatus || {}))
    if (!["not", "doing", "done", "available", "failed", "locked"].includes(v))
      fail("phaseStatus");
  for (const v of Object.values(x.evidence || {}))
    if (typeof v !== "string") fail("evidence");
  for (const c of Object.values(x.checkpoint || {})) {
    if (!obj(c)) fail("checkpoint");
    if (c.passed !== undefined && typeof c.passed !== "boolean")
      fail("checkpoint.passed");
    if (
      c.tasks !== undefined &&
      (!Array.isArray(c.tasks) || c.tasks.some((v) => typeof v !== "boolean"))
    )
      fail("checkpoint.tasks");
    if (c.notes !== undefined && typeof c.notes !== "string")
      fail("checkpoint.notes");
  }
  for (const k of ["blocker", "next15"])
    if (x[k] !== undefined && typeof x[k] !== "string") fail(k);
  for (const k of ["focus", "finalExam"])
    if (x[k] !== undefined && typeof x[k] !== "boolean") fail(k);
  if (x.mode !== undefined && !["minimum", "accelerated"].includes(x.mode))
    fail("mode");
  if (x.theme !== undefined && !["dark", "light"].includes(x.theme))
    fail("theme");
  if (
    x.zoom !== undefined &&
    (!Number.isFinite(x.zoom) || x.zoom < 50 || x.zoom > 200)
  )
    fail("zoom");
  for (const k of ["market", "careerMeta"])
    for (const [key, v] of Object.entries(x[k] || {}))
      if (
        ["total", "kafka", "kotlin", "threshold", "relevantFound"].includes(
          key,
        ) &&
        (!Number.isFinite(v) || v < 0)
      )
        fail(k + "." + key);
  for (const list of [
    "today",
    "noai",
    "mistakes",
    "activity",
    "career",
    "vacancies",
  ])
    for (const row of x[list] || []) {
      for (const key of [
        "text",
        "topic",
        "notes",
        "date",
        "ts",
        "company",
        "role",
        "stage",
        "reason",
        "url",
        "cause",
        "fix",
        "verify",
        "title",
        "outcome",
      ])
        if (row[key] !== undefined && typeof row[key] !== "string")
          fail(list + "." + key);
      if (
        row.minutes !== undefined &&
        (!Number.isFinite(row.minutes) || row.minutes <= 0)
      )
        fail("noai.minutes");
      if (row.done !== undefined && typeof row.done !== "boolean")
        fail("today.done");
      if (
        row.coverage !== undefined &&
        (!Number.isFinite(row.coverage) ||
          row.coverage < 0 ||
          row.coverage > 100)
      )
        fail("vacancy.coverage");
      if (
        row.rows !== undefined &&
        (!Array.isArray(row.rows) ||
          row.rows.some(
            (r) =>
              !obj(r) ||
              typeof r.text !== "string" ||
              typeof r.core !== "boolean" ||
              !["yes", "partial", "no", "unknown", "optional"].includes(
                r.status,
              ),
          ))
      )
        fail("vacancy.rows");
    }
  return true;
}
export { defaultState, migrate, validateImport };
