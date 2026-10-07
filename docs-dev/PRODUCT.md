# Product contract

## What this product is

Java Backend Roadmap is a personal learning-control application for progressing from Java fundamentals toward backend internship/junior readiness. It combines curriculum, progress tracking, checkpoints, evidence, practice, career tracking and optional cross-device synchronization.

It is not a content marketing site and not merely a checklist. Its central promise is that progress should represent demonstrated work rather than passive reading.

## Primary loop

The application should make this loop obvious and cheap:

1. See the current/next useful action.
2. Study or perform the action.
3. Record mastery/practice/evidence.
4. Complete checkpoint requirements.
5. Move to the next unlocked phase.
6. Preserve the result locally and, when signed in, synchronize it safely.

## Product priorities

When requirements conflict, prefer roughly this order:

1. User progress must not be lost or silently overwritten.
2. Current state and next action must be understandable quickly.
3. Checkpoint/readiness semantics must remain trustworthy.
4. Common actions must be fast on desktop and usable on phone.
5. Cloud sync must fail safely and preserve local edits.
6. The interface should stay coherent and visually restrained.
7. Decorative polish is secondary to the working learning flow.

## Interaction character

The product should feel:
- technical;
- compact;
- calm;
- explicit about state;
- optimized for repeated use rather than first-visit persuasion.

Do not optimize the interface around a hero section, feature marketing, testimonials, fake analytics or decorative storytelling.

## Existing capabilities to preserve

Important existing product behaviors include:
- 13 roadmap phases (`p0` ... `p12`);
- mastery/action levels and practice completion;
- prerequisite-aware checkpoints and phase locking;
- evidence requirements;
- next-action calculation;
- local persistence, snapshots and automatic backup;
- import/export validation;
- light/dark themes, focus mode and zoom;
- career/vacancy/no-AI/mistake/activity tracking;
- optional Supabase authentication and cross-device synchronization;
- conflict handling rather than blind last-write-wins;
- phone/tablet responsive behavior.

A redesign may change presentation, but it must not casually remove these working capabilities.
