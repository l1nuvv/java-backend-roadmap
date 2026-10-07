const fs = require("fs"),
  path = require("path"),
  http = require("http"),
  assert = require("assert");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../docs"),
  cloud = new Map(),
  errors = [];
let races = 0,
  refreshes = 0,
  delayNext = false,
  raceNext = false,
  uploadedResolve;
const session = {
  access_token: "test-access",
  refresh_token: "test-refresh",
  expires_in: 3600,
  user: {
    id: "11111111-1111-1111-1111-111111111111",
    email: "test@example.com",
  },
};
async function main() {
  const server = http.createServer((req, res) => {
    const file = path.join(
      root,
      req.url === "/" ? "index.html" : req.url.split("?")[0],
    );
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "application/javascript; charset=utf-8"
        : file.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/html; charset=utf-8",
    );
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.ROADMAP_BROWSER_PATH || undefined,
      headless: true,
    });
    const contexts = [];
    async function device(fragment = '') {
      const context = await browser.newContext({ reducedMotion: "reduce" }),
        page = await context.newPage();
      contexts.push(context);
      page.on("pageerror", (e) => errors.push(e.message));
      await context.route(
        "https://mogtmmjyheqhnfkgwvor.supabase.co/**",
        async (route) => {
          const url = new URL(route.request().url()),
            data = route.request().postDataJSON(),
            headers = route.request().headers();
          let body;
          if (url.pathname === "/auth/v1/otp") body = {};
          else if (url.pathname === "/auth/v1/verify") body = session;
          else if (url.pathname === "/auth/v1/token") {
            refreshes++;
            body = session;
          } else if (url.pathname === "/auth/v1/logout") body = {};
          else if (headers.authorization !== "Bearer test-access") {
            await route.fulfill({
              status: 401,
              json: { message: "Unauthorized" },
            });
            return;
          } else if (url.pathname === "/auth/v1/user") body = session.user;
          else if (url.pathname === "/rest/v1/roadmap_progress")
            body = cloud.has(session.user.id)
              ? [cloud.get(session.user.id)]
              : [];
          else if (url.pathname === "/rest/v1/rpc/save_roadmap_progress") {
            if (delayNext) {
              delayNext = false;
              uploadedResolve?.();
              await new Promise((r) => setTimeout(r, 800));
            }
            if (raceNext) {
              raceNext = false;
              const other = structuredClone(cloud.get(session.user.id));
              other.revision++;
              other.payload.mastery["p1:m:8"] = 3;
              cloud.set(session.user.id, other);
            }
            const row = cloud.get(session.user.id);
            if ((row?.revision || 0) !== data.expected_revision) {
              races++;
              body = { saved: false, row: row || null };
            } else {
              const next = {
                user_id: session.user.id,
                payload: data.new_payload,
                revision: (row?.revision || 0) + 1,
                updated_at: new Date().toISOString(),
              };
              cloud.set(session.user.id, next);
              body = { saved: true, row: next };
            }
          } else throw Error("Unexpected API " + url.pathname);
          await route.fulfill({ status: 200, json: body });
        },
      );
      await page.goto("http://127.0.0.1:" + server.address().port + fragment);
      await page.waitForFunction(() => !document.getElementById("startup"));
      return page;
    }
    async function idle(page) {
      await page.waitForFunction(
        () => document.getElementById("cloudBtn").dataset.status === "ok",
      );
    }
    async function login(page) {
      await page.locator("#cloudBtn").click();
      await page.locator("#cloudEmail").fill("test@example.com");
      await page.locator("#cloudSend").click();
      await page.locator("#cloudCode").fill("123456");
      await page.locator("#cloudVerify").click();
    }
    async function offline(page, value) {
      await page.evaluate(
        (v) =>
          Object.defineProperty(navigator, "onLine", {
            configurable: true,
            value: !v,
          }),
        value,
      );
    }
    async function change(page, key, value) {
      const id = key.split(':')[0];
      if (!(await page.locator('#phase-'+id).evaluate(el=>el.classList.contains('selected-phase')))) {
        await page.locator('.session-phases [data-open-phase="'+id+'"]').click();
      }
      if ((await page.locator('#phase-'+id).getAttribute('data-step')) !== 'topics') {
        await page.locator('#phase-'+id+' [data-step="topics"]').click();
      }
      await page
        .locator('[data-mastery="' + key + '"]')
        .selectOption(String(value));
    }
    async function sync(page) {
      const opened = await page
        .locator("#cloudDialog")
        .evaluate((el) => el.open);
      if (!opened) await page.locator("#cloudBtn").click();
      await page.locator("#cloudNow").click();
      await page.waitForFunction(
        () => document.getElementById("cloudBtn").dataset.status !== "busy",
      );
      if (!opened) await page.locator("#cloudClose").click();
    }
    const a = await device();
    const unchangedCard = await a.locator("#phase-p1").elementHandle();
    const unchangedToday = await a.locator("#todayRows").evaluateHandle(el => el.firstElementChild);
    await a.locator('[data-setup="p0:m:0"]').check();
    assert.equal(await unchangedCard.evaluate(el => el === document.getElementById("phase-p1")), true);
    assert.equal(await unchangedToday.evaluate(el => el === document.getElementById("todayRows").firstElementChild), true);
    assert.equal(await a.locator("#miniMap button").count(), 13);
    await a.locator("#searchInput").fill("Maven");
    await a.waitForFunction(() => document.querySelectorAll(".phase.hidden-by-search").length > 0);
    await a.locator("#searchInput").fill("");
    await a.waitForFunction(() => document.querySelectorAll(".phase.hidden-by-search").length === 0);
    await login(a);
    await idle(a);
    assert.equal(cloud.get(session.user.id).payload.mastery["p0:m:0"], 3);
    await a.locator("#cloudClose").click();
    const b = await device();
    await login(b);
    await b.locator("#cloudUseRemote").waitFor({ state: "visible" });
    await b.locator("#cloudUseRemote").click();
    await idle(b);
    assert.equal(await b.locator('[data-setup="p0:m:0"]').isChecked(), true);
    await b.locator("#cloudClose").click();
    await a.locator('[data-mastery="p0:m:2"]').selectOption("3");
    await a.waitForFunction(
      () => document.getElementById("cloudBtn").dataset.status === "ok",
    );
    await sync(b);
    assert.equal(await b.locator('[data-mastery="p0:m:2"]').inputValue(), "3");
    // Different offline fields are merged, including changes on both devices.
    await offline(a, true);
    await offline(b, true);
    await change(a, "p1:m:0", 3);
    await change(b, "p1:m:1", 4);
    await sync(a);
    assert.ok(
      (await a.locator("#cloudBtn").getAttribute("title")).includes(
        "Нет интернета",
      ),
    );
    await offline(a, false);
    await sync(a);
    await idle(a);
    await offline(b, false);
    await sync(b);
    await idle(b);
    await sync(a);
    assert.equal(
      Number(await a.locator('[data-mastery="p1:m:1"]').inputValue()),
      4,
    );
    assert.equal(
      Number(await b.locator('[data-mastery="p1:m:0"]').inputValue()),
      3,
    );
    // Same field conflict is explicit; unrelated local changes survive remote choice.
    await offline(a, true);
    await offline(b, true);
    await change(a, "p1:m:2", 3);
    await change(b, "p1:m:2", 4);
    await change(b, "p1:m:3", 3);
    await offline(a, false);
    await sync(a);
    await idle(a);
    await offline(b, false);
    await sync(b);
    assert.equal(
      Number(await b.locator('[data-mastery="p1:m:2"]').inputValue()),
      4,
    );
    await b.locator("#cloudBtn").click();
    const screenshots = path.resolve(__dirname, "../test-results/cloud");
    fs.mkdirSync(screenshots, { recursive: true });
    for (const width of [390, 1440]) {
      await b.setViewportSize({ width, height: 900 });
      for (const theme of ["dark", "light"]) {
        await b.evaluate(value => document.documentElement.dataset.theme = value, theme);
        await b.screenshot({ path: path.join(screenshots, `conflict-${width}-${theme}.png`) });
      }
    }
    await b.locator("#cloudUseRemote").click();
    await idle(b);
    assert.equal(
      Number(await b.locator('[data-mastery="p1:m:2"]').inputValue()),
      3,
    );
    assert.equal(cloud.get(session.user.id).payload.mastery["p1:m:3"], 3);
    await b.locator("#cloudClose").click();
    // Fresh remote revisions arriving between read and write trigger CAS retry.
    await sync(a);
    await offline(a, true);
    await offline(b, true);
    await change(a, "p1:m:4", 3);
    await change(b, "p1:m:5", 4);
    await offline(a, false);
    await offline(b, false);
    raceNext = true;
    await Promise.all([sync(a), sync(b)]);
    await sync(a);
    await sync(b);
    assert.equal(cloud.get(session.user.id).payload.mastery["p1:m:4"], 3);
    assert.equal(cloud.get(session.user.id).payload.mastery["p1:m:5"], 4);
    assert.equal(cloud.get(session.user.id).payload.mastery["p1:m:8"], 3);
    assert.ok(races > 0);
    // Local typing while uploading must not be overwritten by upload completion.
    await offline(a, true);
    await change(a, "p1:m:6", 3);
    await offline(a, false);
    delayNext = true;
    const uploading = new Promise((r) => (uploadedResolve = r)),
      running = sync(a);
    await uploading;
    await change(a, "p1:m:7", 4);
    await running;
    await idle(a);
    await a.waitForTimeout(1000);
    await sync(a);
    assert.equal(cloud.get(session.user.id).payload.mastery["p1:m:7"], 4);
    await a.reload();
    await a.waitForFunction(() => !document.getElementById("startup"));
    await idle(a);
    assert.equal(
      Number(await a.locator('[data-mastery="p1:m:7"]').inputValue()),
      4,
    );
    // Persisted expired auth refreshes without losing queued marks.
    await a.evaluate(() => {
      const key =
          "javaRoadmapCloud:session:https://mogtmmjyheqhnfkgwvor.supabase.co",
        s = JSON.parse(localStorage.getItem(key));
      s.expires_at = 1;
      localStorage.setItem(key, JSON.stringify(s));
    });
    await a.reload();
    await a.waitForFunction(() => !document.getElementById("startup"));
    await idle(a);
    assert.ok(refreshes > 0);
    // Auth callback fragments must be removed while the Session screen remains usable.
    const callback = await device('/#access_token=test-access&refresh_token=test-refresh&expires_in=3600');
    await callback.waitForFunction(()=>!location.hash && !document.getElementById('startup'));
    assert.equal(await callback.locator('#roadmap.active-screen').isVisible(),true);
    assert.equal(await callback.locator('.session-program-progress').isVisible(),true);
    for (const width of [360, 390, 768, 1440]) {
      await a.setViewportSize({ width, height: 900 });
      await a.locator("#cloudBtn").click();
      assert.ok(
        await a.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      );
      await a.locator("#cloudClose").click();
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          status: "Passed",
          checks: [
            "First local progress uploaded",
            "Second device downloads cloud after explicit choice",
            "Automatic saves",
            "Different offline fields merged",
            "Conflicting field choice preserves unrelated marks",
            "CAS concurrency retry",
            "Edits during upload retained",
            "Reload keeps progress and auth",
            "Expired session refresh",
            "Mobile dialog without overflow",
            "No runtime errors",
          ],
          races,
          refreshes,
        },
        null,
        2,
      ),
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
