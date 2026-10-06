import test from "node:test";
import assert from "node:assert/strict";
import { merge } from "../src/cloud/merge.js";
import { validateImport, migrate, defaultState } from "../src/state/schema.js";
import { createProgressModel } from "../src/domain/progress.js";
test("merge preserves independent changes and deletions", () => {
  const base = { mastery: { a: 0, b: 0 }, practice: { x: true, y: true } };
  const local = { mastery: { a: 3, b: 0 }, practice: { y: true } };
  const remote = { mastery: { a: 0, b: 4 }, practice: { x: true, y: false } };
  assert.deepEqual(merge(base, local, remote), {
    mastery: { a: 3, b: 4 },
    practice: { y: false },
  });
});
test("conflicts require an explicit choice and preserve unrelated changes", () => {
  const conflicts = [];
  assert.deepEqual(
    merge(
      { a: 0, b: 0 },
      { a: 3, b: 4 },
      { a: 2, b: 0 },
      "remote",
      "",
      conflicts,
    ),
    { a: 2, b: 4 },
  );
  assert.deepEqual(conflicts, ["a"]);
});
test("arrays conflict as a unit instead of silently losing rows", () => {
  const conflicts = [];
  merge(
    { today: [] },
    { today: [{ text: "A" }] },
    { today: [{ text: "B" }] },
    "local",
    "",
    conflicts,
  );
  assert.deepEqual(conflicts, ["today"]);
});
test("import rejects prototype keys and invalid nested progress", () => {
  assert.throws(() =>
    validateImport(JSON.parse('{"mastery":{"__proto__":3}}')),
  );
  assert.throws(() => validateImport({ ...defaultState, mastery: { x: 9 } }));
  assert.throws(() =>
    validateImport({ ...defaultState, checkpoint: { p0: { tasks: ["yes"] } } }),
  );
});
test("schema migration preserves historical data and checkpoint dependencies", () => {
  const state = migrate({
    ...defaultState,
    mastery: { "p0:m:0": 3 },
    extraHistoricalField: { value: 1 },
  });
  assert.equal(state.mastery["p0:m:0"], 3);
  assert.equal(state.extraHistoricalField.value, 1);
  const model = createProgressModel(() => state);
  assert.equal(model.checkpointValid("p1"), false);
  assert.equal(
    model.phaseStatusEffective({ id: "p1", deps: ["p0"] }),
    "locked",
  );
});
test("next action starts with a missing setup item", () => {
  const model = createProgressModel(() => structuredClone(defaultState));
  assert.match(model.findNext().desc, /JDK/);
});
