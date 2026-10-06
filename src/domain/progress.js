import {
  phases,
  setupTopics,
  topicKinds,
  skillKinds,
  aqaKinds,
  masteryLabels,
  actionLabels,
} from "../data/roadmap.js";
export function createProgressModel(getState) {
  function topicKind(p, i) {
    const kind = topicKinds[p.id]?.[i];
    if (!kind) throw new Error("Не задан тип tracking: " + p.id + ":" + i);
    return kind;
  }
  function labelsForKey(key) {
    let kind;
    const phase = /^(p\d+):m:(\d+)$/.exec(key),
      skill = /^skill:(.+):(\d+)$/.exec(key),
      aqa = /^aqa:(\d+)$/.exec(key);
    if (phase) kind = topicKinds[phase[1]]?.[Number(phase[2])];
    else if (skill) kind = skillKinds[skill[1]]?.[Number(skill[2])];
    else if (aqa) kind = aqaKinds[Number(aqa[1])];
    if (!["concept", "action"].includes(kind))
      throw new Error("Нет шкалы для " + key);
    return kind === "action" ? actionLabels : masteryLabels;
  }
  function topicReady(p, i) {
    const state = getState();
    return Number(state.mastery[`${p.id}:m:${i}`] || 0) >= 3;
  }
  function phaseKnowledge(p) {
    const state = getState();
    return (
      p.topics.reduce(
        (a, _, i) =>
          a + (Number(state.mastery[`${p.id}:m:${i}`] || 0) >= 3 ? 1 : 0),
        0,
      ) / p.topics.length
    );
  }
  function phasePractice(p) {
    const state = getState();
    return (
      p.practice.reduce(
        (a, _, i) => a + (state.practice[`${p.id}:p:${i}`] ? 1 : 0),
        0,
      ) / p.practice.length
    );
  }
  function checkpointValid(id, seen = new Set()) {
    const state = getState();
    if (seen.has(id)) return false;
    const p = phases.find((p) => p.id === id),
      c = state.checkpoint[id];
    if (
      !p ||
      !c?.passed ||
      phaseKnowledge(p) < 1 ||
      phasePractice(p) < 1 ||
      !state.evidence[id]?.trim() ||
      !Array.isArray(c.tasks) ||
      p.test.some((_, i) => c.tasks[i] !== true)
    )
      return false;
    const next = new Set(seen);
    next.add(id);
    return p.deps.every((dep) => checkpointValid(dep, next));
  }
  function prereqsMet(p) {
    return p.deps.every((id) => checkpointValid(id));
  }
  function phaseStatusEffective(p) {
    const state = getState();
    if (!prereqsMet(p)) return "locked";
    if (checkpointValid(p.id)) return "done";
    if (state.checkpoint[p.id]?.passed) return "doing";
    if (state.checkpoint[p.id]?.passed === false) return "failed";
    return state.phaseStatus[p.id] === "doing" ||
      state.phaseStatus[p.id] === "done"
      ? "doing"
      : "available";
  }
  function hoursForPhase(p) {
    return Object.values(p.hours).reduce((a, b) => a + b, 0);
  }
  function phaseRemainingFactor(p) {
    const state = getState();
    if (checkpointValid(p.id)) return 0;
    return Math.max(
      0.15,
      1 -
        (phaseKnowledge(p) * 0.45 +
          phasePractice(p) * 0.4 +
          (state.phaseStatus[p.id] === "doing" ? 0.1 : 0)),
    );
  }
  function remainingByCategory(maxPhase = 12) {
    const r = { theory: 0, practice: 0, project: 0, dsa: 0, interview: 0 };
    phases.slice(0, maxPhase + 1).forEach((p) => {
      const f = phaseRemainingFactor(p);
      Object.keys(r).forEach((k) => (r[k] += p.hours[k] * f));
    });
    Object.keys(r).forEach((k) => (r[k] = Math.round(r[k])));
    return r;
  }
  function sumObj(o) {
    return Object.values(o).reduce((a, b) => a + b, 0);
  }
  function findNext() {
    const state = getState();
    const order = [
      "p0",
      "p1",
      "p2",
      "p7",
      "p5",
      "p8",
      "p3",
      "p6",
      "p9",
      "p10",
      "p11",
      "p4",
      "p12",
    ];
    const available = order
      .map((id) => phases.find((p) => p.id === id))
      .filter((p) => !checkpointValid(p.id) && prereqsMet(p));
    const p =
      available.find((p) => state.phaseStatus[p.id] === "doing") ||
      available[0];
    if (!p)
      return {
        title: "Основной roadmap закрыт",
        desc: "Начни no-AI экзамен: за 15 минут найди endpoint, migration и тест для priority.",
        id: "p12",
      };
    const setupIndex = p.topics.findIndex(
      (_, i) => topicKind(p, i) === "setup" && !topicReady(p, i),
    );
    if (setupIndex >= 0) {
      const item = setupTopics[setupIndex];
      return {
        title: `${p.num} — настройка`,
        desc: `Следующие 15 минут: ${item.title}. Проверка: ${item.check} Отметь настройку только после успешного запуска.`,
        id: p.id,
      };
    }
    const i = p.practice.findIndex((_, i) => !state.practice[`${p.id}:p:${i}`]);
    if (i >= 0)
      return {
        title: `${p.num} — ${p.title}`,
        desc: `Следующие 15 минут: ${p.practice[i]}. Выдели один небольшой сценарий, напиши первый failing test/проверку, запусти и прочитай ошибку. Если база незнакома — 5 минут источника, затем своя попытка.`,
        id: p.id,
      };
    const weakIndex = p.topics.findIndex((_, i) => !topicReady(p, i)),
      weak = p.topics[weakIndex];
    if (weak && topicKind(p, weakIndex) === "action")
      return {
        title: `${p.num} — рабочее действие`,
        desc: `15 минут без подсказки: ${weak}. Выполни один минимальный сценарий, запиши команду и результат; обнови уровень самостоятельности после своей попытки.`,
        id: p.id,
      };
    if (weak)
      return {
        title: `${p.num} — ${p.title}`,
        desc: `10 минут без AI: ${weak}. Напиши минимальный пример и предскажи результат; запусти, объясни расхождение. Затем обнови уровень освоения.`,
        id: p.id,
      };
    const task = p.test.find((_, i) => !state.checkpoint[p.id]?.tasks?.[i]);
    return {
      title: `${p.num} — checkpoint`,
      desc: task
        ? `Начни с проверки: ${task} Сохрани команду, результат и commit в evidence.`
        : "Все задания отмечены: приложи evidence и зафиксируй checkpoint.",
      id: p.id,
    };
  }
  function milestoneCount() {
    const state = getState();
    return [30, 45, 60, 90].filter((m) =>
      state.noai.some((s) => Number(s.minutes) >= m && s.outcome === "done"),
    ).length;
  }
  function overallProgress() {
    return Math.round(
      (phases.filter((p) => checkpointValid(p.id)).length / phases.length) *
        100,
    );
  }
  function gateHours(ids) {
    const required = new Set(ids);
    function add(id) {
      phases
        .find((p) => p.id === id)
        .deps.forEach((dep) => {
          if (!required.has(dep)) {
            required.add(dep);
            add(dep);
          }
        });
    }
    ids.forEach(add);
    return Math.round(
      phases
        .filter((p) => required.has(p.id))
        .reduce(
          (sum, p) => sum + hoursForPhase(p) * phaseRemainingFactor(p),
          0,
        ),
    );
  }
  return {
    topicKind,
    labelsForKey,
    topicReady,
    phaseKnowledge,
    phasePractice,
    checkpointValid,
    prereqsMet,
    phaseStatusEffective,
    hoursForPhase,
    phaseRemainingFactor,
    remainingByCategory,
    sumObj,
    findNext,
    milestoneCount,
    overallProgress,
    gateHours,
  };
}
