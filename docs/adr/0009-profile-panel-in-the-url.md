# ADR 0009: The profile panel in the URL, profile edits as a diff, and dates that agree

- Status: Accepted
- Date: 2026-11-15

## Context

P5 opened an "Actions for X" dialog from a card and added people with names only. P6b adds the profile panel (read mode, then Edit), `DualDateInput`, date marks on the cards, "Add parent", a right-click card menu and arrow keys between relatives (spec §5, §7.6, §7.8, §8). That raises where the open profile lives, how unsaved form edits are protected alongside the unsent queue of ADR 0008, what a save sends, how far the server trusts a date's two calendars, and how keyboard users move across the board without losing the focused card.

## Decision

**The open profile lives in the URL (`?person=`).** Opening a profile pushes a history entry, switching to another person replaces it, and closing goes back when this tab opened it (otherwise it drops the parameter). Links, reloads and Back therefore all work. Cards get a stable `openPerson` through `OpenPersonContext`, so they need no router hooks and do not re-render when the URL changes. React Flow's `elementsSelectable` stays false: the selection is the URL, not a node's `selected`.

**Unsaved profile edits share the blocker with unsent changes.** React Router allows one `useBlocker`, so `UnsentChangesGuard` owns both reasons, and a small Zustand flag (`profileDraft.ts`) tells it the form is dirty. Sign-out asks about unsaved profile edits too. When the form goes away while dirty anyway (the person is removed, or the tree reloads), the user is told.

**Saving sends the difference between two outputs of the same Zod schema**: the values when the form opened, and the values at save. Both pass through `ProfileFormSchema`, so a stored date without its derived side does not count as a change, and every op carries trimmed, parsed values (the P5 T1 carry-over), which `sameOp` can match against the server's stored copy. The diff is one `updatePerson` op, so one undo step, and it never overwrites someone else's change to another field.

**`DateInfoSchema` refuses a derived side that is not the conversion.** Client and server share the schema, so not even a hand-written op can store two calendars that disagree.

**Tree traversal is shared logic.** `relativeOf(tree, id, 'parent' | 'child' | 'prev' | 'next')` lives in `packages/shared/src/tree/relatives.ts`, next to `classifyLineage`; the web keeps only the key mapping (`features/tree/relativeNav.ts`). Siblings are filtered to blood relatives and an in-law steps sideways to the spouse, so an arrow key never lands on someone in the "Loose photos" tray.

**A card is an empty button over the Polaroid.** On the board and in the tray, the card is a `<button data-person-open>` with no content, laid over an `aria-hidden` Polaroid. Its accessible name then matches what the card shows (WCAG 2.5.3), without the photo's initials and date line as stray text. `data-person-open` is where focus returns when the panel or a dialog closes. For editors the same button is the trigger of the right-click menu (Radix `ContextMenu`), and the menu returns focus to it.

**A focused card is centred against where the view will land.** Centring calls `setViewport(centredOn(...))` with the board size measured at that moment, not `setCenter`, which uses React Flow's stored size and lags a frame behind when the profile column narrows the board. While a reveal is still animating, "on screen" is judged against the viewport it will land on, so quick arrow presses never leave the focused card off screen (WCAG 2.4.11). A pan or zoom by the user clears the landing.

## Consequences

- A profile can be shared as a link and survives a reload; Back closes it on mobile.
- One blocker and one dialog cover both kinds of unsaved work, so there is no second prompt to keep in step.
- A server that receives a date receives one that agrees with itself; old data that does not parse is sent whole on its next save.
- Arrow-key traversal is pure and tested in `packages/shared` with the rest of the tree rules.
- "Add parent" is offered on blood members and on unlinked people, not on in-laws. If both parents become known while its form is open, saving refuses with the existing out-of-date message instead of moving the child to a new union.

**Known limits.**

- Radix opens the context menu after a 700 ms touch long-press. P6c's drag pickup is a long press of about 400 ms (spec §7.6), so the two gestures have to be reconciled there.
- There is one draft flag, so only one profile form can be dirty at a time; the panel shows one person, so this holds today.
