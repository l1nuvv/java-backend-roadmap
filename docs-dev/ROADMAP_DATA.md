# Roadmap data contract

`src/data/roadmap.js` is product data with persistent implications. Treat it as a domain model, not disposable display text.

## Stable phase identity

There are currently 13 phases:

```text
p0 p1 p2 p3 p4 p5 p6 p7 p8 p9 p10 p11 p12
```

Phase IDs participate in:
- mastery keys;
- practice keys;
- checkpoint state;
- evidence;
- dependency graph;
- UI element/data keys.

Do not rename, recycle or reorder IDs as if they were presentation-only labels. If an ID must change, design a state migration.

## Phase shape

Current phase objects use:

```text
id
num
cat
title
hours
deps
topics
practice
checkpoint
test
ai
```

`hours` contains the categories used by remaining-time calculations:

```text
theory
practice
project
dsa
interview
```

## Current dependency graph

```text
p0:  -
p1:  p0
p2:  p1
p3:  p2
p4:  p2
p5:  p0
p6:  p5
p7:  p1
p8:  p1, p2, p7
p9:  p5, p8
p10: p8, p9
p11: p8
p12: p8, p9, p10
```

Dependencies are enforced through valid prerequisite checkpoints, not just visual ordering.

## Tracking kinds

Phase topics are classified in `topicKinds` as:
- `setup` — environment/setup item with dedicated setup UI/verification;
- `concept` — conceptual mastery scale;
- `action` — practical action/independence scale.

`skillKinds` and `aqaKinds` similarly choose the correct mastery/action scale for other sections.

The code deliberately checks classification lengths. When adding/removing topics or skill items, update the corresponding kind arrays in the same change.

## Persistent tracking keys

Phase topic mastery uses keys like:

```text
p1:m:3
```

Phase practice uses keys like:

```text
p1:p:2
```

Changing list order can therefore move an existing user's stored value to a different logical item even if IDs stay the same.

### Consequence

Do not casually insert a new topic/practice item in the middle of an existing list. For an established phase, prefer one of these approaches:
- append when pedagogically acceptable;
- provide an explicit migration from old index keys to new index keys;
- introduce a future stable item-ID model as a deliberate schema change.

The same reasoning applies to indexed `skill:*` and `aqa:*` mastery keys.

## Checkpoint semantics

A phase checkpoint is valid only when, among other existing domain requirements:
- the phase exists;
- checkpoint is marked passed;
- all required topic mastery reaches the current readiness threshold;
- all practice is complete;
- evidence is non-empty;
- all checkpoint test tasks are true;
- prerequisite phase checkpoints are also valid.

Do not change checkpoint wording and assume it is presentation-only if the number/order of `test` tasks also changes persisted checkpoint arrays.

## Other data collections

The module also currently defines:
- 14-day plan data;
- resources;
- skill groups;
- interview/drill bank;
- AQA items.

Before changing an array that has corresponding persisted indexed state, search for its storage key construction and determine whether reordering is backward-compatible.

## Curriculum-edit checklist

Before editing roadmap content, classify the change:

**Text-only:** wording changes that preserve identity/order are usually low risk.

**Append-only:** often safer, but check denominators and readiness/progress calculations.

**Reorder/removal/insertion:** potentially changes meaning of existing indexed state; migration may be required.

**Dependency/checkpoint change:** changes what users can unlock/complete and should be treated as product/domain behavior.

**Hours change:** changes remaining-time estimates.

After meaningful curriculum changes, run domain/unit tests and inspect the affected phase in the browser.
