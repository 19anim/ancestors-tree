# ADR 0010: Shared relate rules, one change runner, and dragging with dnd-kit

- Status: Accepted
- Date: 2026-11-16

## Context

P6c lets editors change relationships four ways: dragging a card onto another, the "Change relationship…" dialog, **Cut** on a thread or a marriage knot, and "Move earlier" / "Move later" among siblings (spec §7.6). The same change can start from any of them, and the board must never offer a change the server would refuse. Dragging also has to share the board with React Flow's pan and zoom, on a mouse and on touch, and with the card menu that P6b put on the same card (ADR 0009 left its 700 ms touch long press as a known conflict).

## Decision

**One pure rule set, checked by `applyOp`.** `relate` in `packages/shared/src/tree/relate.ts` answers "make A the parent, spouse or child of B" and "put A before or after B"; `relationships.ts` holds the cuts, `detach` (a drop on the Loose photos tray) and the marriage status. Each answers an op, a follow-up question or a block with its reason. A change of several steps is built on a working copy (`Draft`) that runs each step through `applyOp`, and the web's `planChange` checks a single-step op by applying it, so the server's own checks (cycles, partner counts, limits) decide what is possible, and an `OpError` becomes a block with the same code. The rules are not repeated in the web app, so a drag and the dialog cannot disagree.

**One change runner in the web app.** `planChange` wraps every kind of change in one type, and one runner (`ChangeRunner.tsx`) carries out all of them, whichever way they came in. It asks the follow-up questions, then checks the answer again on the latest tree just before applying (`decide`). If the tree moved on since the user saw the answer (while dragging, or while a question was open) and the outcome differs, nothing is applied and the "tree has just changed" message shows. A change is one `batch` op, so one undo step, confirmed in a toast whose Undo works only while that change is the latest one. Blocked, out-of-date and failed changes are told in the same toast, so a drop on a crossed-out zone also ends there.

- "Change relationship…" is a modal that covers the toast, so the dialog repeats it: its own "Đã đổi: …" line with Undo under the same latest-change rule, and the runner's errors in its footer as well as in the toast.
- Focus never drops to the page. A toast button that goes away while it has focus (dismissed, or its change undone elsewhere) notices as it unmounts, and the runner moves focus to the changed card, or back to where it came from.

**Dragging uses `@dnd-kit/core`.** A mouse drag starts after 6 px; a touch drag after a 400 ms press with under 8 px of movement. The target is the droppable under the pointer (`pointerWithin`, ignoring droppables with no area).

- _Measuring._ dnd-kit measures the cards when a drag starts and when one mounts or resizes. A pan or zoom moves every card with a CSS transform and triggers none of those, so even `MeasuringStrategy.Always` left the zones where the cards had been. The board knows when its transform changes, so `BoardDrag` (`TreeBoard.tsx`) asks dnd-kit to measure again during a drag: at most every 100 ms while the view moves, and once more when it stops. The throttle bounds the cost on a large tree, and the last measure makes the drop exact.
- _The real pointer._ The zone, the edge pan and the drop read the pointer from window listeners in the capture phase (pointer, mouse and touch events), not from dnd-kit's delta, which also counts page scrolling since the drag began.
- _Edge pan and scrolling._ Near the board's edge it pans by time (the same speed at any refresh rate) and stops once the tree's edge is in view, so a drag cannot lose the tree. The window itself scrolls only vertically, in its top and bottom tenth, so the tray below the board can be reached without fighting the board's own pan.
- _No dnd-kit keyboard mode or announcements._ The keyboard way is the "Change relationship…" dialog, which offers the same changes with a search instead of steering a card across a large board. dnd-kit's announcements are English and silenced; the page's own polite status line says what the drop will do, in Vietnamese or English.

**Touch shares the board with panning.** The drag hooks live in a thin `CardDrag.tsx` wrapper around each card, which keeps the card itself from re-rendering on every drag event.

- The wrapper is `nopan` by default, so a mouse press on a card drags it instead of panning. A capturing `pointerdown` removes `nopan` for a touch, and for a mouse press beside the card's button (on its tooltip), so a swipe that starts on a card still pans the board.
- dnd-kit's activators are bound in the capture phase: React Flow's d3-zoom stops the propagation of the touchstarts it accepts, before React's bubbling handlers would see them.
- Once a touch drag is active, a native `touchmove` listener on the wrapper stops the event, so the board does not pan along under the finger. React's own handlers run too late for this, at the root.
- On touch the long press is for dragging only. The card prevents Radix's touch long press for its menu (and the `contextmenu` that a finger's long press fires); a keydown clears the "last press was a finger" flag, so Shift+F10 and the menu key still open the menu. The menu's actions stay in the profile panel's buttons.

## Alternatives considered

- **React Flow's own node dragging.** It moves nodes freely and stores their positions, while positions here always come from the layout (spec §7.4) and a drop changes relationships, not places.
- **`react-dnd`.** Its HTML5 backend uses the browser's drag events, which do not work with touch.
- **Pointer handling written by hand.** dnd-kit already handles the activation constraints, Esc to cancel, the drag overlay and collision detection.
- **Rules in the web app only.** They would duplicate the server's checks and drift from them; in `packages/shared`, built on `applyOp`, they cannot.

## Consequences

- One new dependency, `@dnd-kit/core`, used only by the tree page, which is loaded lazily (ADR 0007).
- The rules are shared and pure, so a future server-side "relate" endpoint or the AI import (spec §10) can reuse them, and they are tested in `packages/shared` with the other tree rules.
- Every way in gives the same answer, the same questions and the same Undo, because only the trigger differs.
- The nudge (P7) will add a display offset to the "near its place" drop, which today only cancels the drag.

**Known limits.**

- A drop made while the board is still panning may use card positions up to 100 ms old.
- Re-measuring reads every card's position; it has not been profiled on a tree of about 1,000 cards (P7).
- The "Đã đổi" toast can cover board cards at high zoom on a narrow board.
- Touch has been tested in emulation only. A pass on real devices is still due: the iOS callout and loupe, Android's long-press timing, the board drifting during the 400 ms hold, and a double tap on a card zooming the board.
