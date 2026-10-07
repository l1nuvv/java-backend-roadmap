import test from "node:test";
import assert from "node:assert/strict";
import { phases, topicKinds } from "../src/data/roadmap.js";
import { createProgressModel } from "../src/domain/progress.js";
import { defaultState, migrate } from "../src/state/schema.js";

function complete(state, id) {
  const p = phases.find(p => p.id === id);
  p.topics.forEach((_, i) => state.mastery[`${id}:m:${i}`] = 3);
  p.practice.forEach((_, i) => state.practice[`${id}:p:${i}`] = true);
  state.checkpoint[id] = { passed: true, tasks: p.test.map(() => true) };
  state.evidence[id] = "commit, command and checked result";
}

test("curriculum has 13 stable phases, valid tracking and acyclic dependencies", () => {
  assert.deepEqual(phases.map(p => p.id), Array.from({ length: 13 }, (_, i) => `p${i}`));
  function visit(id, path = new Set()) {
    assert.ok(!path.has(id), "dependency cycle: " + id);
    const p = phases.find(p => p.id === id);
    assert.ok(p, "missing dependency: " + id);
    p.deps.forEach(dep => visit(dep, new Set([...path, id])));
  }
  for (const p of phases) {
    assert.equal(topicKinds[p.id].length, p.topics.length);
    assert.ok(topicKinds[p.id].every(kind => ["setup", "concept", "action"].includes(kind)));
    assert.ok(p.practice.length && p.test.length);
    visit(p.id);
  }
});

test("next action progresses from setup to practice to checkpoint and the next unlocked phase", () => {
  const state = structuredClone(defaultState), model = createProgressModel(() => state);
  assert.equal(model.findNext().id, "p0");
  phases[0].topics.forEach((_, i) => state.mastery[`p0:m:${i}`] = 3);
  assert.ok(model.findNext().desc.includes(phases[0].practice[0]));
  phases[0].practice.forEach((_, i) => state.practice[`p0:p:${i}`] = true);
  assert.ok(model.findNext().desc.includes(phases[0].test[0]));
  complete(state, "p0");
  assert.equal(model.findNext().id, "p1");
  state.phaseStatus.p5 = "doing";
  assert.equal(model.findNext().id, "p5", "an active unlocked branch takes priority");
});

test("invalidating a prerequisite relocks dependents without deleting their evidence or pass", () => {
  const state = structuredClone(defaultState), model = createProgressModel(() => state);
  complete(state, "p0"); complete(state, "p1");
  assert.equal(model.checkpointValid("p1"), true);
  state.evidence.p0 = " ";
  assert.equal(model.phaseStatusEffective(phases[1]), "locked");
  assert.equal(state.checkpoint.p1.passed, true);
  assert.ok(state.evidence.p1);
  assert.equal(model.findNext().id, "p0");
});

test("a checkpoint requires every task, mastery, practice and evidence", () => {
  const state = structuredClone(defaultState), model = createProgressModel(() => state);
  complete(state, "p0");
  for (const mutate of [s => s.mastery["p0:m:0"] = 2, s => s.practice["p0:p:0"] = false,
    s => s.checkpoint.p0.tasks[0] = false, s => s.evidence.p0 = ""]) {
    complete(state, "p0"); mutate(state);
    assert.equal(model.checkpointValid("p0"), false);
  }
  phases.forEach(p => complete(state, p.id));
  assert.equal(model.overallProgress(), 100);
  assert.equal(model.sumObj(model.remainingByCategory()), 0);
});

test("schema 2 migrates idempotently and keeps historical and missing optional data", () => {
  const old = { schemaVersion: 2, checks: { "p0:t:0": true, "p0:p:0": true }, noAi: true, historical: { note: "keep" } };
  const current = migrate(old);
  assert.equal(current.schemaVersion, 3);
  assert.equal(current.mastery["p0:m:0"], 3);
  assert.equal(current.practice["p0:p:0"], true);
  assert.equal(current.finalExam, true);
  assert.deepEqual(current.market, defaultState.market);
  assert.deepEqual(current.historical, old.historical);
  assert.deepEqual(migrate(current), current);
});
