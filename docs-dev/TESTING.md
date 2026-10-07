# Testing and verification

Choose checks according to the risk of the change. Do not run or claim irrelevant checks merely to make a report look complete.

## Baseline

For code changes, start with:

```bash
npm test
```

For deployable source/build changes:

```bash
npm run build
```

For browser/cloud/responsive changes:

```bash
npm exec playwright install chromium
npm run test:browser
```

An existing browser may be selected with `ROADMAP_BROWSER_PATH` as described in `README.md`.

## Current automated coverage

### Node tests

`tests/merge.test.mjs` currently verifies important behavior including:
- independent three-way changes merge;
- explicit conflict selection preserves unrelated changes;
- arrays conflict as a unit;
- dangerous/invalid imports are rejected;
- schema migration retains historical data;
- checkpoint dependencies lock dependent phases;
- next-action behavior starts from missing setup work.

### Browser test

`tests/cloud.browser.cjs` exercises a built application with an isolated browser and mocked API flow. Existing checks include:
- first local progress upload;
- second-device cloud download after explicit choice;
- automatic saves;
- offline independent-field merge;
- conflicting-field resolution;
- optimistic concurrency/retry;
- edits during upload retained;
- reload retains progress/auth;
- expired session refresh;
- document overflow/cloud dialog at 360, 390, 768 and 1440 widths;
- absence of captured runtime errors.

Deletion and array-conflict semantics are covered by Node merge tests; the cloud browser suite does not exercise list conflicts end to end.

### UI browser test

`npm run test:ui` builds the production Session and runs `tests/ui.browser.cjs` with isolated browser storage. It covers the daily learning/checkpoint loop, current-phase navigation, section-menu/modal keyboard behavior, accessible control names, debounce writes, import/export, rejected imports, escaped imported HTML, No-AI/mistakes/career/vacancy records, snapshot restore/backup, reload, schema 2 migration, visible corrupt/blocked/quota storage warnings and stale-tab protection/export/reload. It captures dashboard and Session screenshots in both themes at 360/390/430/768/1440/1920 px, plus checkpoint/cloud dialogs. The browser-generated favicon request is fulfilled by the test because this project has no favicon asset.

`npm run test:designs` additionally verifies Atlas, Session and Ledger, including evidence-summary updates after a debounced save. CI runs all three browser suites after installing Chromium.

Design checks also cover Atlas prerequisite directions/arrows, connections avoiding unrelated nodes, selected-edge highlighting, hover contrast and mobile map centering; Session phase bars update after edits, remain visible across steps/collapse, and its program bar updates after a valid checkpoint and reload. For a focused design change, build previews and run e.g. `node tests/designs.browser.cjs atlas session` (or omit names for all three). Screenshots include both themes at 360/390/768/1440 for Atlas and Session, plus the expanded map and partial progress.

Do not interpret the existing responsive assertion as a complete visual regression suite.

## Verification matrix

| Change area | Minimum relevant checks |
| --- | --- |
| Roadmap wording only | Inspect affected UI; `npm test` if indexed content/count changed |
| `src/data/roadmap.js` structure/order/deps | `npm test`, browser inspection, consider migration impact |
| `src/domain/progress.js` | `npm test`; add focused unit case for changed rule |
| `src/state/schema.js` | `npm test`; test old/current import + invalid input; browser if persistence flow changed |
| `src/cloud/merge.js` | focused unit tests for base/local/remote + conflict paths |
| `src/cloud/controller.js` | `npm test`, `npm run test:browser` |
| `src/cloud/transport.js` | browser test or focused request/error test depending on change |
| Supabase migration/RLS/RPC | review `SECURITY_INVARIANTS.md`; validate against a real/dev database when available |
| `src/styles.css` or layout DOM | build + inspect 360/390/768/1440; browser tests if behavior changed |
| dialog/drawer/topbar/mobile navigation | browser interaction at narrow width, not screenshot only |
| build script | `npm run build`; inspect output manifest/assets |

## Responsive visual check

For substantial UI work inspect at least:

```text
360 x 900
390 x 900
768 x 900
1440 x 900
```

Check:
- page-level horizontal overflow;
- clipping/overlap;
- drawer behavior;
- topbar/search/actions;
- dialogs and forms;
- touch target usability;
- long realistic strings;
- loading/error/success states affected by the change;
- intended horizontal scrolling remains component-scoped.

See `RESPONSIVE_UI.md`.

## Build-output rule

`docs/` is generated. When source changes affect deployment, run `npm run build` and include the regenerated output.

Do not edit a hashed file in `docs/assets/` by hand and treat that as the implementation.

## Real-service verification

The browser test mocks API behavior. It does not prove the live Supabase project still has correct RLS/RPC configuration.

For database/security changes, explicitly distinguish:
- source/migration review;
- local/mock browser verification;
- real Supabase verification.

Never claim the last category unless it was actually performed.
