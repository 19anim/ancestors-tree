# ADR 0007: One `applyOp` for browser and server, an operation log and optimistic edits

- Status: Accepted
- Date: 2026-11-13

## Context

A family tree is edited by several relatives, often on weak mobile connections. An edit must show at once, the server must refuse anything that breaks a rule (a cycle, deleting someone who still has children), two people saving at the same time must not overwrite each other, and P6 needs undo, a change history and "revert to this point". Rules written twice, once in the browser and once in the API, would drift apart.

## Decision

**One pure function.** `applyOp(tree, op) → { tree, inverse }` in `packages/shared/src/tree/` (imported as `@ancestors-tree/shared/tree`) holds every business rule. It is immutable with structural sharing: it copies only the records it changes. It throws `OpError` with a code (`PERSON_HAS_CHILDREN`, `UNION_HAS_CHILDREN`, `CYCLE`, …) when a rule is broken. The browser runs it before sending, so a broken rule is explained at once without a round trip; the API runs the same function again and answers `RULE_VIOLATION` (422) with the code as `reason`. A malformed id is not a rule: it fails request validation (`VALIDATION_ERROR`, 400).

**Every change is an operation with an inverse.** `addPerson`, `updatePerson`, `deletePerson`, `addUnion`, `updateUnion`, `deleteUnion`, `setParents`, `setProgenitor` and `batch` (1–500 ops, not nested); `restorePerson`/`restoreUnion` exist only as inverses. The inverse is computed from the state before the change, so applying it restores the tree exactly. A `batch` inverse is the inverses in reverse order. A family tree holds at most 5,000 people (`TREE_FULL`).

**An append-only log and a version per family tree.** `POST /api/clans/:id/ops { op, baseVersion }` runs in one MongoDB transaction: compare `Clan.version` with `baseVersion` (409 `VERSION_CONFLICT` if different), load the tree, run `applyOp`, write only the Person and Union documents whose object changed (found by reference, thanks to structural sharing), insert the Operation `{ seq: version + 1, op, inverse }` and set `Clan.version = seq`. The unique `(clanId, seq)` index turns any race the version check misses into a duplicate key, also answered with 409. `GET /tree` reads in a snapshot transaction, so the version always matches the data. `GET /ops?since=` returns the operations after a version, oldest first, at most 500 per call.

**Optimistic edits in the browser.** The Zustand store keeps the confirmed tree and version, a queue of pending ops and the optimistic tree (confirmed tree plus pending ops). `apply(op)` never throws: it returns `{ ok: true }` or `{ ok: false, reason }`, where `reason` is an `OpError` code or `NOT_LOADED` (no tree is loaded yet). Ops are sent one at a time, each with the version the previous one produced. How a send ends:

- **Network failure, 429 or 5xx:** the queue is kept and the send is retried with backoff (1 s, 2 s, 4 s, … up to 30 s).
- **409, or a 2xx answer that cannot be read (`INVALID_RESPONSE`):** the store reloads the whole tree, drops every pending op and shows a `reloaded` notice. The op may or may not have been saved, so the server's tree is the only truth. This is not a rejection, so nothing is rolled back one op at a time. If the reload itself fails (network, 429, 5xx, an unreadable answer), it is retried with the same backoff, never in a tight loop; the pending ops stay until a reload succeeds.
- **Other 4xx:** the refused op is dropped, the user is told why (`rejected` notice) and the remaining ops are replayed on the confirmed tree. Ops that no longer apply without it (for example an "add spouse" for a person whose `addPerson` was refused) are dropped too, and the notice says how many.
- **401:** the queue stops and keeps every pending op; a `signedOut` notice is shown. Sending resumes on the next `apply()` or `load()` of the same tree, after the user signs in again.

**Unsent edits are never lost silently.** The store keeps sending in the background while the user visits other pages, so most navigation loses nothing. Pending ops can be lost in seven ways. Three ask first, through `UnsentChangesGuard` (mounted once by the app shell) and the user menu. Three tell the user afterwards, in a notice shown on every page until dismissed (`TreeNoticeBanner`, mounted by the app shell). One, Google sign-in, is a warning on the login and register pages before the loss, not a notice after it:

- opening another tree's page asks in a dialog (`load` of a different tree would drop the queue; if it ever does, it shows a `discarded(count)` notice);
- closing or reloading the tab triggers the browser's `beforeunload` prompt;
- signing out asks before it goes ahead (and the store is reset before the logout request is sent);
- a 409 reloads the tree and tells the user afterwards (`reloaded`);
- a refused op and the ops that depended on it are dropped, and the notice says how many (`rejected`);
- an account change resets the store and tells the user how many changes were dropped (`discarded(count)`);
- signing in with Google after a session expiry is a full-page redirect that drops the in-memory queue, so the login and register pages warn the user beforehand and suggest email and password (persisting the queue is planned for P6).

A notice stays until the user dismisses it, and it survives `load()` of another tree; a later account change replaces it with a `discarded` one. `resetTreeStore()` clears it: after sign-out, after the guard's "discard and open", and when the tree it belongs to is deleted. It carries the `clanId` of the tree it belongs to; when another page or tree is on screen, the banner says it is about "the family tree you were editing". When the same account signs in again after a `signedOut` notice, the store clears it and sends the kept ops (`resumeAfterSignIn`).

The guard never asks for Members, Settings, the `/clans` list or `/login`. When the signed-in account changes, the app shell resets the store (`resetTreeStore`), so one person's unsent edits are never sent as another's in this tab. Deleting a tree calls `discardTreeStateFor(id)`, which resets the store only when it holds that tree.

**Deleting a family tree.** `DELETE /api/clans/:id` (Owner only, 204) removes the Clan and every clan-scoped collection: Person, Union, Operation, Invite, ClanRemoval and Membership. The dialog asks the Manager to type the tree's name; the comparison is Unicode NFC-normalised, so a name typed with composed or decomposed Vietnamese diacritics both match.

**Bundle.** `TreePage` is loaded lazily (`React.lazy`), so React Flow stays out of the main bundle and is fetched when a tree page opens.

## Consequences

- The browser and the API cannot disagree about a rule, and the rules are tested once, with property tests that check every inverse.
- The log gives P6 undo (send the inverse), history and "revert to this point" without another data model.
- Ids are generated in the browser (ObjectIds), so a new card has its final id before the server answers; the API checks the id format with Zod and that the id is unused (`DUPLICATE_ID`).
- In P5, a 409 throws away unsent edits after telling the user. P6 replaces the reload with the rebase of spec §6.3 (fetch the missed ops, replay the pending ones on top).
- The guard is the only protection against losing pending ops, so any new way to empty the queue must go through it or tell the user.
- A write loads the whole tree (up to the 5,000-person design limit). That is fast enough for P5 and P8; P7 measures it.
- Every write is a transaction, so MongoDB must run as a replica set: Atlas does, and tests use `MongoMemoryReplSet`.
