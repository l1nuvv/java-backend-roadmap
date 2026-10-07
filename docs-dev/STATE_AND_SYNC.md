# State and synchronization contract

This document protects user progress. Read it before changing persistence, import/export, snapshots, cloud merge, authentication or synchronization.

## Persistent local state

Current schema:

```text
schemaVersion = 3
```

Stable localStorage keys:

```text
javaRoadmapV3
javaRoadmapV3Snapshots
javaRoadmapV3AutoBackup
```

Cloud code uses additional keys prefixed with:

```text
javaRoadmapCloud:
```

Do not rename these keys casually. A rename without migration makes existing progress appear lost.

## Current default-state families

The persisted state currently contains these top-level fields:

```text
schemaVersion
mode
theme
focus
zoom
phaseStatus
mastery
practice
evidence
phaseCollapsed
checkpoint
days
gates
skills
resources
blocker
next15
today
noai
mistakes
activity
career
careerMeta
vacancies
market
aqa
finalExam
lastSavedAt
```

`validateImport()` is deliberately defensive. Keep validation aligned with any deliberate schema extension.

## Compatibility

`migrate()` currently accepts schema 2 and 3 imports and normalizes them to schema 3. It also retains unknown historical top-level data through object spreading, while normalizing known nested defaults such as `market` and `careerMeta`.

Do not delete historical data just because current UI no longer displays it unless the task explicitly requires a destructive migration.

## Local write behavior

`src/app.js`:
- loads `javaRoadmapV3` through `migrate()`;
- blocks normal overwrite if the existing stored value cannot be safely loaded;
- validates before writing;
- creates an automatic backup of the previous stored value before relevant replacements/writes;
- stores a fresh `lastSavedAt`;
- emits `roadmap:saved` after a successful write.

A storage failure should leave the user with a clear recovery path rather than silently replacing corrupt/unreadable data.

Before a normal write, the app compares the stored raw value with the last value it loaded or successfully wrote. If another tab has already changed it, the app blocks stale writes and cloud sync, retains the current in-memory edits, and offers export/reload or an explicitly confirmed import. This is a read-before-write guard, not an atomic localStorage CAS; an exactly simultaneous inter-tab race is not guaranteed to be serialized.

## Local-only cloud fields

`src/cloud/merge.js` currently excludes these fields from cloud progress:

```text
theme
focus
zoom
phaseCollapsed
lastSavedAt
```

These settings remain device-local when cloud state is applied.

If changing this list, consider backward compatibility and multi-device UX explicitly.

## Three-way merge model

Cloud synchronization uses a base/local/remote merge, not blind last-write-wins.

Conceptually:

```text
             local
               \
                \
base ------------ merge -> merged state
                /
               /
            remote
```

Rules in `merge()`:
- if local equals remote, keep it;
- if local equals base, take remote;
- if remote equals base, take local;
- plain objects are recursively merged;
- dangerous prototype keys are ignored;
- simultaneous incompatible scalar/array changes produce a conflict path;
- conflict resolution chooses local or remote only for conflicting paths while unrelated changes remain merged.

Arrays are currently treated as one value for conflict purposes. Do not replace this with a naive object spread or last-write-wins merge.

## First synchronization

When no local cloud metadata/base exists:
- if cloud already contains progress, the user must explicitly choose local or remote;
- if local progress belongs to another cloud owner/account, the user must explicitly choose what to do;
- local data is protected by backup behavior before replacement.

Do not silently choose a side in these cases.

## Optimistic revision contract

The cloud row has a `revision`.

Writes call `save_roadmap_progress(expected_revision, new_payload)`.

The database writes only when the supplied expected revision matches the current row, or when the first insert uses expected revision 0. The controller retries after rereading when another client wins the race.

This prevents a stale device from blindly overwriting a newer device.

## Changes during upload

Edits made while a cloud upload is in flight must remain local and be sent on a later pass. Do not simplify the sync loop in a way that drops these edits.

## Sync triggers

Current synchronization behavior includes:
- debounce after local save;
- explicit "sync now";
- browser `online` event;
- browser focus;
- returning to a visible tab;
- periodic sync while visible (15 seconds).

Token refresh is coordinated through Web Locks when available. Logout/session changes propagate across tabs through the storage event.

## Safe-change checklist

For a state/sync change, verify as applicable:
- old schema 3 local data still loads;
- supported older imports still migrate;
- invalid/prototype-polluting imports remain rejected;
- independent offline changes merge;
- same-field conflicts require explicit choice;
- arrays do not silently lose rows;
- concurrent cloud writes retry safely;
- edits during upload survive;
- reload retains local state and session behavior;
- expired sessions refresh without dropping queued local progress.
