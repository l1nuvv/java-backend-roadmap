# AGENTS.md

## Purpose

This repository is the Java Backend Roadmap learning-control application. It is a real stateful product, not a static mockup or marketing landing page.

Primary user tasks:
- see the next useful learning action;
- track topic mastery, practice, checkpoints, evidence and career activity;
- keep progress safe locally;
- optionally synchronize progress between devices through Supabase;
- use the same application comfortably on desktop and phone.

## Read first

Before a substantial change, read only the documents relevant to the task:

- `docs-dev/PRODUCT.md` — product intent and priorities.
- `docs-dev/ARCHITECTURE.md` — module boundaries and data flow.
- `docs-dev/STATE_AND_SYNC.md` — persisted-state and cloud-sync contract.
- `docs-dev/ROADMAP_DATA.md` — curriculum/data contract.
- `docs-dev/UI_DESIGN.md` — project-specific visual and UX rules.
- `docs-dev/RESPONSIVE_UI.md` — phone/tablet requirements and verification.
- `docs-dev/TESTING.md` — verification matrix.
- `docs-dev/SECURITY_INVARIANTS.md` — cloud/auth/database invariants.

For substantial frontend design or visual redesign work, also use the repo-scoped `frontend-design` skill in `.codex/skills/frontend-design/`.

## Source of truth

Edit source files, not generated output.

Primary editable areas:
- `src/`
- `tests/`
- `scripts/`
- `supabase/migrations/`
- root/documentation files

Generated deployment output:
- `docs/`

`docs/` is produced by `npm run build`. Do not hand-edit generated HTML/assets to implement a feature. Change the source and rebuild.

## Architecture boundaries

- `src/data/roadmap.js` — curriculum and tracking metadata.
- `src/domain/progress.js` — pure readiness/progress/next-action calculations.
- `src/state/schema.js` — persisted state shape, validation and migration.
- `src/cloud/merge.js` — pure three-way merge logic and local-only field filtering.
- `src/cloud/transport.js` — HTTP transport only.
- `src/cloud/controller.js` — authentication/session/sync orchestration.
- `src/app.js` — UI orchestration and local persistence.
- `src/config.js` — public Supabase configuration only.
- `src/styles.css` — application styling and responsive behavior.

Do not casually move storage, network or DOM responsibilities across these boundaries. Read `docs-dev/ARCHITECTURE.md` before structural changes.

## Compatibility invariants

Existing progress is user data. Preserve it unless an explicit migration is part of the task.

Current persistent contract:
- `schemaVersion = 3`
- `javaRoadmapV3`
- `javaRoadmapV3Snapshots`
- `javaRoadmapV3AutoBackup`

Do not rename stable phase IDs (`p0` ... `p12`) or persisted tracking keys without a deliberate migration and tests.

Read `docs-dev/STATE_AND_SYNC.md` before changing state, import/export, snapshots, cloud merge or synchronization.

## Frontend rules

This is an information-dense learning/productivity tool.

Do not turn it into a generic SaaS landing page. Preserve the product's working surfaces, information density, semantic status colors, light/dark themes and fast access to the next action.

Do not introduce decorative gradients, glow/orbs, glassmorphism, giant hero typography, bento layouts, card nesting or marketing copy unless there is a concrete product reason.

Desktop-only correctness is not enough. Any meaningful layout/UI change must remain usable on phone. Read `docs-dev/UI_DESIGN.md` and `docs-dev/RESPONSIVE_UI.md`.

## Mobile requirement

For visually meaningful changes, explicitly inspect narrow layouts. At minimum verify representative widths around:
- 360 px phone;
- 390 px phone;
- 768 px tablet/narrow desktop;
- 1440 px desktop.

The page itself must not gain accidental horizontal overflow. Horizontal scrolling is acceptable only inside a component that intentionally owns it, such as the roadmap board.

Keep important actions reachable on touch devices. Target controls should generally be at least about 44 CSS px in each interactive dimension where practical. Do not rely on hover for required functionality.

## Security

Never add secret/service-role credentials to browser code, docs, tests or commits. `src/config.js` may contain only public Supabase configuration.

Do not weaken RLS or direct-write restrictions as a shortcut. Read `docs-dev/SECURITY_INVARIANTS.md` before any auth/database/cloud change.

## Change discipline

Prefer the smallest coherent change that satisfies the request.

Do not:
- perform unrelated refactors;
- replace working vanilla-JS architecture with a framework without an explicit request;
- add dependencies for trivial UI behavior;
- silently alter persisted semantics;
- invent product metrics, user data or curriculum facts;
- claim a test, browser size or real Supabase flow was verified when it was not.

When behavior changes, update the closest relevant test or add a focused test.

## Verification

Use `docs-dev/TESTING.md` to select checks.

Baseline commands:

```bash
npm test
npm run build
```

For browser/cloud or substantial UI work:

```bash
npm exec playwright install chromium
npm run test:browser
```

If a browser is already installed, `ROADMAP_BROWSER_PATH` may be used as documented in `README.md`.

After a build, deployment artifacts in `docs/` are expected to change only as a consequence of source changes.

## Definition of done

A change is complete only when all applicable items are true:

1. The requested behavior is implemented in source, not patched only in `docs/`.
2. Existing persisted progress remains compatible, or a migration is explicitly implemented and tested.
3. Affected automated tests pass.
4. `npm run build` succeeds when source/build behavior changed.
5. Generated `docs/` is refreshed when deployable source changed.
6. Visually meaningful UI changes are inspected at desktop and phone widths.
7. No accidental page-level horizontal overflow, clipping or inaccessible touch-only behavior was introduced.
8. Security invariants still hold for cloud/auth/database changes.
9. No unrelated refactor or dependency was introduced without a concrete benefit.
10. The final report distinguishes what was actually verified from what remains unverified.

## Local design workspace

The three current alternatives are editable in `designs/src/`. They reuse the real application/domain modules in `src/`. `designs/comparison.html` is the source of the comparison page. `designs/screenshots/` holds visual references.

- `npm run build:designs` generates `previews/`; do not edit the generated assets to implement design changes.
- `npm start` serves the comparison and variants on localhost:8770.
- `npm run start:site` serves the main application on localhost:8771.
- `npm run test:designs` starts its own temporary local server and verifies all three interfaces with isolated browser profiles. Results go to `test-results/designs/`.
- Read `CURRENT_WORK.md` before continuing. No design has been selected for publication yet.
- Use the narrowest relevant build/tests for routine changes. Do not create ZIP archives, release packages or standalone release candidates unless the user directly requests them.
