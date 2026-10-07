const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const { startServer } = await import('../scripts/serve.mjs');
  const { defaultState } = await import('../src/state/schema.js');
  const server = await startServer({ root: path.resolve(__dirname, '../docs'), port: 0 });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const output = path.resolve(__dirname, '../test-results/ui');
  await fs.mkdir(output, { recursive: true });
  let browser;
  const errors = [], failed = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.ROADMAP_BROWSER_PATH || undefined, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    // The app has no favicon asset; keep its unrelated browser-generated request out of UI diagnostics.
    await context.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('requestfailed', req => failed.push(req.url()));
    page.on('dialog', d => d.accept());
    await page.goto(origin);
    await page.waitForFunction(() => !document.getElementById('startup'));
    async function screen(id) {
      if (await page.locator('#'+id).evaluate(el=>el.classList.contains('active-screen'))) return;
      await page.locator('.sections-menu summary').click();
      await page.locator('.sections-menu a[href="#'+id+'"]').click();
      await page.locator('#'+id).waitFor({state:'visible'});
    }
    async function phase(id, step='topics') {
      await screen('roadmap');
      await page.locator('.session-phases [data-open-phase="'+id+'"]').click();
      await page.locator('#phase-'+id+' [data-step="'+step+'"]').click();
    }
    assert.equal(await page.locator('.preview-banner').count(),0);
    assert.equal(await page.locator('.session-program-progress').isVisible(),true);
    assert.equal(await page.locator('.phase').count(), 13);
    assert.match(await page.locator('[data-mastery="p0:m:2"]').getAttribute('aria-label'), /Maven/);

    // Daily loop: the action clears stale filters, opens the right phase and moves keyboard focus.
    await page.locator('.program-tools summary').click();
    await page.locator('#collapseAllBtn').click();
    await page.locator('#statusFilter').selectOption('done');
    await page.locator('#searchInput').fill('nonexistent audit query');
    await screen('overview');
    await page.locator('#nextActionBtn').click();
    assert.equal(await page.locator('#searchInput').inputValue(), '');
    assert.equal(await page.locator('#statusFilter').inputValue(), 'all');
    assert.equal(await page.locator('#phase-p0').evaluate(el => el.classList.contains('collapsed')), false);
    assert.equal(await page.locator('#phase-p0 h3').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('[data-collapse="p0"]').getAttribute('aria-expanded'), 'true');
    await page.locator('[data-collapse="p0"]').click();
    assert.equal(await page.locator('[data-collapse="p0"]').getAttribute('aria-expanded'), 'false');
    await page.locator('[data-collapse="p0"]').click();

    for (const input of await page.locator('#phase-p0 [data-setup]').all()) await input.check();
    for (const select of await page.locator('#phase-p0 [data-mastery]').all()) await select.selectOption('3');
    await phase('p0','practice');
    for (const input of await page.locator('#phase-p0 [data-practice]').all()) await input.check();
    await phase('p0','proof');
    await page.locator('[data-evidence="p0"]').fill('commit audit; mvn test; all tests pass');
    await page.locator('[data-checkpoint="p0"]').click();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#saveCheckpointBtn').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-cptask="0"]').evaluate(el => el === document.activeElement), true);
    for (const input of await page.locator('[data-cptask]').all()) await input.check();
    await page.locator('#checkpointPassed').check();
    await page.locator('#saveCheckpointBtn').click();
    assert.equal(await page.locator('#phase-p0').getAttribute('data-status'), 'done');
    assert.equal(await page.locator('#phase-p1').getAttribute('data-status'), 'available');
    await screen('overview');
    await page.locator('#nextActionBtn').click();
    assert.equal(await page.locator('#phase-p1 h3').evaluate(el => el === document.activeElement), true);
    await screen('overview');

    // Completed debounce and an immediate save both leave no extra lifecycle write queued.
    const writes = await page.evaluate(async () => {
      let count = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === 'javaRoadmapV3') count++; return original.call(this, key, value); };
      try {
        const el = document.getElementById('blockerText');
        el.value = 'debounce'; el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 350));
        const settled = count;
        window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pagehide'));
        const flushed = count;
        el.value = 'immediate'; el.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('themeBtn').click();
        await new Promise(resolve => setTimeout(resolve, 350));
        return { settled, flushed, immediate: count - flushed };
      } finally { Storage.prototype.setItem = original; }
    });
    assert.deepEqual(writes, { settled: 1, flushed: 1, immediate: 1 });

    // Utility menu: keyboard Escape, outside click and action selection all close it.
    const menu = page.locator('.utility-menu');
    await menu.locator('summary').click(); await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate(el => el.open), false);
    assert.equal(await menu.locator('summary').evaluate(el => el === document.activeElement), true);
    await menu.locator('summary').click(); await page.locator('#searchInput').click();
    assert.equal(await menu.evaluate(el => el.open), false);
    await menu.locator('summary').click();
    const downloading = page.waitForEvent('download'); await page.locator('#exportBtn').click();
    const exported = JSON.parse(await fs.readFile(await (await downloading).path(), 'utf8'));
    assert.equal(exported.checkpoint.p0.passed, true);
    assert.equal(await menu.evaluate(el => el.open), false);

    exported.historical = { value: 'keep' };
    exported.today = [{ text: '<img src=x onerror="window.auditXss=1">', done: false }];
    exported.evidence.p0 = '</textarea><img src=x onerror="window.auditXss=1">';
    await menu.locator('summary').click(); await page.locator('#importBtn').click();
    await page.locator('#importText').fill(JSON.stringify(exported)); await page.locator('#applyImportBtn').click();
    assert.equal(await page.locator('[data-today-text="0"]').inputValue(), exported.today[0].text);
    assert.equal(await page.evaluate(() => window.auditXss), undefined);
    assert.equal(await page.locator('#phase-p0 img').count(), 0);
    const saved = await page.evaluate(() => localStorage.getItem('javaRoadmapV3'));
    await menu.locator('summary').click(); await page.locator('#importBtn').click();
    await page.locator('#importText').fill('{"mastery":{"__proto__":3}}'); await page.locator('#applyImportBtn').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('javaRoadmapV3')), saved);
    await page.keyboard.press('Escape');
    await page.reload(); await page.waitForFunction(() => !document.getElementById('startup'));
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('javaRoadmapV3')).historical), { value: 'keep' });
    assert.equal(await page.locator('#phase-p0').getAttribute('data-status'), 'done');

    // Supporting daily tools and recovery keep real user records rather than display-only counts.
    await screen('noai');
    await page.locator('#noaiMinutes').fill('45');
    await page.locator('#noaiTopic').fill('Collections without hints');
    await page.locator('#noaiOutcome').selectOption('done');
    await page.locator('#noaiNotes').fill('Own implementation and tests');
    await page.locator('#addNoaiBtn').click();
    assert.equal(await page.locator('#noaiList .list-item').count(), 1);
    await screen('mistakes');
    await page.locator('#mistakeText').fill('Incorrect equals/hashCode');
    await page.locator('#mistakeFix').fill('Compared fields and added regression test');
    await page.locator('#addMistakeBtn').click();
    assert.equal(await page.locator('#mistakeList .list-item').count(), 1);
    await screen('career');
    await page.locator('#careerCompany').fill('Audit fixture');
    await page.locator('#careerRole').fill('Java intern');
    await page.locator('#careerUrl').fill('javascript:window.auditXss=1');
    await page.locator('#addCareerBtn').click();
    assert.equal(await page.locator('#careerList a[href^="javascript:"]').count(), 0);
    await screen('coverage');
    await page.locator('#vacancyTitle').fill('Audit vacancy');
    await page.locator('#vacancyRequirements').fill('Java\nSQL JOIN\nKafka');
    await page.locator('#parseVacancyBtn').click();
    await page.locator('[data-vstatus="0"]').selectOption('yes');
    await page.locator('[data-vstatus="1"]').selectOption('partial');
    assert.match(await page.locator('#coverageSummary').textContent(), /75%/);
    await page.locator('#saveVacancyBtn').click();
    assert.equal(await page.locator('#vacancyList .list-item').count(), 1);
    await screen('mistakes');
    await page.locator('#activityText').fill('Audit session recorded');
    await page.locator('#addActivityBtn').click();
    await menu.locator('summary').click(); await page.locator('#snapshotBtn').click();
    await page.keyboard.press('Escape');
    await screen('overview');
    const snapshotBlocker = await page.locator('#blockerText').inputValue();
    await page.locator('#blockerText').fill('temporary edit to restore');
    await menu.locator('summary').click(); await page.locator('#manualSaveBtn').click();
    await screen('history');
    await page.locator('#history [data-load-snap="0"]').click();
    assert.equal(await page.locator('#blockerText').inputValue(), snapshotBlocker);
    assert.equal(await page.locator('#noaiList .list-item').count(), 1);
    assert.equal(await page.locator('#mistakeList .list-item').count(), 1);
    assert.equal(await page.locator('#vacancyList .list-item').count(), 1);
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('javaRoadmapV3AutoBackup')).state));

    for (const [width, height] of [[360, 800], [390, 844], [430, 932], [768, 1024], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await screen('overview');
      for (const theme of ['dark', 'light']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#themeBtn').click();
        await page.evaluate(() => window.scrollTo(0, 0));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'overflow ' + width);
        await page.screenshot({ path: path.join(output, `dashboard-${width}-${theme}.png`) });
      }
      if (width <= 880) {
        await page.locator('.sections-menu summary').click();
        assert.ok((await page.locator('.nav a').first().boundingBox()).height >= 44);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.sections-menu').evaluate(el=>el.open),false);
        await screen('coverage');
      }
      for (const section of ['roadmap', 'coverage', 'noai', 'mistakes', 'history']) {
        await screen(section);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), section + ' overflow ' + width);
      }
      await phase('p0','proof');
      await page.locator('[data-checkpoint="p0"]').click();
      const bounds = await page.locator('#checkpointModal .modal').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      await page.screenshot({ path: path.join(output, `checkpoint-${width}.png`) });
      await page.keyboard.press('Escape');
      await page.locator('#cloudBtn').click();
      await page.screenshot({ path: path.join(output, `cloud-${width}.png`) });
      await page.keyboard.press('Escape');
      await phase('p0','topics');
      for (const theme of ['dark','light']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#themeBtn').click();
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:path.join(output,`session-${width}-${theme}.png`)});
      }
    }

    // Fail-safe startup and an unsaved in-memory edit when storage is unavailable.
    for (const scenario of ['corrupt', 'blocked', 'quota', 'schema2']) {
      const c = await browser.newContext(), p = await c.newPage();
      p.on('pageerror', e => errors.push(e.message));
      await c.addInitScript(({ scenario, defaults }) => {
        if (scenario === 'corrupt') localStorage.setItem('javaRoadmapV3', '{bad json');
        if (scenario === 'schema2') localStorage.setItem('javaRoadmapV3', JSON.stringify({ schemaVersion: 2, checks: { 'p0:t:0': true }, historical: 'old' }));
        if (scenario === 'quota') localStorage.setItem('javaRoadmapV3', JSON.stringify(defaults));
        if (scenario === 'blocked') Storage.prototype.getItem = () => { throw Error('Storage blocked'); };
        if (['blocked', 'quota'].includes(scenario)) Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
      }, { scenario, defaults: defaultState });
      await p.goto(origin); await p.waitForFunction(() => !document.getElementById('startup'));
      await p.locator('[data-setup="p0:m:0"]').check();
      if (scenario === 'schema2') {
        assert.equal(await p.locator('[data-setup="p0:m:0"]').isChecked(), true);
        assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('javaRoadmapV3')).historical), 'old');
      } else {
        assert.equal(await p.locator('#storageWarning').isVisible(), true);
        if (scenario === 'corrupt') assert.equal(await p.evaluate(() => localStorage.getItem('javaRoadmapV3')), '{bad json');
        if (scenario === 'quota') assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('javaRoadmapV3'))), defaultState);
      }
      await c.close();
    }
    // A stale same-origin tab must never silently overwrite a completed save from another tab.
    const tabs = await browser.newContext(), a = await tabs.newPage(), b = await tabs.newPage();
    await a.goto(origin); await b.goto(origin);
    await a.waitForFunction(() => !document.getElementById('startup'));
    await b.waitForFunction(() => !document.getElementById('startup'));
    await a.locator('[data-setup="p0:m:0"]').check();
    await b.locator('[data-setup="p0:m:1"]').check();
    assert.match(await b.locator('#storageWarning').textContent(), /Другая вкладка/);
    assert.equal(await b.locator('[data-setup="p0:m:1"]').isChecked(), true, 'unsaved edit remains in memory');
    const shared = await a.evaluate(() => JSON.parse(localStorage.getItem('javaRoadmapV3')));
    assert.equal(shared.mastery['p0:m:0'], 3);
    assert.equal(shared.mastery['p0:m:1'], undefined);
    await b.locator('.utility-menu summary').click();
    const recovery = b.waitForEvent('download'); await b.locator('#exportBtn').click();
    const recoverable = JSON.parse(await fs.readFile(await (await recovery).path(), 'utf8'));
    assert.equal(recoverable.mastery['p0:m:1'], 3);
    await b.reload(); await b.waitForFunction(() => !document.getElementById('startup'));
    assert.equal(await b.locator('[data-setup="p0:m:0"]').isChecked(), true);
    await b.locator('[data-setup="p0:m:1"]').check();
    assert.equal(await b.locator('#storageWarning').isVisible(), false);
    assert.equal(await b.evaluate(() => JSON.parse(localStorage.getItem('javaRoadmapV3')).mastery['p0:m:0']), 3);
    await tabs.close();
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    await context.close();
    console.log('PASS UI: Session daily loop, checkpoint/dependencies, keyboard/section menu, debounce writes, import/export/XSS, No-AI/mistakes/career/vacancy, snapshot restore/backup, reload, schema 2, corrupt/blocked/quota storage, visible recovery warnings, stale-tab protection/recovery, 6 viewports × 2 themes, no app console errors or failed requests (favicon stubbed)');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
