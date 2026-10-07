# UI design contract

## Product identity

This application is a learning/productivity control system for repeated daily use. It should feel technical, compact, calm and deliberate.

The visual design should help the user answer quickly:
- What should I do next?
- What have I completed?
- What is blocked and why?
- What evidence/checkpoint is missing?
- Is my progress safely saved/synchronized?

## Hierarchy

Prefer this hierarchy:

1. Current state / next action.
2. Active learning work and roadmap phases.
3. Checkpoint/evidence/readiness state.
4. Progress and supporting metrics.
5. Secondary tools/history/career data.
6. Decorative detail.

Do not let decoration push the working controls below the fold unnecessarily.

## Existing application structure

Important surfaces include:
- persistent desktop sidebar / mobile drawer;
- topbar search and global actions;
- overview/dashboard;
- roadmap board and mini-map;
- checkpoints/evidence;
- parallel/project/resource sections;
- no-AI, mistakes, activity and interview tooling;
- career/vacancy tracking;
- history/snapshots/import/export;
- cloud dialog/status.

A redesign may reorganize presentation, but should preserve task discoverability and semantics.

## Density

This is not a low-information marketing interface. Reasonable information density is desirable.

Prefer:
- compact labels and controls;
- clear section grouping;
- predictable alignment;
- stable component geometry;
- progressive disclosure only where it reduces genuine overload.

Avoid excessive empty space that increases scrolling without improving comprehension.

## Cards and surfaces

Cards are acceptable for meaningful self-contained units already present in the product, but do not wrap every section inside another rounded surface.

Avoid:
- card-inside-card nesting without functional reason;
- every toolbar/filter/header becoming a floating card;
- bento composition solely because multiple sections exist;
- shadows + borders + tinted backgrounds on every component simultaneously.

## Color

The project supports dark and light themes. Keep status/accent colors semantic and readable in both.

Do not default to generic AI/SaaS aesthetics such as:
- purple/blue gradient identity;
- neon cyan/purple on navy everywhere;
- decorative aurora/glow/orb backgrounds;
- glassmorphism used as a default surface treatment.

A gradient or special visual effect is acceptable only when it has a concrete product/brand purpose and remains readable/accessibly contrasted.

## Typography

Use typography to establish hierarchy, not to simulate a landing page.

Avoid giant hero headlines in working application surfaces. UI labels, controls, status, tables/lists and phase content should remain compact and scannable.

Prefer specific product copy over generic marketing language.

Good:
- `Синхронизировано`
- `Следующее действие`
- `Checkpoint не закрыт`
- `3/4 practice`

Avoid filler such as:
- `Unlock your potential`
- `Supercharge your learning journey`
- `Everything you need in one place`

## Controls

Use conventional controls for conventional actions. Existing icon/text conventions may be refined, but important actions must remain understandable.

Required interaction states when relevant:
- default;
- hover where available;
- keyboard focus;
- active/selected;
- disabled;
- loading/busy;
- empty;
- error;
- success.

Do not make controls shift neighboring content when a status label changes.

## Accessibility

Preserve or improve:
- semantic headings/landmarks;
- labels for inputs;
- keyboard reachability;
- visible focus;
- sufficient contrast;
- reduced-motion preference;
- status announcements where appropriate;
- non-hover access to required functionality.

## Responsive requirement

Phone support is a product requirement, not an optional polish pass.

For any substantial layout/UI change, read `RESPONSIVE_UI.md`. A desktop screenshot alone is insufficient verification.

## Anti-slop review

Before finishing a substantial UI change, ask:

1. Could this screenshot be mistaken for a generic generated SaaS demo?
2. Which visual decisions specifically support a learning-control application?
3. Did any gradient, glow, card, badge, huge heading or animation appear without a functional reason?
4. Is the next useful action easier to find than decorative content?
5. Did the redesign preserve information density and working functionality?
6. Does it still work naturally at phone width?

If the answer to the first question is yes, revise rather than adding more decoration.
