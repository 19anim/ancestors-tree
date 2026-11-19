# ADR 0012: Tree themes in the tree state, and my own on the side

- Status: Accepted
- Date: 2026-11-19

## Context

Spec §13.4 lets a family dress its board: the surface, the parent–child line, the marriage knot, the card frame and the fastener. It also lets each member pick a look that only they see.

- The family's look must undo, sync and show in the history like any other edit.
- A member's own look must not be an edit at all, and viewers may have one too.
- Switching a theme must not re-run the layout, and must not touch the CSP.

## Decision

**The family's theme lives in the tree state.** `TreeState.theme` is changed by a `setTreeTheme { changes }` op. A null value resets that part to the default, and the inverse holds the previous values. The Clan document stores the theme in the op's transaction. A surface pick sends its matching fastener with it.

**A card's own style is `Person.cardStyle`**, set and cleared (null) through `updatePerson`.

**My own choices are a `ViewPreference` document per member and clan**, read and written whole with `GET` and `PUT /clans/:id/view-preference`. Zod checks them: known options only, ObjectId keys, at most 5,000 cards. A save prunes the cards of people no longer in the tree, and deleting the clan deletes them. The client keeps them in TanStack Query. The board changes at once, and one PUT goes about 500 ms after the last pick. Saves run one at a time, so the last one wins. There is no undo; a failed save shows an error with a retry.

**One pure resolver in `shared` picks each part**, in this order: my choice for this card, my choice for the tree, the card's own style, the family's theme, then the default.

**Rendering is data attributes and CSS variables.** The board and each card carry data attributes; `tokens.css` maps them to CSS variables for light and dark, drawn with CSS patterns only. Every frame and surface is contrast-tested. Nodes stay memoised, and a theme switch does not re-run the layout.

## Alternatives considered

- **The family's theme as a plain Clan field behind its own route.** No undo, no sync and no history.
- **My own choices in `localStorage`.** Lost across devices, and no viewer could keep one.
- **My own choices as ops.** Other members would replay them and see them.
- **Background images for the surfaces.** New hosts or inline data in the CSP, and more bytes to load.

## Consequences

- One more collection, and one more document per member who decorates.
- Removing a member keeps their `ViewPreference`; deleting the clan removes them all.
- `cardStyle` changes still re-run the layout, like any person edit; tree theme switches do not.
- P10's exports and share links must draw the family's theme, never the viewer's own (the rule of spec §13.4, recorded here for P10).
- `PUT /view-preference` has no expected-version check, so when two of my own devices save at once, the last write wins. This is acceptable: it is only my own look.

## Decisions taken during implementation

- Picking the value already in effect does nothing, like a radio button (the user's decision, 2026-11-19).
- Card picks from "Decorate this card…" and from the profile go through the Decorate panel's card target, so the merged style and the no-op guard are the only path that sends a change.
- "Decorate" from the card menu opens from the menu's `onCloseAutoFocus` inside `flushSync`: otherwise Radix's focus trap takes focus back from the panel.
- When a banner button goes away, focus moves on: after "Về chủ đề chung" to the toolbar's "Trang trí" (else to `main`), after "Dùng cho cả họ" to "Về chủ đề chung".
- The banner buttons stay `size="sm"` (32 px). That meets the WCAG 2.5.8 minimum, but is below the 44 px touch ideal.
- The reply to a debounced save never overwrites a newer pick: a pick counter tells which reply is stale.
