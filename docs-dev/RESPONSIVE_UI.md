# Responsive and mobile UI contract

Phone/tablet usability is required for this project. Do not treat mobile as a mechanically stacked desktop layout.

## Current breakpoints

`src/styles.css` currently has meaningful responsive behavior around:

```text
1180 px
880 px
560 px
```

Do not change breakpoints casually. First inspect why an affected component currently switches at that width.

At <= 880 px the sidebar becomes a drawer and multiple grids collapse. At <= 560 px the topbar/actions become more compact and additional grids collapse.

## Required verification widths

For a visually meaningful UI/layout change, inspect at least:

```text
360 x 900   small phone
390 x 900   common phone
768 x 900   tablet / narrow layout
1440 x 900  desktop
```

Height may be adjusted when a flow specifically needs it, but do not verify only one wide desktop size.

If the environment supports browser automation/screenshots, use them. If a viewport was not actually inspected, do not claim it was verified.

## Page overflow rule

The document itself should not gain accidental horizontal overflow:

```js
document.documentElement.scrollWidth <=
document.documentElement.clientWidth
```

Exception: a component may intentionally own horizontal scrolling when that interaction is part of its design. The roadmap board is an example of a horizontally navigable working surface.

Keep component scrolling scoped; do not make the entire page drift horizontally because one table/card/control is too wide.

## Touch targets

On narrow/touch-oriented layouts, interactive controls should generally provide about a 44 x 44 CSS px target where practical.

This especially applies to:
- drawer/menu controls;
- icon buttons;
- roadmap mini-map nodes;
- mode switches;
- navigation rows;
- common phase/checkpoint actions.

The existing stylesheet already enforces 44 px minimum dimensions for several mobile controls. Preserve or improve that behavior.

## Hover is enhancement only

Required functionality must not depend on `:hover`.

Anything that is only revealed on hover on desktop must have a usable touch/keyboard path on phone/tablet.

Tooltips may explain unfamiliar icons, but the underlying action must remain discoverable without a mouse.

## Navigation

At narrow widths:
- the sidebar/drawer must open and close predictably;
- the closed sidebar must not intercept focus/pointer interactions invisibly;
- the backdrop must correctly separate the drawer from page content;
- important sections must remain reachable;
- opening the drawer must not create accidental body overflow.

## Topbar and global actions

The topbar has many global actions. On narrow screens:
- controls may become compact or horizontally scroll within their own action strip;
- primary actions must remain reachable;
- action labels/icons must stay understandable;
- search must remain usable;
- dynamic save/cloud status must not break layout;
- do not hide functionality merely to make the screenshot cleaner.

## Forms and dialogs

For inputs/dialogs on mobile:
- inputs must fit their containing width;
- labels must remain associated and readable;
- dialogs must stay inside the viewport;
- dialog content may scroll vertically when necessary;
- long email/error/status text must wrap;
- buttons must remain reachable without page-level horizontal scrolling;
- on-screen keyboard use should not make the flow impossible to complete.

The cloud dialog already uses a viewport-constrained width and max-height. Preserve these properties when redesigning it.

## Dense content

Do not solve every mobile problem by hiding information. Prefer:
- one-column stacking for truly independent sections;
- scoped horizontal scrolling for intrinsically wide working surfaces;
- wrapping long text;
- reducing nonessential spacing;
- moving secondary controls without removing them;
- concise labels/icons for known global actions.

## Tables / grids / board-like UI

When data is intrinsically wide, choose deliberately among:
- scoped horizontal scrolling;
- responsive column reduction;
- stacked item layout;
- detail disclosure.

Do not force `min-width` content to expand the whole document.

## Safe areas and fixed/sticky UI

If introducing fixed/sticky elements, verify they do not cover:
- form fields;
- modal actions;
- bottom content;
- native browser UI on small devices.

Use fixed positioning only where it materially improves a repeated task.

## Motion

Respect `prefers-reduced-motion`. Existing rules disable transitions/animations under reduced-motion; do not bypass them with JS-only animation.

## Mobile definition of done

For a substantial UI change, all applicable checks must pass:

- 360 px: no accidental document overflow, clipping or unreachable primary action;
- 390 px: same, with realistic text/content;
- 768 px: layout transition is coherent rather than awkwardly half-desktop;
- 1440 px: desktop density and alignment remain intentional;
- drawer/navigation remains usable;
- search and top actions remain reachable;
- dialogs/forms remain within viewport;
- touch targets remain reasonable;
- keyboard focus remains visible;
- required actions do not depend on hover;
- intentionally scrollable regions scroll themselves rather than the body.

Browser tests currently include a page-overflow/cloud-dialog check at widths 360, 390, 768 and 1440. Extend those checks when a new responsive regression risk is introduced; do not assume the existing single overflow assertion covers every visual behavior.
