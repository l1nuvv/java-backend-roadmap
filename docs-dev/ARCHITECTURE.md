# Architecture

## High-level data flow

```text
src/data/roadmap.js
        |
        v
src/domain/progress.js
        |
        v
     src/app.js <------ src/state/schema.js
        |                       |
        |                       v
        |                  localStorage
        |
        +------ UI / events
        |
        +------ cloud controller
                    |
          +---------+----------+
          |                    |
          v                    v
   cloud/merge.js       cloud/transport.js
                               |
                               v
                           Supabase
```

The diagram describes responsibilities, not a requirement that every module imports every module shown.

## Module responsibilities

### `src/data/roadmap.js`

Static product/curriculum data and tracking classifications:
- phases and dependencies;
- topics and practice items;
- checkpoint/test content;
- hour estimates;
- setup topics;
- topic/skill/AQA tracking kinds;
- days/resources/skills/drill data.

This module should not access DOM, localStorage or network APIs.

### `src/domain/progress.js`

Pure domain calculations derived from roadmap data plus a provided state getter:
- topic readiness;
- knowledge/practice ratios;
- checkpoint validity;
- prerequisite status;
- effective phase status;
- remaining-hours estimates;
- next action;
- milestone/progress calculations.

Do not add DOM, storage or network side effects here.

### `src/state/schema.js`

Persistent data contract:
- schema version;
- storage keys;
- default state;
- migration;
- defensive import validation.

Any persisted shape change belongs here and must be considered a compatibility change.

### `src/app.js`

Browser application orchestration:
- load/persist local state;
- automatic backup before replacement/periodic writes;
- render/update UI;
- handle user interactions;
- emit `roadmap:saved` after successful persistence;
- expose a small app API to cloud code.

Avoid moving cloud protocol details into this file.

### `src/ui/learning-interface.js` and `src/ui/learning.css`

Shared learning layouts for the production Session and local Atlas/Session/Ledger previews. The UI adapter arranges the existing application controls, renders progress through the domain model, and handles screen/phase/work-step navigation. It owns no persistence or cloud protocol. The `roadmap:current` UI event selects the requested phase before the app scrolls/focuses it. Production uses `preview: false`, retains normal storage keys and mounts the cloud controller; previews keep their separate storage namespace and network-restricting CSP. Recovery warnings are outside screen-specific sections so they remain visible everywhere.

`src/ui/production.css` removes preview-banner spacing. `designs/src/` reuses the shared UI and keeps only preview entry behavior; production never imports the preview storage shim.

### `src/cloud/merge.js`

Pure deterministic state comparison/merge:
- recursive equality;
- three-way merge;
- conflict path collection;
- removal of local-only fields before cloud synchronization.

Arrays are scalar conflict units: conflicting list edits must not be silently row-merged unless a deliberately designed new merge model is introduced.

### `src/cloud/transport.js`

HTTP transport:
- Supabase request construction;
- auth header injection when requested;
- timeout handling;
- response-size guard;
- JSON/error normalization.

Keep product merge/state decisions out of transport.

### `src/cloud/controller.js`

Cloud/session orchestration:
- login/session restore;
- token refresh;
- cross-tab session updates;
- sync scheduling;
- first-sync choice;
- three-way merge and conflict flow;
- optimistic revision retry;
- application of cloud state while retaining local-only settings.

### `src/config.js`

Public browser configuration only. It must never contain service-role or secret credentials.

### `scripts/build.mjs`

Builds/minifies the source into `docs/` through esbuild. `docs/` is deployable output and retains current + previous hashed assets so cached HTML can still load during deployment transitions.

## Dependency direction

Prefer this direction:

```text
data -> domain
state -> app
(domain + state) -> app
merge -> cloud controller
transport -> cloud controller
app <-> cloud controller through the explicit app API/events
```

Avoid hidden cross-layer coupling such as:
- domain code reading localStorage;
- data modules mutating application state;
- transport deciding conflict semantics;
- generated `docs/` becoming an editable source layer.

## Structural-change rule

Before changing module boundaries, first identify a concrete defect or repeated maintenance cost. Do not introduce a framework, state-management library, router or component system only to make the project look more conventional.
