import {
  masteryLabels,
  actionLabels,
  setupTopics,
  topicKinds,
  skillKinds,
  aqaKinds,
  phases,
  days,
  resources,
  skillGroups,
  drillBank,
  aqaItems,
} from "./data/roadmap.js";
import {
  clone,
  esc,
  nowISO,
  fmtDate,
  safeURL,
  storageAvailable,
} from "./lib/utils.js";
import {
  SCHEMA_VERSION,
  STORAGE_KEY,
  SNAPSHOT_KEY,
  AUTO_BACKUP_KEY,
  defaultState,
  migrate,
  validateImport,
} from "./state/schema.js";
import { createProgressModel } from "./domain/progress.js";
export function createApplication() {
  function renderTopics(p) {
    const groups = [
      ["setup", "Настройка окружения"],
      ["concept", "Понимание и применение"],
      ["action", "Рабочие действия"],
    ];
    return groups
      .map(([kind, title]) => {
        const entries = p.topics
          .map((text, i) => ({ text, i }))
          .filter(({ i }) => topicKind(p, i) === kind);
        if (!entries.length) return "";
        return (
          `<div class="label-sm">${title}</div>` +
          entries
            .map(({ text, i }) => {
              const key = `${p.id}:m:${i}`,
                value = Number(state.mastery[key] || 0);
              if (kind === "setup") {
                const item = setupTopics[i];
                return `<div class="setup-item"><label class="practice-row"><input type="checkbox" data-setup="${key}" ${value >= 3 ? "checked" : ""}><span>${esc(item.title)}</span></label><p class="muted">Проверка: ${esc(item.check)}</p>${value > 0 && value < 3 ? '<p class="muted">Прежняя частичная отметка сохранена. Подтверди настройку после проверки.</p>' : ""}</div>`;
              }
              return `<div class="mastery-row"><span>${esc(text)}</span>${masterySelect(key, value, kind === "action" ? actionLabels : masteryLabels)}</div>`;
            })
            .join("")
        );
      })
      .join("");
  }
  let storageError = "",
    loadBlocked = false,
    lastBackupAt = 0,
    persistTimer = null;
  const model = createProgressModel(() => state);
  const {
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
  } = model;
  let state = loadState(),
    currentCheckpointPhase = null,
    vacancyWorking = [],
    timerSeconds = 1800,
    timerHandle = null;
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? migrate(JSON.parse(raw)) : clone(defaultState);
    } catch (e) {
      loadBlocked = true;
      storageError =
        "Данные не загружены. Исходная запись сохранена: скачай её и восстанови JSON/backup.";
      return clone(defaultState);
    }
  }
  function persistLight() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => writeState(), 250);
  }
  function writeState(candidate = state, replace = false) {
    if (loadBlocked && !replace) {
      showStorage();
      return false;
    }
    const next = { ...candidate, schemaVersion: 3, lastSavedAt: nowISO() };
    try {
      validateImport(next);
      const previous = localStorage.getItem(STORAGE_KEY);
      if (
        previous &&
        (replace || candidate !== state || Date.now() - lastBackupAt > 10000)
      ) {
        let backup;
        try {
          const parsed = JSON.parse(previous);
          validateImport(parsed);
          backup = { ts: nowISO(), state: parsed };
        } catch {
          backup = { ts: nowISO(), raw: previous };
        }
        localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(backup));
        lastBackupAt = Date.now();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      state = next;
      storageError = "";
      loadBlocked = false;
      showStorage();
      window.dispatchEvent(new Event("roadmap:saved"));
      return true;
    } catch (e) {
      storageError =
        "Не сохранено: " + e.message + ". Экспортируй JSON перед закрытием.";
      showStorage();
      return false;
    }
  }
  function showStorage() {
    const el = document.getElementById("saveState");
    if (!el) return;
    el.textContent =
      storageError ||
      (state.lastSavedAt
        ? `Сохранено: ${fmtDate(state.lastSavedAt)}`
        : "Изменений пока нет");
    el.className =
      "save-state " + (storageError ? "storage-bad" : "storage-ok");
    const warning = document.getElementById("storageWarning");
    if (warning) {
      warning.hidden = !storageError;
      warning.textContent = storageError;
    }
  }
  function saveState(eventText) {
    if (eventText)
      state.activity.unshift({ ts: nowISO(), text: eventText, auto: true });
    const ok = writeState();
    updateAll();
    return ok;
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1800);
  }
  function renderDashboard() {
    const done = phases.filter((p) => checkpointValid(p.id)).length,
      km = [],
      pm = [];
    phases.forEach((p) => {
      p.topics.forEach((_, i) => {
        if (topicKind(p, i) !== "setup") km.push(topicReady(p, i));
      });
      p.practice.forEach((_, i) => pm.push(!!state.practice[`${p.id}:p:${i}`]));
    });
    document.getElementById("phaseDone").textContent =
      `${done}/${phases.length}`;
    document.getElementById("knowledgePct").textContent =
      `${Math.round((km.filter(Boolean).length / km.length) * 100)}%`;
    document.getElementById("practicePct").textContent =
      `${Math.round((pm.filter(Boolean).length / pm.length) * 100)}%`;
    document.getElementById("daysDone").textContent =
      `${days.filter((_, i) => state.days[i]).length}/14`;
    document.getElementById("gatesDone").textContent =
      `${["early", "junior", "zero3"].filter((k) => state.gates[k]).length}/3`;
    document.getElementById("noAiReady").textContent = `${milestoneCount()}/4`;
    const pct = overallProgress();
    document.getElementById("sidePct").textContent = `${pct}%`;
    document.getElementById("sideBar").style.width = `${pct}%`;
    const n = findNext();
    document.getElementById("nextAction").textContent = n.title;
    document.getElementById("nextDesc").textContent = n.desc;
    const rem = remainingByCategory();
    document.getElementById("remainingHours").textContent = `${sumObj(rem)} ч`;
    const weekly = state.mode === "accelerated" ? [15, 20] : [7, 10];
    document.getElementById("calendarEstimate").textContent =
      `~${(sumObj(rem) / weekly[1]).toFixed(1)}–${(sumObj(rem) / weekly[0]).toFixed(1)} нед.`;
    Object.entries({
      Theory: "theory",
      Practice: "practice",
      Project: "project",
      Dsa: "dsa",
      Interview: "interview",
    }).forEach(
      ([s, k]) =>
        (document.getElementById("time" + s).textContent = `${rem[k]} ч`),
    );
    document.getElementById("toEarly").textContent =
      `${gateHours(["p0", "p1", "p2", "p5", "p7", "p8"])} ч`;
    document.getElementById("toJunior").textContent =
      `${gateHours(["p0", "p1", "p2", "p5", "p7", "p8", "p9", "p10"])} ч`;
    document.getElementById("toZero3").textContent =
      `${sumObj(remainingByCategory(12))} ч`;
    document
      .querySelectorAll(".mode-switch button")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.mode === state.mode),
      );
    document.getElementById("blockerText").value = state.blocker || "";
    document.getElementById("next15Text").value = state.next15 || "";
    document.documentElement.dataset.theme = state.theme;
    document.body.classList.toggle("focus-mode", !!state.focus);
    document.getElementById("zoomRange").value = state.zoom || 100;
    document
      .getElementById("phaseBoard")
      .style.setProperty("--zoom", (state.zoom || 100) / 100);
    showStorage();
  }
  function masterySelect(key, val, labels = labelsForKey(key)) {
    return `<select data-mastery="${key}" title="${esc(labels[Number(val)] || labels[0])}">${labels.map((x, i) => `<option value="${i}" ${Number(val) === i ? "selected" : ""}>${i} · ${x}</option>`).join("")}</select>`;
  }
  function renderPhases() {
    const board = document.getElementById("phaseBoard"),
      mini = document.getElementById("miniMap");
    // Retain unchanged cards, controls and focus across progress updates.
    const existing = new Map([...board.children].map(card => [card.id, card]));
    const existingNodes = [...mini.children];
    phases.forEach((p, phaseIndex) => {
      const eff = phaseStatusEffective(p),
        collapsed = !!state.phaseCollapsed[p.id],
        k = Math.round(phaseKnowledge(p) * 100),
        pr = Math.round(phasePractice(p) * 100);
      const signature = JSON.stringify([eff, collapsed, state.checkpoint[p.id], state.evidence[p.id], p.topics.map((_, i) => state.mastery[p.id + ":m:" + i]), p.practice.map((_, i) => state.practice[p.id + ":p:" + i]), checkpointValid(p.id)]);
      const oldCard = existing.get("phase-" + p.id);
      if (oldCard?.dataset.renderSignature === signature) return;
      const card = document.createElement("article");
      card.dataset.renderSignature = signature;
      card.id = `phase-${p.id}`;
      card.className = `phase searchable-item ${eff === "available" ? "available" : ""} ${eff === "done" ? "done" : ""} ${eff === "doing" ? "current" : ""} ${eff === "locked" ? "locked" : ""} ${eff === "failed" ? "failed" : ""} ${collapsed ? "collapsed" : ""}`;
      card.dataset.status = eff;
      card.dataset.category = p.cat;
      card.dataset.search = (
        p.title +
        " " +
        p.topics.join(" ") +
        " " +
        p.practice.join(" ") +
        " " +
        p.checkpoint
      ).toLowerCase();
      card.innerHTML = `<div class="phase-head"><div class="phase-top"><div><div class="phase-num">${p.num} · ${p.cat}</div><h3>${esc(p.title)}</h3><div class="phase-time">${hoursForPhase(p)} ч · deps: ${p.deps.length ? p.deps.join(", ") : "нет"}</div></div><div class="phase-controls"><select class="status-select" data-phase-status="${p.id}" ${eff === "locked" || eff === "done" ? "disabled" : ""}><option value="not" ${(state.phaseStatus[p.id] || "not") === "not" ? "selected" : ""}>Не начато</option><option value="doing" ${eff === "doing" ? "selected" : ""}>В процессе</option>${eff === "done" ? '<option value="done" selected>Готово</option>' : ""}</select><button class="icon-btn" data-collapse="${p.id}">${collapsed ? "＋" : "−"}</button></div></div></div><div class="phase-body">${renderTopics(p)}<div class="label-sm">Проверенная самостоятельная практика</div><p class="muted" style="font-size:11px">Отмечай после своего выполнения и проверки результата.</p>${p.practice.map((x, i) => `<label class="practice-row"><input type="checkbox" data-practice="${p.id}:p:${i}" ${state.practice[`${p.id}:p:${i}`] ? "checked" : ""}><span>${esc(x)}</span></label>`).join("")}<div class="progress-pair"><div class="tiny-progress"><div class="mini-progress"><span>${p.id === "p0" ? "Подготовка" : p.id === "p11" || p.id === "p12" ? "Действия" : "Освоение"}</span><b>${k}%</b></div><div class="bar"><span style="width:${k}%"></span></div></div><div class="tiny-progress"><div class="mini-progress"><span>Practice</span><b>${pr}%</b></div><div class="bar"><span style="width:${pr}%"></span></div></div></div><div class="checkpoint"><b>Checkpoint:</b> ${esc(p.checkpoint)}${state.checkpoint[p.id]?.passed && !checkpointValid(p.id) ? '<p class="gate-warning">Сохранённый pass требует перепроверки: tasks, evidence, mastery/practice или dependencies неполны. Исходная отметка сохранена.</p>' : ""}<div class="checkpoint-actions"><button class="btn primary" data-checkpoint="${p.id}">${state.checkpoint[p.id]?.passed ? "Пройден · открыть" : "Проверить готовность"}</button>${eff === "locked" ? `<span class="badge">Locked: ${p.deps.join(", ")}</span>` : ""}</div></div><div class="evidence"><div class="label-sm">Evidence</div><textarea data-evidence="${p.id}" placeholder="commit / PR / файл / задача / что сделал сам">${esc(state.evidence[p.id] || "")}</textarea></div><div class="ai-note">${esc(p.ai)}</div></div>`;
      bindPhaseControls(card);
      if (oldCard) oldCard.replaceWith(card);
      else board.appendChild(card);
      const b = document.createElement("button");
      b.className = `mini-node ${eff}`;
      b.textContent = p.id.replace("p", "");
      b.title = p.title;
      b.onclick = () =>
        card.scrollIntoView({
          behavior: motionBehavior(),
          inline: "center",
          block: "nearest",
        });
      if (existingNodes[phaseIndex]) existingNodes[phaseIndex].replaceWith(b);
      else mini.appendChild(b);
    });
    applyBoardFilters();
    applySearch();
    labelControls();
  }
  function bindPhaseControls(root) {
    root.querySelectorAll("[data-phase-status]").forEach(
      (el) =>
        (el.onchange = (e) => {
          state.phaseStatus[e.target.dataset.phaseStatus] = e.target.value;
          saveState(
            `Статус ${e.target.dataset.phaseStatus}: ${e.target.value}`,
          );
          renderPhases();
        }),
    );
    root.querySelectorAll("[data-mastery]").forEach(
      (el) =>
        (el.onchange = (e) => {
          state.mastery[e.target.dataset.mastery] = Number(e.target.value);
          saveState();
          renderPhases();
        }),
    );
    root.querySelectorAll("[data-setup]").forEach(
      (el) =>
        (el.onchange = (e) => {
          const key = e.target.dataset.setup;
          state.mastery[key] = e.target.checked
            ? Math.max(3, Number(state.mastery[key] || 0))
            : 0;
          saveState();
          renderPhases();
        }),
    );
    root.querySelectorAll("[data-practice]").forEach(
      (el) =>
        (el.onchange = (e) => {
          state.practice[e.target.dataset.practice] = e.target.checked;
          saveState();
          renderPhases();
        }),
    );
    root.querySelectorAll("[data-evidence]").forEach(
      (el) =>
        (el.oninput = (e) => {
          state.evidence[e.target.dataset.evidence] = e.target.value;
          persistLight();
          renderDashboard();
          renderGateWarnings();
        }),
    );
    root
      .querySelectorAll("[data-evidence]")
      .forEach((el) => (el.onchange = () => renderPhases()));
    root.querySelectorAll("[data-collapse]").forEach(
      (el) =>
        (el.onclick = (e) => {
          const id = e.currentTarget.dataset.collapse;
          state.phaseCollapsed[id] = !state.phaseCollapsed[id];
          saveState();
          renderPhases();
        }),
    );
    root
      .querySelectorAll("[data-checkpoint]")
      .forEach(
        (el) =>
          (el.onclick = (e) =>
            openCheckpoint(e.currentTarget.dataset.checkpoint)),
      );
  }
  function openCheckpoint(id) {
    const p = phases.find((x) => x.id === id);
    currentCheckpointPhase = id;
    document.getElementById("checkpointTitle").textContent =
      `${p.num} — ${p.title}`;
    document.getElementById("checkpointDesc").textContent =
      p.checkpoint +
      " Pass: каждый сценарий выполнен без готового решения, результат запущен и объяснён. Evidence: commit/файл, команда проверки и ожидаемый/фактический результат. Чекбоксы — самоотчёт, приложение не проверяет код.";
    document.getElementById("checkpointTasks").innerHTML = p.test
      .map(
        (x, i) =>
          `<label class="checkpoint-task"><input type="checkbox" data-cptask="${i}" ${state.checkpoint[id]?.tasks?.[i] ? "checked" : ""}> ${esc(x)}</label>`,
      )
      .join("");
    document.getElementById("checkpointNotes").value =
      state.checkpoint[id]?.notes || "";
    document.getElementById("checkpointPassed").checked =
      !!state.checkpoint[id]?.passed;
    openModal("checkpointModal");
  }
  function saveCheckpoint() {
    const p = phases.find((x) => x.id === currentCheckpointPhase),
      tasks = p.test.map(
        (_, i) => !!document.querySelector(`[data-cptask="${i}"]`)?.checked,
      ),
      passed = document.getElementById("checkpointPassed").checked,
      evidenceEl = document.querySelector(
        `[data-evidence="${currentCheckpointPhase}"]`,
      ),
      notes = document.getElementById("checkpointNotes").value.trim(),
      evidence =
        (evidenceEl?.value || "").trim() ||
        state.evidence[currentCheckpointPhase]?.trim() ||
        notes;
    if (passed && !prereqsMet(p)) {
      alert("Сначала пройди prerequisite checkpoints: " + p.deps.join(", "));
      return;
    }
    if (passed && (phaseKnowledge(p) < 1 || phasePractice(p) < 1)) {
      alert(
        "Подтверди настройки, отметь самостоятельную practice и уровень ≥ 3 по темам/действиям перед checkpoint.",
      );
      return;
    }
    if (passed && tasks.some((x) => !x)) {
      alert("Нельзя закрыть checkpoint: сначала выполни все задания.");
      return;
    }
    if (passed && !evidence) {
      alert(
        "Нельзя закрыть checkpoint без evidence: commit / PR / файл / задача / краткое описание самостоятельной работы.",
      );
      return;
    }
    state.evidence[currentCheckpointPhase] = evidence;
    state.checkpoint[currentCheckpointPhase] = {
      tasks,
      notes,
      passed,
      ts: nowISO(),
    };
    if (passed) state.phaseStatus[currentCheckpointPhase] = "done";
    else state.phaseStatus[currentCheckpointPhase] = "doing";
    saveState(
      passed
        ? `Checkpoint ${currentCheckpointPhase} пройден`
        : `Checkpoint ${currentCheckpointPhase} обновлён`,
    );
    closeModals();
    renderPhases();
  }
  function renderToday() {
    const root = document.getElementById("todayRows");
    root.innerHTML = "";
    state.today.forEach((x, i) =>
      root.insertAdjacentHTML(
        "beforeend",
        `<div class="today-row"><input type="checkbox" data-today-check="${i}" ${x.done ? "checked" : ""}><input type="text" data-today-text="${i}" value="${esc(x.text)}"><button class="btn danger" data-today-del="${i}">×</button></div>`,
      ),
    );
    document.querySelectorAll("[data-today-check]").forEach(
      (el) =>
        (el.onchange = (e) => {
          state.today[e.target.dataset.todayCheck].done = e.target.checked;
          saveState();
        }),
    );
    document.querySelectorAll("[data-today-text]").forEach(
      (el) =>
        (el.oninput = (e) => {
          state.today[e.target.dataset.todayText].text = e.target.value;
          persistLight();
        }),
    );
    document.querySelectorAll("[data-today-del]").forEach(
      (el) =>
        (el.onclick = (e) => {
          state.today.splice(Number(e.currentTarget.dataset.todayDel), 1);
          saveState();
          renderToday();
        }),
    );
  }
  function renderResources() {
    const root = document.getElementById("resourceGrid");
    root.innerHTML = "";
    resources.forEach((r) => {
      const done = r.items.filter(
        (_, i) => state.resources[`${r.id}:${i}`],
      ).length;
      root.insertAdjacentHTML(
        "beforeend",
        `<div class="card resource searchable-item" data-search="${esc((r.name + " " + r.desc + " " + r.items.join(" ")).toLowerCase())}"><h4>${r.url ? `<a href="${r.url}">${esc(r.name)}</a>` : esc(r.name)} <span class="badge">${done}/${r.items.length}</span></h4><p>${esc(r.desc)}</p><div class="resource-progress">${r.items.map((x, i) => `<label><input type="checkbox" data-resource="${r.id}:${i}" ${state.resources[`${r.id}:${i}`] ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div></div>`,
      );
    });
    document.querySelectorAll("[data-resource]").forEach(
      (el) =>
        (el.onchange = (e) => {
          state.resources[e.target.dataset.resource] = e.target.checked;
          saveState();
          renderResources();
        }),
    );
  }
  function renderDays() {
    const root = document.getElementById("daysGrid");
    root.innerHTML = "";
    days.forEach((d, i) =>
      root.insertAdjacentHTML(
        "beforeend",
        `<label class="card day searchable-item" data-search="${esc(d.join(" ").toLowerCase())}"><input type="checkbox" data-day="${i}" ${state.days[i] ? "checked" : ""}><div><h4>${d[0]} — ${d[1]}</h4><p>${d[2]}</p><p class="outcome">Результат: ${d[3]}</p></div></label>`,
      ),
    );
    document.querySelectorAll("[data-day]").forEach(
      (el) =>
        (el.onchange = (e) => {
          state.days[e.target.dataset.day] = e.target.checked;
          saveState();
        }),
    );
  }
  function renderSkills() {
    const root = document.getElementById("skillGrid");
    root.innerHTML = "";
    Object.entries(skillGroups).forEach(([g, arr]) =>
      root.insertAdjacentHTML(
        "beforeend",
        `<div class="card skill-card"><h3>${g}</h3><div class="skill-list">${arr.map((x, i) => `<label><span class="tracking-type">${skillKinds[g][i] === "action" ? "Рабочее действие" : "Понимание темы"}</span>${esc(x)} ${masterySelect(`skill:${g}:${i}`, state.skills[`skill:${g}:${i}`] || 0)}</label>`).join("")}</div></div>`,
      ),
    );
    root.querySelectorAll("[data-mastery]").forEach(
      (el) =>
        (el.onchange = (e) => {
          state.skills[e.target.dataset.mastery] = Number(e.target.value);
          saveState();
          renderSkills();
        }),
    );
  }
  function renderNoai() {
    const root = document.getElementById("noaiList");
    root.innerHTML = state.noai.length
      ? state.noai
          .map(
            (s, i) =>
              `<div class="list-item"><div class="list-item-head"><b>${esc(s.topic || "No-AI session")} · ${esc(s.minutes)} мин</b><button class="btn danger" data-del-noai="${i}">×</button></div><div>${esc(s.date || "")} · ${esc(s.outcome)}</div><div class="muted">${esc(s.notes || "")}</div></div>`,
          )
          .join("")
      : '<div class="muted">Пока нет сессий.</div>';
    document.getElementById("noaiMetrics").innerHTML = [30, 45, 60, 90]
      .map(
        (m) =>
          `<div class="metric"><b>${state.noai.some((s) => s.minutes >= m && s.outcome === "done") ? "✓" : "—"}</b><span>${m} min done</span></div>`,
      )
      .join("");
    document.querySelectorAll("[data-del-noai]").forEach(
      (el) =>
        (el.onclick = (e) => {
          state.noai.splice(Number(e.currentTarget.dataset.delNoai), 1);
          saveState();
          renderNoai();
        }),
    );
  }
  function renderMistakes() {
    document.getElementById("mistakeList").innerHTML = state.mistakes.length
      ? state.mistakes
          .map(
            (m, i) =>
              `<div class="list-item"><div class="list-item-head"><b>${esc(m.topic || "Ошибка")} · ${esc(m.date || "")}</b><button class="btn danger" data-del-mistake="${i}">×</button></div><div><b>Проявление:</b> ${esc(m.text)}</div><div><b>Причина:</b> ${esc(m.cause)}</div><div><b>Исправление:</b> ${esc(m.fix)}</div><div><b>Проверка:</b> ${esc(m.verify)}</div></div>`,
          )
          .join("")
      : '<div class="muted">Пока пусто.</div>';
    document.querySelectorAll("[data-del-mistake]").forEach(
      (el) =>
        (el.onclick = (e) => {
          state.mistakes.splice(Number(e.currentTarget.dataset.delMistake), 1);
          saveState();
          renderMistakes();
        }),
    );
  }
  function renderActivity() {
    document.getElementById("activityList").innerHTML =
      state.activity
        .slice(0, 20)
        .map(
          (a) =>
            `<div class="list-item"><b>${fmtDate(a.ts)}</b><div>${esc(a.text)}</div></div>`,
        )
        .join("") || '<div class="muted">Пока нет записей.</div>';
  }
  function renderCareer() {
    const c = state.career;
    state.careerMeta = state.careerMeta || { relevantFound: 0 };
    const rf = document.getElementById("relevantFoundInput");
    if (rf) rf.value = state.careerMeta.relevantFound || 0;
    document.getElementById("careerMetrics").innerHTML =
      `<div class="metric"><b>${state.careerMeta.relevantFound || 0}</b><span>релевантных найдено</span></div><div class="metric"><b>${c.filter((x) => x.stage === "Отклик").length}</b><span>отклики</span></div><div class="metric"><b>${c.filter((x) => x.stage === "HR screening").length}</b><span>HR</span></div><div class="metric"><b>${c.filter((x) => x.stage === "Technical").length}</b><span>technical</span></div><div class="metric"><b>${c.filter((x) => x.stage === "Offer").length}</b><span>offers</span></div><div class="metric"><b>${c.filter((x) => x.stage === "Reject").length}</b><span>rejects</span></div>`;
    const reasons = Object.create(null);
    c.filter((x) => x.stage === "Reject" && x.reason).forEach((x) => {
      const k = x.reason.trim();
      reasons[k] = (reasons[k] || 0) + 1;
    });
    document.getElementById("reasonSummary").innerHTML =
      Object.entries(reasons)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `<span class="pill">${esc(k)} · ${v}</span>`)
        .join("") ||
      '<span class="muted">Причины появятся после отказов.</span>';
    document.getElementById("careerList").innerHTML =
      c
        .slice()
        .reverse()
        .map((x, rev) => {
          const i = c.length - 1 - rev;
          return `<div class="list-item"><div class="list-item-head"><b>${esc(x.company)} · ${esc(x.role)}</b><button class="btn danger" data-del-career="${i}">×</button></div><div>${esc(x.date)} · ${esc(x.stage)}</div><div class="muted">${esc(x.reason || "")} ${x.url ? `· <a href="${esc(safeURL(x.url))}" rel="noopener noreferrer">вакансия</a>` : ""}</div></div>`;
        })
        .join("") || '<div class="muted">Пока нет данных.</div>';
    document.querySelectorAll("[data-del-career]").forEach(
      (el) =>
        (el.onclick = (e) => {
          state.career.splice(Number(e.currentTarget.dataset.delCareer), 1);
          saveState();
          renderCareer();
        }),
    );
  }
  function detectCore(req) {
    return /java|spring|sql|postgres|http|rest|junit|git|hibernate|jpa|maven/i.test(
      req,
    );
  }
  function renderCoverage() {
    const root = document.getElementById("coverageRows");
    root.innerHTML = vacancyWorking
      .map(
        (r, i) =>
          `<div class="coverage-row"><input type="checkbox" data-vcore="${i}" ${r.core ? "checked" : ""}><span>${esc(r.text)}</span><select data-vstatus="${i}"><option value="unknown" ${r.status === "unknown" ? "selected" : ""}>?</option><option value="yes" ${r.status === "yes" ? "selected" : ""}>Знаю</option><option value="partial" ${r.status === "partial" ? "selected" : ""}>Частично</option><option value="no" ${r.status === "no" ? "selected" : ""}>Нет</option><option value="optional" ${r.status === "optional" ? "selected" : ""}>Необязательное</option></select></div>`,
      )
      .join("");
    root.querySelectorAll("[data-vcore]").forEach(
      (el) =>
        (el.onchange = (e) => {
          vacancyWorking[e.target.dataset.vcore].core = e.target.checked;
          renderCoverageSummary();
        }),
    );
    root.querySelectorAll("[data-vstatus]").forEach(
      (el) =>
        (el.onchange = (e) => {
          vacancyWorking[e.target.dataset.vstatus].status = e.target.value;
          renderCoverageSummary();
        }),
    );
    renderCoverageSummary();
    labelControls();
  }
  function renderCoverageSummary() {
    const core = vacancyWorking.filter(
        (x) => x.core && x.status !== "optional",
      ),
      score = core.length
        ? core.reduce(
            (a, x) =>
              a + (x.status === "yes" ? 1 : x.status === "partial" ? 0.5 : 0),
            0,
          ) / core.length
        : 0;
    document.getElementById("coverageSummary").innerHTML =
      `Core technical coverage: <b>${core.length ? Math.round(score * 100) + "%" : "нет обязательных требований"}</b><br>Размечено: ${vacancyWorking.filter((x) => x.status !== "unknown").length}/${vacancyWorking.length}. Это ручная оценка, не прогноз найма.`;
  }
  function renderVacancies() {
    document.getElementById("vacancyList").innerHTML = state.vacancies
      .map(
        (v, i) =>
          `<div class="list-item"><b>${esc(v.title || "Вакансия")}</b><div>Core coverage: ${esc(v.coverage)}% · ${fmtDate(v.ts)}</div><button class="btn" data-review-vacancy="${i}">Открыть требования</button></div>`,
      )
      .reverse()
      .join("");
    document.querySelectorAll("[data-review-vacancy]").forEach(
      (el) =>
        (el.onclick = () => {
          const v = state.vacancies[Number(el.dataset.reviewVacancy)];
          vacancyWorking = clone(v.rows || []);
          document.getElementById("vacancyTitle").value = v.title || "";
          document.getElementById("vacancyRequirements").value = vacancyWorking
            .map((r) => r.text)
            .join("\n");
          renderCoverage();
        }),
    );
  }
  function renderBranches() {
    ["total", "kafka", "kotlin", "threshold"].forEach((k) => {
      const id = {
        total: "marketTotal",
        kafka: "marketKafka",
        kotlin: "marketKotlin",
        threshold: "branchThreshold",
      }[k];
      document.getElementById(id).value = state.market[k] || 0;
    });
    const total = Number(state.market.total) || 0,
      th = Number(state.market.threshold) || 30,
      kp = total
        ? Math.round(((Number(state.market.kafka) || 0) / total) * 100)
        : 0,
      kt = total
        ? Math.round(((Number(state.market.kotlin) || 0) / total) * 100)
        : 0;
    const set = (id, pct, name) => {
      const el = document.getElementById(id),
        on = total >= 10 && pct >= th && pct <= 100;
      el.className = "branch-rec " + (on ? "on" : "");
      el.textContent = total
        ? `${name}: ${pct}% выборки. ${pct > 100 ? "Ошибка: число требований больше выборки." : total < 10 ? "Малая выборка: собери хотя бы 10 релевантных вакансий." : on ? "Кандидат на basics: проверь, что это обязательное требование выбранных ролей, а не wish list." : "Пока не приоритет."}`
        : "Введи выборку последних ~30 дней.";
    };
    set("kafkaRec", kp, "Kafka");
    set("kotlinRec", kt, "Kotlin");
    document.getElementById("aqaSkills").innerHTML = aqaItems
      .map(
        (x, i) =>
          `<div class="mastery-row"><span><small class="tracking-type">${aqaKinds[i] === "action" ? "Рабочее действие" : "Понимание темы"}</small>${esc(x)}</span>${masterySelect(`aqa:${i}`, state.aqa[`aqa:${i}`] || 0)}</div>`,
      )
      .join("");
    document
      .getElementById("aqaSkills")
      .querySelectorAll("[data-mastery]")
      .forEach(
        (el) =>
          (el.onchange = (e) => {
            state.aqa[e.target.dataset.mastery] = Number(e.target.value);
            saveState();
            renderBranches();
          }),
      );
  }
  function downloadJSON(data, name) {
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function restoreState(raw) {
    try {
      const next = migrate(raw);
      if (
        !confirm(
          "Восстановить прогресс? Текущее состояние в памяти будет сохранено отдельным snapshot.",
        )
      )
        return false;
      if (!createSnapshot()) return false;
      if (!writeState(next, true)) return false;
      vacancyWorking = [];
      fullRender();
      closeModals();
      toast("Прогресс восстановлен");
      return true;
    } catch (e) {
      toast("Восстановление отменено: " + e.message);
      return false;
    }
  }
  function readSnapshots() {
    const a = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "[]");
    if (!Array.isArray(a)) throw new Error("Повреждён список snapshots");
    return a;
  }
  function renderAutoBackup() {
    const root = document.getElementById("autoBackupInfo");
    try {
      const b = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || "null");
      root.innerHTML = b
        ? `<div class="list-item"><b>Auto-backup · ${fmtDate(b.ts)}</b><p>Предыдущая запись. Текстовые изменения также обновляют backup.</p><button class="btn" id="restoreAutoBackup">Восстановить</button> <button class="btn" id="downloadAutoBackup">Скачать JSON</button></div>`
        : '<div class="muted">Backup появится после второго сохранения.</div>';
      if (b) {
        document.getElementById("restoreAutoBackup").onclick = () => {
          try {
            restoreState(b.state || JSON.parse(b.raw));
          } catch {
            toast("Backup повреждён — скачай JSON для восстановления");
          }
        };
        document.getElementById("downloadAutoBackup").onclick = () =>
          downloadJSON(b, "java-roadmap-auto-backup.json");
      }
    } catch {
      root.textContent =
        "Auto-backup повреждён или storage недоступен. Исходная запись не изменена.";
    }
  }
  function renderSnapshots() {
    let html;
    try {
      const snaps = readSnapshots();
      html =
        snaps
          .map((s, i) => {
            try {
              if (!s || !s.state) throw Error();
              validateImport(s.state);
              return `<div class="list-item"><b>${fmtDate(s.ts)}</b> · progress ${esc(s.progress)}% · schema ${esc(s.state.schemaVersion)} <button class="btn" data-load-snap="${i}">Загрузить</button> <button class="btn danger" data-del-snap="${i}" aria-label="Удалить snapshot">×</button></div>`;
            } catch {
              return '<div class="list-item">Повреждённый snapshot сохранён, восстановление недоступно.</div>';
            }
          })
          .reverse()
          .join("") || '<div class="muted">Snapshots ещё не создавались.</div>';
    } catch {
      html =
        '<div class="muted">Список snapshots повреждён или storage недоступен. Запись сохранена.</div>';
    }
    for (const id of ["snapshotList", "snapshotModalList"])
      document.getElementById(id).innerHTML = html;
    document.querySelectorAll("[data-load-snap]").forEach(
      (el) =>
        (el.onclick = () => {
          try {
            restoreState(readSnapshots()[Number(el.dataset.loadSnap)].state);
          } catch (e) {
            toast(e.message);
          }
        }),
    );
    document.querySelectorAll("[data-del-snap]").forEach(
      (el) =>
        (el.onclick = () => {
          if (!confirm("Удалить эту точку восстановления?")) return;
          try {
            const a = readSnapshots();
            a.splice(Number(el.dataset.delSnap), 1);
            localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(a));
            renderSnapshots();
          } catch (e) {
            toast("Не удалось удалить: " + e.message);
          }
        }),
    );
  }
  function createSnapshot() {
    try {
      const a = readSnapshots();
      a.push({
        ts: nowISO(),
        progress: overallProgress(),
        state: clone(state),
      });
      if (a.length > 20) {
        if (!confirm("Уже 20 snapshots. Удалить самый старый для новой точки?"))
          return false;
        a.splice(0, a.length - 20);
      }
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(a));
      renderSnapshots();
      toast("Snapshot сохранён");
      return true;
    } catch (e) {
      toast("Snapshot не сохранён: " + e.message);
      return false;
    }
  }
  function renderGateWarnings() {
    const sets = {
      early: ["p0", "p1", "p2", "p5", "p7", "p8"],
      junior: ["p0", "p1", "p2", "p5", "p7", "p8", "p9", "p10"],
      zero3: phases.map((p) => p.id),
    };
    document.querySelectorAll("[data-gate]").forEach((el) => {
      const gate = el.closest(".gate");
      let w = gate.querySelector(".gate-warning");
      if (!w) {
        w = document.createElement("p");
        w.className = "gate-warning";
        w.setAttribute("role", "status");
        gate.appendChild(w);
      }
      const gaps = sets[el.dataset.gate].filter((id) => !checkpointValid(id));
      w.textContent = gaps.length
        ? "Система не подтверждает: " +
          gaps.join(", ") +
          ". Откликаться можно; галочка не заменяет coding evidence."
        : "Фазовые checkpoints подтверждены; DSA, самостоятельную feature и условия вакансии проверь вручную.";
    });
  }
  function renderGates() {
    renderGateWarnings();
    document.querySelectorAll("[data-gate]").forEach((el) => {
      el.checked = !!state.gates[el.dataset.gate];
      el.onchange = (e) => {
        state.gates[e.target.dataset.gate] = e.target.checked;
        saveState(
          `Career gate ${e.target.dataset.gate}: ${e.target.checked ? "done" : "not done"}`,
        );
      };
    });
    document.getElementById("finalExamCheck").checked = !!state.finalExam;
    document.getElementById("finalExamCheck").onchange = (e) => {
      state.finalExam = e.target.checked;
      saveState(
        e.target.checked
          ? "Финальный no-AI экзамен пройден"
          : "Финальный экзамен снят",
      );
    };
  }
  function renderTimer() {
    const m = Math.floor(timerSeconds / 60)
        .toString()
        .padStart(2, "0"),
      s = (timerSeconds % 60).toString().padStart(2, "0");
    document.getElementById("timer").textContent = `${m}:${s}`;
  }
  function newDrill() {
    const cats = Object.keys(drillBank);
    document.getElementById("drillCards").innerHTML = cats
      .map((c) => {
        const a = drillBank[c],
          q = a[Math.floor(Math.random() * a.length)];
        return `<div class="drill-card"><h4>${c}</h4><p>${esc(q)}</p></div>`;
      })
      .join("");
  }
  function applyBoardFilters() {
    const s = document.getElementById("statusFilter").value,
      c = document.getElementById("categoryFilter").value;
    document.querySelectorAll(".phase").forEach((el) => {
      const sm = s === "all" || el.dataset.status === s,
        cm = c === "all" || el.dataset.category === c;
      el.classList.toggle("hidden", !(sm && cm));
    });
  }
  function applySearch() {
    const q = document.getElementById("searchInput").value.trim().toLowerCase();
    document.querySelectorAll(".searchable-item").forEach((el) => {
      const hay = (el.dataset.search || el.textContent).toLowerCase();
      el.classList.toggle("hidden-by-search", !!q && !hay.includes(q));
    });
    document.querySelectorAll("section.searchable").forEach((sec) => {
      if (!q) {
        sec.classList.remove("search-section-hidden");
        return;
      }
      sec.classList.toggle(
        "search-section-hidden",
        !sec.textContent.toLowerCase().includes(q),
      );
    });
  }
  function motionBehavior() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
  }
  function scrollCurrent() {
    const n = findNext();
    document.getElementById("searchInput").value = "";
    document.getElementById("statusFilter").value = "all";
    document.getElementById("categoryFilter").value = "all";
    state.phaseCollapsed[n.id] = false;
    renderPhases();
    document.getElementById(`phase-${n.id}`)?.scrollIntoView({
      behavior: motionBehavior(),
      inline: "center",
      block: "nearest",
    });
  }
  let timerDeadline = 0;
  let modalReturnFocus = null;
  function openModal(id) {
    closeModals(false);
    modalReturnFocus = document.activeElement;
    const m = document.getElementById(id);
    m.classList.add("open");
    document.querySelector(".app").inert = true;
    m.querySelector("input,textarea,button")?.focus();
  }
  function closeModals(restore = true) {
    document
      .querySelectorAll(".modal-backdrop")
      .forEach((m) => m.classList.remove("open"));
    document.querySelector(".app").inert = false;
    if (restore) modalReturnFocus?.focus();
  }
  function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json",
      }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `java-roadmap-v3-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Прогресс экспортирован");
  }
  function importState() {
    try {
      let raw = JSON.parse(document.getElementById("importText").value);
      if (raw.state) raw = raw.state;
      const next = migrate(raw);
      if (
        !confirm(
          "Заменить текущий прогресс импортом? Текущая запись будет сохранена в auto-backup.",
        )
      )
        return;
      if (!writeState(next, true)) return;
      vacancyWorking = [];
      fullRender();
      closeModals();
      toast("Импортировано");
    } catch (e) {
      alert("Импорт отменён: " + e.message);
    }
  }
  function updateAll() {
    renderDashboard();
    renderBranches();
    renderGates();
    renderToday();
    renderNoai();
    renderMistakes();
    renderActivity();
    renderCareer();
    renderVacancies();
    renderSnapshots();
    renderAutoBackup();
    renderTimer();
    applySearch();
    labelControls();
  }
  function fullRender() {
    renderDashboard();
    renderPhases();
    renderToday();
    renderResources();
    renderDays();
    renderSkills();
    renderNoai();
    renderMistakes();
    renderActivity();
    renderCareer();
    renderCoverage();
    renderVacancies();
    renderBranches();
    renderSnapshots();
    renderGates();
    renderTimer();
    renderAutoBackup();
    applySearch();
    labelControls();
  }
  document.querySelectorAll(".mode-switch button").forEach(
    (b) =>
      (b.onclick = () => {
        state.mode = b.dataset.mode;
        saveState();
      }),
  );
  document.getElementById("blockerText").oninput = (e) => {
    state.blocker = e.target.value;
    persistLight();
  };
  document.getElementById("next15Text").oninput = (e) => {
    state.next15 = e.target.value;
    persistLight();
  };
  document.getElementById("addTodayBtn").onclick = () => {
    state.today.push({ text: "", done: false });
    saveState();
    renderToday();
  };
  document.getElementById("manualSaveBtn").onclick = () => {
    if (saveState("Ручное сохранение прогресса")) toast("Состояние сохранено");
  };
  document.getElementById("themeBtn").onclick = () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    saveState();
  };
  document.getElementById("focusBtn").onclick = () => {
    state.focus = !state.focus;
    saveState();
    toast(state.focus ? "Focus включён" : "Focus выключен");
  };
  document.getElementById("snapshotBtn").onclick = () => {
    if (createSnapshot()) openModal("snapshotsModal");
  };
  document.getElementById("exportBtn").onclick = exportState;
  document.getElementById("importBtn").onclick = () => openModal("importModal");
  document.getElementById("applyImportBtn").onclick = importState;
  document.getElementById("saveCheckpointBtn").onclick = saveCheckpoint;
  document
    .querySelectorAll("[data-close-modal]")
    .forEach((b) => (b.onclick = closeModals));
  document.querySelectorAll(".modal-backdrop").forEach(
    (m) =>
      (m.onclick = (e) => {
        if (e.target === m) closeModals();
      }),
  );
  document.getElementById("statusFilter").onchange = () => {
    applyBoardFilters();
    applySearch();
  };
  document.getElementById("categoryFilter").onchange = () => {
    applyBoardFilters();
    applySearch();
  };
  document.getElementById("zoomRange").oninput = (e) => {
    state.zoom = Number(e.target.value);
    document
      .getElementById("phaseBoard")
      .style.setProperty("--zoom", state.zoom / 100);
    saveState();
  };
  document.getElementById("scrollCurrentBtn").onclick = scrollCurrent;
  document.getElementById("collapseAllBtn").onclick = () => {
    const all = phases.every((p) => state.phaseCollapsed[p.id]);
    phases.forEach((p) => (state.phaseCollapsed[p.id] = !all));
    saveState();
    renderPhases();
  };
  let searchFrame = 0;
  document.getElementById("searchInput").oninput = () => {
    cancelAnimationFrame(searchFrame);
    searchFrame = requestAnimationFrame(applySearch);
  };
  document.getElementById("addNoaiBtn").onclick = () => {
    const m = Number(document.getElementById("noaiMinutes").value);
    if (!Number.isFinite(m) || m <= 0) {
      toast("Укажи положительное число минут");
      return;
    }
    state.noai.unshift({
      date: document.getElementById("noaiDate").value,
      minutes: m,
      outcome: document.getElementById("noaiOutcome").value,
      topic: document.getElementById("noaiTopic").value,
      notes: document.getElementById("noaiNotes").value,
    });
    saveState(`No-AI session: ${m} мин`);
    renderNoai();
  };
  document.getElementById("addMistakeBtn").onclick = () => {
    const text = document.getElementById("mistakeText").value;
    if (!text) return;
    state.mistakes.unshift({
      date: document.getElementById("mistakeDate").value,
      topic: document.getElementById("mistakeTopic").value,
      text,
      cause: document.getElementById("mistakeCause").value,
      fix: document.getElementById("mistakeFix").value,
      verify: document.getElementById("mistakeVerify").value,
    });
    saveState("Добавлена learning mistake");
    renderMistakes();
  };
  document.getElementById("addActivityBtn").onclick = () => {
    const x = document.getElementById("activityText").value.trim();
    if (!x) return;
    state.activity.unshift({ ts: nowISO(), text: x, auto: false });
    document.getElementById("activityText").value = "";
    saveState();
    renderActivity();
  };
  document.getElementById("relevantFoundInput").onchange = (e) => {
    state.careerMeta = state.careerMeta || { relevantFound: 0 };
    state.careerMeta.relevantFound = Math.max(0, Number(e.target.value) || 0);
    saveState();
    renderCareer();
  };
  document.getElementById("addCareerBtn").onclick = () => {
    state.career.push({
      date: document.getElementById("careerDate").value,
      company: document.getElementById("careerCompany").value,
      role: document.getElementById("careerRole").value,
      stage: document.getElementById("careerStage").value,
      reason: document.getElementById("careerReason").value,
      url: document.getElementById("careerUrl").value,
    });
    saveState("Career event added");
    renderCareer();
  };
  document.getElementById("parseVacancyBtn").onclick = () => {
    vacancyWorking = document
      .getElementById("vacancyRequirements")
      .value.split(/\n+/)
      .map((x) => x.trim().replace(/^[•*\-–—]\s*/, ""))
      .filter(Boolean)
      .filter((x, i, a) => a.indexOf(x) === i)
      .map((text) => ({ text, core: detectCore(text), status: "unknown" }));
    renderCoverage();
  };
  document.getElementById("saveVacancyBtn").onclick = () => {
    if (!vacancyWorking.length) return;
    const core = vacancyWorking.filter(
        (x) => x.core && x.status !== "optional",
      ),
      score = core.length
        ? Math.round(
            (core.reduce(
              (a, x) =>
                a + (x.status === "yes" ? 1 : x.status === "partial" ? 0.5 : 0),
              0,
            ) /
              core.length) *
              100,
          )
        : 0;
    state.vacancies.push({
      ts: nowISO(),
      title: document.getElementById("vacancyTitle").value,
      coverage: score,
      rows: clone(vacancyWorking),
    });
    saveState("Vacancy coverage saved");
    renderVacancies();
  };
  ["marketTotal", "marketKafka", "marketKotlin", "branchThreshold"].forEach(
    (id) =>
      (document.getElementById(id).onchange = (e) => {
        const k = {
          marketTotal: "total",
          marketKafka: "kafka",
          marketKotlin: "kotlin",
          branchThreshold: "threshold",
        }[id];
        state.market[k] = Number(e.target.value) || 0;
        saveState();
        renderBranches();
      }),
  );
  document.getElementById("newDrillBtn").onclick = newDrill;
  document.getElementById("timerStart").onclick = () => {
    if (timerHandle) return;
    if (timerSeconds <= 0) return;
    timerDeadline = Date.now() + timerSeconds * 1000;
    timerHandle = setInterval(() => {
      timerSeconds = Math.max(
        0,
        Math.ceil((timerDeadline - Date.now()) / 1000),
      );
      renderTimer();
      if (timerSeconds === 0) {
        clearInterval(timerHandle);
        timerHandle = null;
        toast("Время вышло");
      }
    }, 250);
  };
  document.getElementById("timerPause").onclick = () => {
    if (timerHandle)
      timerSeconds = Math.max(
        0,
        Math.ceil((timerDeadline - Date.now()) / 1000),
      );
    clearInterval(timerHandle);
    timerHandle = null;
    renderTimer();
  };
  document.getElementById("timerReset").onclick = () => {
    clearInterval(timerHandle);
    timerHandle = null;
    timerSeconds = 1800;
    renderTimer();
  };
  const setSidebarOpen = (open) => {
    document
      .getElementById("drawerBtn")
      .setAttribute("aria-expanded", String(open));
    document.getElementById("sidebar").classList.toggle("open", open);
    document.getElementById("sidebarBackdrop").classList.toggle("open", open);
    document.querySelector("main").inert = open;
    document.body.style.overflow = open ? "hidden" : "";
    if (open) document.querySelector(".nav a").focus();
    else if (window.innerWidth <= 880)
      document.getElementById("drawerBtn").focus();
  };
  document.getElementById("drawerBtn").onclick = () =>
    setSidebarOpen(
      !document.getElementById("sidebar").classList.contains("open"),
    );
  document.getElementById("sidebarBackdrop").onclick = () =>
    setSidebarOpen(false);
  window.addEventListener("resize", () => {
    if (
      window.innerWidth > 880 &&
      document.getElementById("sidebar").classList.contains("open")
    )
      setSidebarOpen(false);
  });
  document.querySelectorAll(".nav a").forEach((a) =>
    a.addEventListener("click", () => {
      if (window.innerWidth <= 880) setSidebarOpen(false);
    }),
  );
  document.addEventListener("keydown", (e) => {
    const modal = document.querySelector(".modal-backdrop.open");
    if (modal) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModals();
      }
      if (e.key === "Tab") {
        const items = [
          ...modal.querySelectorAll("button,input,select,textarea,a[href]"),
        ].filter((x) => !x.disabled);
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (e.key === "Escape") {
      setSidebarOpen(false);
      closeModals();
      return;
    }
    if (document.getElementById("sidebar").classList.contains("open")) {
      if (e.key === "Tab") {
        const links = [
          ...document.querySelectorAll(".sidebar a,.sidebar button"),
        ];
        if (e.shiftKey && document.activeElement === links[0]) {
          e.preventDefault();
          links.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === links.at(-1)) {
          e.preventDefault();
          links[0].focus();
        }
      }
      return;
    }
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.target.closest("button,a,[contenteditable=true]")
    )
      return;
    if (e.target.matches("input,textarea,select")) {
      if (e.key === "Escape") closeModals();
      return;
    }
    if (e.key === "/") {
      e.preventDefault();
      document.getElementById("searchInput").focus();
    } else if (e.key.toLowerCase() === "g") scrollCurrent();
    else if (e.key.toLowerCase() === "f") {
      state.focus = !state.focus;
      saveState();
    } else if (e.key.toLowerCase() === "t") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      saveState();
    } else if (e.key === "ArrowRight") {
      document
        .getElementById("boardWrap")
        .scrollBy({ left: 320, behavior: motionBehavior() });
    } else if (e.key === "ArrowLeft") {
      document
        .getElementById("boardWrap")
        .scrollBy({ left: -320, behavior: motionBehavior() });
    } else if (e.key === "Escape") closeModals();
  });
  const bw = document.getElementById("boardWrap");
  let drag = false,
    startX = 0,
    startScroll = 0;
  bw.addEventListener("mousedown", (e) => {
    if (e.target.closest("button,input,select,textarea,label")) return;
    drag = true;
    startX = e.pageX;
    startScroll = bw.scrollLeft;
    bw.classList.add("dragging");
  });
  window.addEventListener("mouseup", () => {
    drag = false;
    bw.classList.remove("dragging");
  });
  let dragFrame = 0;
  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const left = startScroll - (e.pageX - startX);
    cancelAnimationFrame(dragFrame);
    dragFrame = requestAnimationFrame(() => { if (drag) bw.scrollLeft = left; });
  }, { passive: true });
  const sections = [...document.querySelectorAll("section[id]")],
    navLinks = [...document.querySelectorAll(".nav a")];
  const obs = new IntersectionObserver(
    (entries) => {
      const v = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!v) return;
      navLinks.forEach((a) =>
        a.classList.toggle(
          "active",
          a.getAttribute("href") === "#" + v.target.id,
        ),
      );
    },
    { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.1, 0.3, 0.6] },
  );
  sections.forEach((s) => obs.observe(s));
  function labelControls() {
    document.querySelectorAll("input:not([aria-label]),textarea:not([aria-label]),select:not([aria-label])").forEach((el) => {
      if (el.hasAttribute("aria-label") || el.labels?.length) return;
      const row = el.closest(".mastery-row,.today-row,.coverage-row,.phase");
      el.setAttribute(
        "aria-label",
        el.placeholder ||
          el.title ||
          row?.querySelector("span,h3")?.textContent ||
          {
            statusFilter: "Фильтр статуса",
            categoryFilter: "Фильтр категории",
            noaiOutcome: "Результат no-AI сессии",
            careerStage: "Этап карьеры",
            importText: "JSON прогресса",
            checkpointNotes: "Результат checkpoint",
          }[el.id] ||
          el.id ||
          "Отметить выполнение",
      );
    });
    document.querySelectorAll("button:not([aria-label])").forEach((el) => {
      if (!el.hasAttribute("aria-label"))
        el.setAttribute(
          "aria-label",
          el.title || el.textContent.trim() || "Действие",
        );
    });
    document
      .querySelectorAll(".icon-btn,.mini-node")
      .forEach((el) =>
        el.setAttribute("aria-label", el.title || "Свернуть или раскрыть фазу"),
      );
    document.querySelectorAll(".modal").forEach((el) => {
      const title = el.querySelector("h3");
      if (!title.id) title.id = el.parentElement.id + "Title";
      el.setAttribute("aria-labelledby", title.id);
    });
  }
  function preserveFocus(render) {
    return function (...args) {
      const active = document.activeElement,
        key = active?.id
          ? ["id", active.id]
          : [...(active?.attributes || [])]
              .filter((a) => a.name.startsWith("data-"))
              .map((a) => [a.name, a.value])[0];
      const result = render(...args);
      if (active && !active.isConnected && key) {
        const target = document.querySelector(
          `[${key[0]}="${CSS.escape(key[1])}"]`,
        );
        target?.focus({ preventScroll: true });
      }
      return result;
    };
  }
  renderPhases = preserveFocus(renderPhases);
  renderSkills = preserveFocus(renderSkills);
  renderBranches = preserveFocus(renderBranches);
  renderCoverage = preserveFocus(renderCoverage);
  renderToday = preserveFocus(renderToday);
  const renderResourcesOriginal = renderResources;
  renderResources = preserveFocus(function () {
    renderResourcesOriginal();
    applySearch();
    labelControls();
  });
  // Dependencies are serialized because edits may mutate nested objects in place.
  function renderWhenChanged(render, select) {
    let previous;
    return (...args) => {
      let next;
      try { next = JSON.stringify(select()); }
      catch { previous = undefined; return render(...args); }
      if (next === previous) return;
      const result = render(...args);
      previous = JSON.stringify(select());
      return result;
    };
  }
  renderToday = renderWhenChanged(renderToday, () => state.today);
  renderNoai = renderWhenChanged(renderNoai, () => state.noai);
  renderMistakes = renderWhenChanged(renderMistakes, () => state.mistakes);
  renderActivity = renderWhenChanged(renderActivity, () => state.activity.slice(0, 20));
  renderCareer = renderWhenChanged(renderCareer, () => [state.career, state.careerMeta]);
  renderVacancies = renderWhenChanged(renderVacancies, () => state.vacancies);
  renderBranches = renderWhenChanged(renderBranches, () => [state.market, state.aqa]);
  renderSnapshots = renderWhenChanged(renderSnapshots, () => localStorage.getItem(SNAPSHOT_KEY));
  renderAutoBackup = renderWhenChanged(renderAutoBackup, () => localStorage.getItem(AUTO_BACKUP_KEY));
  document.getElementById("downloadRawBtn").onclick = () => {
    try {
      downloadJSON(
        {
          storageRaw: localStorage.getItem(STORAGE_KEY),
          snapshotsRaw: localStorage.getItem(SNAPSHOT_KEY),
          autoBackupRaw: localStorage.getItem(AUTO_BACKUP_KEY),
        },
        "java-roadmap-original-records.json",
      );
    } catch (e) {
      toast(e.message);
    }
  };
  newDrill();
  fullRender();
  document
    .getElementById("printBtn")
    .addEventListener("click", () => window.print());
  function flush() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
      writeState();
    }
  }
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });
  return {
    getState: () => state,
    defaultState,
    isBlocked: () => loadBlocked,
    validate: validateImport,
    persist: (value) => writeState(migrate(value)),
    render: fullRender,
    applyCloud(value) {
      validateImport(value);
      if (!writeState(migrate(value)))
        throw Error("Не удалось сохранить прогресс");
      fullRender();
    },
    flush,
  };
}
