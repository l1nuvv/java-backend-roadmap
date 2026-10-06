import { LOCAL_FIELDS, copy, equal, merge, progress } from "./merge.js";
import { createTransport } from "./transport.js";
import { defaultState, migrate, validateImport } from "../state/schema.js";
import { publicConfig } from "../config.js";
export function mountCloud(app) {
  "use strict";
  const PREFIX = "javaRoadmapCloud:";
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(PREFIX + key)) || fallback;
    } catch {
      return fallback;
    }
  };
  const store = (key, value) =>
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  const config = publicConfig;
  const { request } = createTransport(config, () => session);
  let session = null,
    meta = null,
    busy = false,
    again = false,
    applying = false,
    pending = null,
    debounce = null,
    epoch = 0;
  const button = document.createElement("button");
  button.id = "cloudBtn";
  button.className = "btn";
  button.textContent = "Облако";
  document.querySelector(".top-actions").append(button);
  const dialog = document.createElement("dialog");
  dialog.id = "cloudDialog";
  dialog.setAttribute("aria-labelledby", "cloudTitle");
  dialog.innerHTML = `<h2 id="cloudTitle">Прогресс на всех устройствах</h2><p id="cloudStatus" role="status" aria-live="polite"></p><p class="muted">Отметки, checkpoint и записи синхронизируются. Тема и масштаб остаются на этом устройстве. Локальные изменения доступны и без интернета.</p><div id="cloudLogin"><label for="cloudEmail">Email</label><input id="cloudEmail" type="email" autocomplete="email" placeholder="you@example.com"><button id="cloudSend" class="btn primary">Прислать ссылку / код</button><label for="cloudCode">Код из письма, если указан</label><input id="cloudCode" inputmode="numeric" autocomplete="one-time-code"><button id="cloudVerify" class="btn">Войти по коду</button></div><div id="cloudSigned" hidden><p id="cloudAccount"></p><button id="cloudNow" class="btn primary">Синхронизировать сейчас</button><button id="cloudLogout" class="btn">Выйти</button></div><div id="cloudConflict" hidden><p id="cloudConflictText"></p><button id="cloudUseLocal" class="btn">Оставить мои изменения</button><button id="cloudUseRemote" class="btn">Взять из облака</button></div><button id="cloudClose" class="btn">Закрыть</button>`;
  document.body.append(dialog);
  const el = (id) => document.getElementById(id);
  function status(text, kind = "local") {
    el("cloudStatus").textContent = text;
    button.textContent =
      kind === "ok"
        ? "Облако ✓"
        : kind === "busy"
          ? "Облако ↻"
          : kind === "error"
            ? "Облако !"
            : "Облако";
    button.title = text;
    button.dataset.status = kind;
  }
  function ui() {
    el("cloudLogin").hidden = !!session;
    el("cloudSigned").hidden = !session;
    el("cloudAccount").textContent = session?.user?.email || "";
    el("cloudConflict").hidden = !pending;
  }
  function validConfig(value) {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(value.url || ""))
      throw Error("Укажи Project URL вида https://project.supabase.co");
    if ((value.key || "").startsWith("sb_secret_"))
      throw Error("Нужен публичный ключ, не secret key");
    if (value.key?.startsWith("sb_publishable_")) return;
    try {
      const claims = JSON.parse(
        atob(value.key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (claims.role === "anon") return;
    } catch {}
    throw Error("Укажи Publishable key или anon key");
  }
  function configId() {
    return config.url?.replace(/\/$/, "") || "";
  }
  function ownsLocal() {
    const owner = read("owner", null);
    return (
      !owner ||
      (owner.project === configId() && owner.userId === session.user.id)
    );
  }
  function setSession(value) {
    const sameUser = session?.user?.id === value.user?.id;
    session = {
      ...value,
      expires_at:
        value.expires_at ||
        Math.floor(Date.now() / 1000) + (value.expires_in || 3600),
    };
    store("session:" + configId(), session);
    if (!sameUser) {
      meta = ownsLocal()
        ? read("meta:" + configId() + ":" + session.user.id, null)
        : null;
      pending = null;
      epoch++;
    }
    ui();
  }
  async function refreshUnlocked() {
    if (!session) throw Error("Войди в аккаунт");
    if (session.expires_at > Date.now() / 1000 + 60) return;
    try {
      const next = await request("/auth/v1/token?grant_type=refresh_token", {
        refresh_token: session.refresh_token,
      });
      setSession(next);
    } catch (e) {
      if (e.httpStatus === 400 || e.httpStatus === 401) {
        session = null;
        localStorage.removeItem(PREFIX + "session:" + configId());
        epoch++;
        ui();
        throw Error(
          "Сессия закончилась. Войди снова; локальный прогресс сохранён.",
        );
      }
      throw e;
    }
  }
  async function authorized(path, body) {
    await refresh();
    try {
      return await request(path, body, true);
    } catch (e) {
      if (e.httpStatus !== 401) throw e;
      session.expires_at = 0;
      await refresh();
      return request(path, body, true);
    }
  }
  function remember(row) {
    const next = {
      userId: session.user.id,
      revision: row?.revision || 0,
      base: copy(row?.payload || progress(defaultState)),
    };
    store("meta:" + configId() + ":" + session.user.id, next);
    store("owner", { project: configId(), userId: session.user.id });
    meta = next;
  }
  function apply(value) {
    validateImport(value);
    const next = migrate({
      ...value,
      ...Object.fromEntries(LOCAL_FIELDS.map((k) => [k, app.getState()[k]])),
    });
    if (equal(progress(app.getState()), progress(next))) return;
    applying = true;
    try {
      if (!app.persist(next))
        throw Error("Не удалось сохранить облачный прогресс на устройстве");
      app.render();
    } finally {
      applying = false;
    }
  }
  function showConflict(remote, first = false) {
    pending = { remote, first };
    el("cloudConflictText").textContent = first
      ? remote
        ? "В облаке уже есть прогресс. Выбери: загрузить его на это устройство или заменить текущими локальными отметками. Перед заменой локальной версии будет сохранён backup."
        : "Локальный прогресс связан с другим аккаунтом. Выбери: отправить его в этот аккаунт или начать с пустого прогресса из облака. Перед заменой локальной версии будет сохранён backup."
      : "Один и тот же пункт изменён по-разному на двух устройствах. Выбери версию для спорных пунктов; остальные изменения объединятся.";
    ui();
    status(
      first
        ? "Нужно выбрать начальный прогресс."
        : "Есть конфликт изменений. Открой «Облако» и выбери версию.",
      "error",
    );
  }
  async function sync() {
    if (!session || busy || pending || app.isBlocked()) {
      if (busy) again = true;
      return;
    }
    if (!navigator.onLine) {
      status(
        "Нет интернета. Отметки сохранены на устройстве; синхронизация продолжится после подключения.",
      );
      return;
    }
    busy = true;
    again = false;
    const startedEpoch = epoch;
    try {
      status("Синхронизация…", "busy");
      for (let attempt = 0; attempt < 4; attempt++) {
        const rows = await authorized(
          "/rest/v1/roadmap_progress?select=payload,revision,updated_at&user_id=eq." +
            encodeURIComponent(session.user.id),
        );
        if (startedEpoch !== epoch) return;
        const remote = rows[0] || null;
        if (remote) validateImport(remote.payload);
        if (!meta) {
          if (remote || !ownsLocal()) {
            showConflict(remote, true);
            return;
          }
          remember(null);
        }
        const local = progress(app.getState()),
          cloud = remote?.payload || progress(defaultState),
          conflicts = [];
        const merged = merge(meta.base, local, cloud, "local", "", conflicts);
        validateImport(merged);
        if (conflicts.length) {
          showConflict(remote);
          return;
        }
        if (equal(merged, cloud)) {
          apply(merged);
          remember(remote);
          status(
            "Синхронизировано · " + new Date().toLocaleTimeString("ru-RU"),
            "ok",
          );
          return;
        }
        const result = await authorized("/rest/v1/rpc/save_roadmap_progress", {
          expected_revision: remote?.revision || 0,
          new_payload: merged,
        });
        if (startedEpoch !== epoch) return;
        if (!result.saved) continue;
        // Changes made while the upload was in flight stay local and are sent on the next pass.
        const latest = progress(app.getState()),
          after = merge(local, latest, merged);
        remember(result.row);
        apply(after);
        again = !equal(after, merged);
        status(
          again
            ? "Новые отметки ожидают отправки…"
            : "Синхронизировано · " + new Date().toLocaleTimeString("ru-RU"),
          again ? "busy" : "ok",
        );
        return;
      }
      throw Error(
        "Другой клиент часто меняет прогресс. Повторим синхронизацию позже.",
      );
    } catch (e) {
      status(e.message + " Изменения остаются на этом устройстве.", "error");
    } finally {
      busy = false;
      if (again && session && !pending) {
        again = false;
        schedule();
      }
    }
  }
  function schedule() {
    clearTimeout(debounce);
    debounce = setTimeout(sync, 800);
  }
  async function choose(which) {
    if (!pending) return;
    const selected = pending;
    pending = null;
    try {
      const local = progress(app.getState()),
        remote = selected.remote?.payload || progress(defaultState);
      const merged = selected.first
        ? which === "remote"
          ? remote
          : local
        : merge(meta.base, local, remote, which);
      validateImport(merged);
      remember(selected.remote);
      apply(merged);
      ui();
      await sync();
    } catch (e) {
      pending = selected;
      ui();
      status(e.message, "error");
    }
  }
  async function action(fn) {
    try {
      await fn();
    } catch (e) {
      status(e.message, "error");
    }
  }
  button.onclick = () => {
    ui();
    dialog.showModal();
  };
  el("cloudClose").onclick = () => dialog.close();
  el("cloudSend").onclick = () =>
    action(async () => {
      const email = el("cloudEmail").value.trim();
      if (!el("cloudEmail").checkValidity() || !email)
        throw Error("Укажи email");
      el("cloudSend").disabled = true;
      try {
        await request(
          "/auth/v1/otp?redirect_to=" +
            encodeURIComponent(location.origin + location.pathname),
          { email, create_user: false },
        );
        status(
          "Письмо отправлено. Открой ссылку на этом устройстве или введи код из письма.",
        );
      } finally {
        el("cloudSend").disabled = false;
      }
    });
  el("cloudVerify").onclick = () =>
    action(async () => {
      const data = await request("/auth/v1/verify", {
        email: el("cloudEmail").value.trim(),
        token: el("cloudCode").value.trim(),
        type: "email",
      });
      setSession(data);
      el("cloudCode").value = "";
      await sync();
    });
  el("cloudNow").onclick = sync;
  el("cloudUseLocal").onclick = () => choose("local");
  el("cloudUseRemote").onclick = () => choose("remote");
  el("cloudLogout").onclick = () =>
    action(async () => {
      if (busy) throw Error("Дождись завершения синхронизации");
      const previous = session;
      session = null;
      meta = null;
      pending = null;
      epoch++;
      localStorage.removeItem(PREFIX + "session:" + configId());
      ui();
      status("Вышел из аккаунта. Прогресс остаётся локально.");
      if (previous)
        try {
          await fetch(configId() + "/auth/v1/logout", {
            method: "POST",
            headers: {
              apikey: config.key,
              Authorization: "Bearer " + previous.access_token,
            },
            signal: AbortSignal.timeout(12000),
          });
        } catch {}
    });
  window.addEventListener("roadmap:saved", () => {
    if (!applying && session) {
      if (pending) {
        status(
          "Изменения сохранены локально. Выбери версию спорных пунктов в окне «Облако».",
          "error",
        );
        return;
      }
      status("Сохранено на устройстве; ожидает синхронизации…", "busy");
      schedule();
    }
  });
  window.addEventListener("online", schedule);
  window.addEventListener("focus", schedule);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });
  setInterval(() => {
    if (!document.hidden) sync();
  }, 15000);
  ui();
  status("Войди по email для синхронизации.");
  (async () => {
    try {
      if (!config.url) return;
      validConfig(config);
      const params = new URLSearchParams(location.hash.slice(1));
      if (params.has("access_token")) {
        const access_token = params.get("access_token"),
          refresh_token = params.get("refresh_token");
        history.replaceState(null, "", location.pathname + location.search);
        if (!refresh_token) throw Error("Неполная ссылка входа");
        session = { access_token };
        const user = await request("/auth/v1/user", undefined, true);
        setSession({
          access_token,
          refresh_token,
          user,
          expires_in: Number(params.get("expires_in")) || 3600,
        });
      } else {
        const cached = read("session:" + configId(), null);
        if (cached?.user?.id) setSession(cached);
      }
      if (session) await sync();
    } catch (e) {
      session = null;
      ui();
      status(e.message, "error");
    }
  })();
  async function refresh() {
    if (!navigator.locks) return refreshUnlocked();
    return navigator.locks.request("roadmap-auth:" + configId(), async () => {
      const cached = read("session:" + configId(), null);
      if (
        cached?.user?.id === session?.user?.id &&
        cached.expires_at >= session.expires_at
      )
        session = cached;
      return refreshUnlocked();
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== PREFIX + "session:" + configId()) return;
    try {
      const next = event.newValue ? JSON.parse(event.newValue) : null;
      if (!next) {
        session = null;
        meta = null;
        pending = null;
        epoch++;
        ui();
        status("Выполнен выход в другой вкладке. Локальный прогресс сохранён.");
      } else if (next.user?.id) setSession(next);
    } catch {
      status("Не удалось обновить сессию другой вкладки.", "error");
    }
  });
  return { sync };
}
