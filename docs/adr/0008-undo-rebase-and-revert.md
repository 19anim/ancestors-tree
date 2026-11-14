# ADR 0008: Undo as new operations, rebase on conflict, and reverts from the history

- Status: Accepted
- Date: 2026-11-14

## Context

ADR 0007 gave every change an inverse and an append-only log, but on a 409 the browser reloaded the whole tree and dropped every unsent edit, an expired session followed by a Google sign-in lost the in-memory queue, and nothing used the inverses yet. P6a adds undo and redo, a history page with reverts, and sync that keeps edits when two relatives save at the same time.

## Decision

**The queue holds entries.** `pending` is a list of `PendingEntry { id, op, reverts?, revertsToSeq? }`. The local `id` ties an entry to its undo and redo steps and to an undo of it queued behind it. `reverts` names the change being undone: a seq once it is saved, otherwise the pending id, turned into the request's `revertsSeq` when the original gets its seq. Pure helpers (`features/tree/pending.ts`, `features/tree/rebase.ts`) replay entries on a tree and report what was kept, what was dropped and why, and the inverse each kept entry has on the new tree.

**Undo is a new operation.** The undo stack holds `{ op, inverse, ref }` for this user's changes in this tab, at most 100 steps, cleared on reload. Undo applies the inverse locally and queues it with `reverts`; it is never sent when it no longer applies ("Could not undo: <reason>", and the step leaves the stack). Redo applies the undone change again as a normal change, without `revertsSeq`. Every place where the queue changes also updates both stacks: a save names the step by its seq, a dropped entry leaves both stacks, a kept entry gets the inverse it has on the new tree.

**The toolbar and the board.** Editors and the Owner get ↶ and ↷ above the board, followed by the save status that every member sees. The buttons use `aria-disabled`, not `disabled`, so keyboard users can still reach them and read their tooltip when there is nothing to undo; Esc hides the tooltip. Ctrl/⌘+Z, Ctrl/⌘+Shift+Z and Ctrl+Y do nothing inside a dialog, a text field, a contenteditable element or a menu, and when there is nothing to undo or redo the key is left to the browser. The board is one tab stop before the cards: the arrow keys pan, `+`/`=` and `-` zoom, `0` fits the tree, and three zoom buttons follow the cards in the tab order (bottom right; React Flow's credit link moves to the bottom left). A card that gets focus off screen is centred at the current zoom. A newly added person is brought into view by the smallest pan at the current zoom, so the card the user acted from stays visible.

**Rebase instead of reload.** On `VERSION_CONFLICT` the store reads `GET /ops?since=` page by page (until a page holds fewer than 500 ops) and rebases: the missed ops go onto the confirmed tree, the queue is replayed on top, and what no longer applies is dropped with the `rejected` notice. Two cases are special. When the first missed op (the one right after the confirmed version) is from this account and equals the head of the queue, its answer was lost: it is confirmed with that seq, not replayed. A "Revert to this point" is dropped when any other missed op arrives, because it was built from the log at one version. The conflict counter belongs to the head entry: a different head starts again at 1, and the third conflict in a row on the same head reloads the whole tree. A gap in the log, a missed op that does not apply to the confirmed tree, or a success answer that cannot be read also reloads.

**Reverts from the history.** `GET /api/clans/:id/history?before=&limit=` lists operations newest first with the author's name, the stored inverse and the revert fields (50 per page, at most 100). The page reads the list again every time it opens and after each change this tab saves; a later read that fails keeps the list on screen with an inline alert and a retry, and "Show more" keeps keyboard focus in the list. "Revert" applies one stored inverse through the store, with `revertsSeq`, so it is optimistic, rebased and undoable like any edit; while that revert waits to be saved, its entry's button is disabled ("Reverting…"). "Revert to this point" (Owner only) flattens the inverses of every later change, newest first, into one op of at most 500 steps sent with `revertsToSeq`. Before it applies the revert, the dialog loads the tree again; it cannot be closed while that check runs, and a revert whose dialog went away is never sent. The store refuses it (`OUT_OF_DATE`) while anything is pending or when the tree is at another version; a refusal because of unsent edits has its own message ("Some changes are not sent yet…"), and after an `OUT_OF_DATE` refusal the plan is read again before the message shows. The server checks the range of both fields inside the write transaction and requires the Owner for `revertsToSeq`.

**Request size.** A large revert is one request. The API's JSON body limit is 1 MB; a larger body is answered `VALIDATION_ERROR` (400). The client treats every 4xx other than 401, 409 and 429 as a refusal, so a 400 or a 413 from a proxy drops the op with the `rejected` notice instead of retrying it.

**The queue knows its account.** The app shell tells the store the signed-in account. Every `POST /ops` carries `expectedUserId`; a middleware that runs before the clan-role check answers `IDENTITY_MISMATCH` (409), and the store stops and keeps the queue until it learns the account changed. The queue is mirrored to `sessionStorage` with the user, clan and confirmed version, restored for the same account (through the rebase when the tree moved on) and dropped with a notice for another account or unreadable data. Opening another tree's tree or history page asks first while edits are unsent. The login page's Google warning is gone.

## Consequences

- Two relatives editing at once keep both changes unless they really conflict; a conflict is explained per change instead of reloading everything.
- The log stays complete: undo, redo and reverts are ordinary operations, and the history says which change a revert undid.
- Undo depends on the inverses being exact, so the property tests now generate restore ops and check the person/union id overlap; a person's unions are capped at 100 so the inverse of a delete always fits one op.
- The undo stack does not survive a reload (the queue does). An Owner whose revert-to was refused prepares it again from the refreshed history.

**Known limits.**

- Revert labels in the history are advisory. The server checks that `revertsSeq` is at most the clan's version (and `revertsToSeq` below it), not that the op really is that change's inverse.
- When a rebase drops an undo, the original step's undo is removed as well: the step left the undo stack when it was undone and does not come back, although the change still stands. It can still be reverted from the history page.
- Steps that are already saved keep the inverse computed when they were applied. Only steps of pending entries get a new inverse after a rebase, so undoing an older saved change can overwrite a later edit by someone else to the same fields.
- The conflict counter is per head entry. A queue whose head keeps changing (each conflict drops or confirms the head) can rebase more than three times in a row; the third conflict on the same head reloads.
- History summaries read "author: change" ("Lan: thêm Nguyễn Văn Bình"), built from the names in the tree, or from the ops themselves when a person is gone.
- On mobile the toolbar keeps ↶, ↷ and the save status above the board. The bottom bar of spec §7.5 comes once the toolbar has more controls (roadmap, P6b or later).
