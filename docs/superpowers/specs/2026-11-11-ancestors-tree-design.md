# AncestorsTree — Design Spec

> Date: 2026-11-11 (rev. 2026-11-12) · Status: awaiting review
> Personal goal: a portfolio project that demonstrates advanced React skills on a MERN foundation and has real users.
> Budget: ~10–15 hours/week × 8 weeks.
> 🇻🇳 Vietnamese version: [2026-11-11-ancestors-tree-design.vi.md](2026-11-11-ancestors-tree-design.vi.md)

Terms in **bold** on first use are explained in [§19 Glossary](#19-glossary).

---

## 1. Overview

A web platform (installable as a **PWA**) where **many families (clans)** build and co-edit their genealogy tree, automatically compute each year's **death anniversary (giỗ) from the lunar calendar**, and remind relatives ahead of time.

### Problem

- Genealogy records live in paper books or Excel files, kept by one person, hard to update, easy to lose.
- Death anniversaries follow the lunar calendar, so the solar date changes every year and relatives living far away forget.
- Existing genealogy apps have dated UIs, no collaborative editing, and slow down on large trees.

### Success criteria (measurable)

| # | Criterion | How it is measured |
|---|---|---|
| S1 | A 1,000-person tree pans/zooms at ≥ 55 fps on a mid-range laptop | Chrome DevTools Performance + React Profiler, seeded 1,000 and 2,000 people |
| S2 | Opening a 1,000-person tree: first full render < 1.5 s | `performance.mark` from data received to render complete |
| S3 | Lunar↔solar conversion matches 100% of Tết dates 1900–2100, and passes property-based + differential tests 1800–2400 (§9.1) | Vitest on CI |
| S4 | Test coverage ≥ 90% for `packages/shared`, ≥ 70% overall | Vitest coverage on CI |
| S5 | Lighthouse Performance, Accessibility, Best Practices ≥ 90 | Lighthouse CI |
| S6 | At least 1 real clan using it with ≥ 100 people in the tree | Production data |
| S7 | **PWA**: installable on Android (Chrome) and iOS (Safari ≥ 16.4, Add to Home Screen); last-opened trees viewable offline; web push works on both when installed | Manual test matrix + Playwright offline test |
| S8 | **Documentation**: user guide covers every main task with screenshots; 100% of API routes appear in the generated OpenAPI reference; every error code is documented | CI check compares registered Express routes against the OpenAPI document; error-code doc is generated from code |
| S9 | **Distinct visual identity**: passes the anti-slop checklist in §13.3 | Design review with `design-taste-frontend` + Playwright screenshots |

---

## 2. Scope

### In the 8 weeks

| Area | Features |
|---|---|
| Accounts | Email + password sign-up/sign-in, Google sign-in, password reset by email |
| Clans | Create a clan, choose the **progenitor** (head of the tree), invite members by link with role Owner / Editor / Viewer |
| Tree | Add/edit/delete people, add spouses (multiple marriages), add children (biological/adopted), sibling order, branches, generation numbers |
| In-laws | In-law nodes beside their spouse with birth-family info, optional "hide in-laws" view, configurable depth for daughters' descendants (§8) |
| Linked trees | Link any person to the same person in another shared family tree; hover shows an indicator + preview, click opens that tree focused on the person, with a breadcrumb back (§8.1) |
| Person profile | Name, aliases (taboo name, courtesy name, nickname), gender, birth & death dates (lunar and/or solar, or approximate year), burial place, photo, biography |
| ⭐ Large smooth tree | 1,000–2,000 people stay smooth; collapse/expand branches; minimap; diacritic-insensitive search with fly-to; level-of-detail rendering |
| ⭐ History & undo | Undo/redo with **toolbar buttons and keyboard shortcuts**, a "who changed what, when" timeline, revert any past change |
| Reminders | "Upcoming anniversaries" page (30 days) with explanatory notes for special cases; email + web push 7 days and 1 day before |
| AI-assisted import | Prompt template → user runs it in their own AI chat → pastes JSON back → validation → diff preview → approve before writing |
| Export & share | PNG/SVG/PDF export; public read-only link that hides details of living people |
| PWA | Installable, app icon/splash, offline read-only view of recently opened trees, install guidance (especially iOS) |
| Docs | User guide (in-app + repo), developer docs, generated API reference, error-code catalog, ADRs |

### Phase 2 (after week 8)

- Real-time collaboration: broadcast the same Operations over Socket.io, show who is online.
- Offline editing: persist the pending Operation queue in IndexedDB and sync when back online.
- Automatic link suggestions: detect likely matches between trees (same name, birth year, hometown) and suggest linking.
- Zalo reminders (ZNS requires a business account and is paid).
- BYOK: user enters their own AI API key and the app calls the model directly.
- Merge two trees; GEDCOM import/export.

### Out of scope

- Expanding in-laws' ancestors upward inside a clan tree (they appear as a node beside their spouse; see §8).
- Native iOS/Android apps (the PWA replaces them; no App Store / Play Store accounts needed).
- Payments.

---

## 3. Users & permissions

| Action | Owner | Editor | Viewer | Public link guest |
|---|:-:|:-:|:-:|:-:|
| View tree and profiles | ✅ | ✅ | ✅ | ✅ (living people's details hidden) |
| View upcoming anniversaries, subscribe to reminders | ✅ | ✅ | ✅ | ❌ |
| Add/edit/delete people, undo | ✅ | ✅ | ❌ | ❌ |
| AI-assisted import | ✅ | ✅ | ❌ | ❌ |
| Link a person to another tree (§8.1) | ✅ | ✅ | ❌ | ❌ |
| See linked-tree indicator & open the linked tree | ✅* | ✅* | ✅* | ✅* |
| See incoming links, block a source clan | ✅ | ❌ | ❌ | ❌ |
| View change history | ✅ | ✅ | ✅ | ❌ |
| Invite members, change roles | ✅ | ❌ | ❌ | ❌ |
| Create/revoke share links, change progenitor, clan settings, delete clan | ✅ | ❌ | ❌ | ❌ |

\* Everyone sees the indicator; opening the linked tree requires membership in the target clan or a still-valid share link (§8.1).

A User may belong to several clans with different roles (e.g. paternal and maternal families).

---

## 4. Architecture

```
ancestors-tree/                   (monorepo, pnpm workspaces)
├─ apps/
│  ├─ web/           Vite + React 19 + TypeScript (PWA)  → Netlify
│  ├─ api/           Express + TypeScript + Mongoose     → Render
│  └─ cron-worker/   Cloudflare Worker (~30 lines), triggers the daily reminder job
├─ packages/
│  └─ shared/        Used by both web and api:
│                    · Zod schemas (Person, Union, Operation, import JSON, API contracts)
│                    · applyOp() — applies one change to a tree
│                    · lunar/ — lunar↔solar conversion, anniversary computation
│                    · computeGenerations(), classifyLineage()
│                    · ERROR_CODES — the single source for error codes
└─ docs/             Developer docs, ADRs, user guide (see §14)
```

```
Browser / installed PWA ──HTTPS──▶ Netlify (static web + service worker)
     │                                 │  /api/*  (proxy, same origin)
     │                                 ▼
     │                          Render (Express API) ──▶ MongoDB Atlas
     │                                 │                 Cloudinary (images)
     │                                 ├──▶ Resend (email)
     │                                 └──▶ Web Push
     │
Cloudflare Worker Cron (07:00 VN, primary) ──▶ POST /api/internal/run-reminders
cron-job.org           (07:30 VN, backup)  ──▶ POST /api/internal/run-reminders
```

**Why does the web app call the API through Netlify's `/api/*` proxy instead of calling `*.onrender.com` directly?**
Authentication uses cookies. With the web on `netlify.app` and the API on `onrender.com`, the cookie is a **third-party cookie** and Safari/Chrome block it. A proxy rule in Netlify's `_redirects` makes the browser see a single origin:

```
/api/*  https://ancestors-tree-api.onrender.com/:splat  200
/*      /index.html                                     200
```

The second line lets React Router handle deep links on page refresh.

### Language conventions

- **English** for everything in the repository: code, identifiers, comments, commit messages, docs, API error codes and messages.
- **Exception — design docs are bilingual:** `*-design.md` (English, source of truth) and `*-design.vi.md` (Vietnamese mirror). Every change updates both in the same commit.
- **Vietnamese** is the primary UI language. All user-facing strings live in locale files (`apps/web/src/locales/vi.json`, `en.json`) via `react-i18next`; keys are English (`tree.toolbar.undo`). The in-app user guide ships in Vietnamese, with an English copy in the repo.
- The API returns `{ code, message }` with an English `message`; the client translates by `code`.

---

## 5. Data model (MongoDB)

```ts
// ===== Shared value types =====
DateInfo {                       // used for both birth and death
  solar?: Date,                  // Gregorian date, if known
  lunar?: {                      // Vietnamese lunar date, if known
    day, month, year,
    isLeap                       // true if the month is a leap month
  },
  approxYear?: number,           // only "around 1920" is known
  source: 'solar' | 'lunar' | 'approx'   // what the user actually entered (kept as ground truth)
}
// When one side is complete (day/month/year), the other side is derived.
// UI also shows the sexagenary (Can Chi) year: 1924 → "Giáp Tý".

// ===== Accounts & access =====
User {                           // a person who signs in
  email,                         // unique
  name, avatarUrl,
  googleId?,                     // Google sign-in
  passwordHash?,                 // password sign-in (bcrypt)
  locale: 'vi' | 'en',
  createdAt
}

Clan {                           // one family lineage, e.g. "Nguyễn family – Nam Định"
  name, hometown, description,
  ownerId,                       // the creating User = Owner
  progenitorId?,                 // Person at generation 1
  version,                       // current tree version (= seq of the latest Operation)
  settings: {
    daughtersDescendantsDepth: 0 | 1 | 2 | 'all',   // see §8 (default 1)
    showInLawsByDefault: boolean                     // default true
  },
  createdAt
}

Membership {                     // which User belongs to which Clan, with which role
  clanId, userId,                // unique (clanId, userId)
  role: 'owner' | 'editor' | 'viewer'
}

Invite {                         // invite link: /join/:token
  clanId, token,                 // 32 random chars
  role,                          // role granted on accept
  createdBy, expiresAt           // expires after 7 days
}

ShareLink {                      // public read-only link: /share/:token
  clanId, token,
  createdBy, expiresAt?,         // none = never expires
  revokedAt?                     // set when the Owner revokes it
}

// ===== Tree =====
Person {                         // a person in the genealogy (NOT a User)
  _id,                           // generated by the client (ObjectId) so optimistic updates are instant
  clanId,
  fullName,                      // "Nguyễn Văn Tư"
  aliases: string[],             // taboo name, courtesy name, nickname
  gender: 'male' | 'female',
  birth?: DateInfo,
  death: {
    isDeceased: boolean,         // false = living
    date?: DateInfo
  },
  parentUnionId?,                // which marriage this person was born into (→ Union)
  isAdopted: boolean,
  siblingOrder?: number,         // 1 = eldest
  branch?: string,               // lineage branch, e.g. "Eldest branch"
  birthFamily?: {                // only meaningful for in-laws (§8)
    surname?, fatherName?, motherName?, hometown?, note?
  },
  treeLink?: {                   // same person in another family tree (§8.1); any person may have one
    targetClanId,
    targetPersonId,
    access: 'membership' | 'shareLink',   // how the link was created
    shareLinkId?                          // when created from a share link
  },                             // index on treeLink.targetClanId (incoming-links list)
  photo?: { publicId, version },  // Cloudinary asset (§12, image storage); URLs are built on the client
  bio?, burialPlace?,
  createdAt, updatedAt
}

Union {                          // one marriage
  _id,                           // generated by the client
  clanId,
  partnerIds: personId[],        // 1–2 people (1 if only one parent is known)
  order: number,                 // 1 = first spouse, 2 = second...
  status: 'married' | 'divorced' | 'widowed'
}
// Mr. Tư has two wives → two Unions. A child points parentUnionId at the right Union,
// so we know "child of Mr. Tư and his first wife" vs "and his second wife".

// ===== Change log =====
Operation {                      // one entry in the change log (§6)
  clanId,
  seq: number,                   // 1, 2, 3... unique (clanId, seq)
  userId,                        // who made the change
  type: OpType,                  // see §6.1
  payload: object,               // data of the change
  inverse: Operation,            // the change that undoes this one
  revertsSeq?: number,           // set when this op reverts another op
  createdAt
}

// ===== Reminders =====
ReminderSub {                    // a User subscribed to anniversary reminders for a Clan
  userId, clanId,                // unique (userId, clanId)
  channels: ('email' | 'push')[],
  daysBefore: number[],          // default [7, 1]
  personIds: personId[]          // empty = all deceased people in the clan
}

PushSub {                        // one device/browser that allowed notifications
  userId, endpoint, keys: { p256dh, auth }
}

ReminderLog {                    // "sign-off sheet" that prevents duplicate sends (§9.4)
  subId, personId,
  lunarYear,                     // anniversary of which lunar year
  daysBefore,                    // which reminder milestone
  status: 'sending' | 'sent',
  createdAt
}
// unique index (subId, personId, lunarYear, daysBefore)
```

**Derived, never stored:**
- **Generation number** — `computeGenerations()`: the progenitor is generation 1, children are generation 2, and so on; a spouse shares their partner's generation.
- **Lineage class** — `classifyLineage()` returns `'blood' | 'in-law' | 'unlinked'` (§8).
- People not connected to the progenitor are listed under "Not yet linked" so users can attach them.

**Design limits:** up to 5,000 people per clan. The whole tree loads in one request (~2 MB uncompressed for 2,000 people).

---

## 6. Operation model (the change log)

### 6.1 Operation types

| type | payload | inverse |
|---|---|---|
| `addPerson` | the full new Person | `deletePerson` with that id |
| `updatePerson` | `{ id, changes }` (changed fields only) | `updatePerson` with the previous values of exactly those fields |
| `deletePerson` | `{ id }` | `restorePerson` with a snapshot of the person + any Unions removed with them |
| `addUnion` | the new Union | `deleteUnion` |
| `updateUnion` | `{ id, changes }` | `updateUnion` with previous values |
| `deleteUnion` | `{ id }` | `restoreUnion` with a snapshot |
| `setParents` | `{ personId, parentUnionId \| null }` | `setParents` with the previous value |
| `setTreeLink` | `{ personId, treeLink \| null }` | `setTreeLink` with the previous value |
| `batch` | `{ ops: Operation[] }` (used by AI import) | `batch` of the inverses in reverse order |
| `restorePerson` / `restoreUnion` | full snapshot | `deletePerson` / `deleteUnion` — produced only by undo, never sent directly by the UI |

Person/Union `_id` values are generated by the client. The server checks they are valid ObjectIds and not already used; otherwise it returns `RULE_VIOLATION`.

**Business rules** (enforced by `applyOp`, which throws `OpError`):
- A person who still has children cannot be deleted (detach or move the children first). Deleting a person also deletes Unions where they were the only partner.
- `parentUnionId` must reference an existing Union in the same clan.
- No cycles (nobody can be their own ancestor).
- The progenitor cannot be deleted until another progenitor is chosen.

### 6.2 Write flow

```
Client                                         Server
──────                                         ──────
op = { type:'addPerson', payload:{...} }
tree = applyOp(tree, op)   ← screen updates IMMEDIATELY (optimistic update)
pending.push(op)
POST /api/clans/:id/ops { op, baseVersion: 42 } ─▶ requireAuth → requireRole('editor') → validate(Zod)
                                               withTransaction:
                                                 clan.version !== 42 ?  → 409 VERSION_CONFLICT
                                                 tree = loadTree(clanId)
                                                 applyOp(tree, op)      ← same function; throws on rule violation
                                                 write Person/Union
                                                 Operation.create({ seq: 43, ... })
                                                 clan.version = 43
                                     ◀──────── 200 { seq: 43 }
pending.shift(); version = 43
```

- **Transaction**: writing Person/Union + writing the Operation + bumping the version either all succeed or none do.
- The client sends pending ops **one at a time** (a queue), never in parallel, to preserve order.

### 6.3 On 409 (someone else saved first)

```
1. GET /api/clans/:id/ops?since=42      → receive op 43 (another user's)
2. tree = last confirmed tree (version 42)
3. tree = applyOp(tree, op43)           → now identical to the server
4. for each op in pending:
     try tree = applyOp(tree, op)
     on error → drop that op + toast "Could not save: <reason>"
5. resend pending with baseVersion = 43
```

Retry at most 3 times; after that, reload the whole tree and tell the user.

### 6.4 Undo / redo / revert

- **Toolbar buttons** (always visible on the tree page, desktop and mobile): ↶ Undo and ↷ Redo icon buttons with tooltips that show the shortcut ("Undo (Ctrl+Z)"), disabled when the stack is empty, and a badge with the description of the next undo ("Undo: add Nguyễn Văn Bình"). Next to them, a save-status indicator: *Saved* / *Saving…* / *Unsaved (offline)*.
- **Keyboard**: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z and Ctrl+Y redo. Shortcuts are ignored while typing in a form field.
- **Undo** takes the latest op **made by the current user in this session** and sends its `inverse` as a **new op** (with `revertsSeq`). History is never deleted, so the log stays complete and honest.
- **Redo** re-sends the op that was undone. Any new edit clears the redo stack.
- The undo stack is cleared on page reload.
- **History page**: "Revert" on any past change sends its `inverse`. If it no longer applies (e.g. the person was deleted later), the `applyOp` error is shown.
- Undoing an AI import = sending the `batch` inverse, which removes the whole import at once.

---

## 7. Frontend (`apps/web`)

### 7.1 Folder structure

```
src/
  app/              router, providers (QueryClient, i18n, theme), app shell
  features/
    auth/           sign in, sign up, password reset
    clans/          clan list, members, invites, settings
    tree/           ⭐ canvas, layout worker, PersonNode, profile panel, search, toolbar (undo/redo), linked trees
    history/        change timeline, revert
    reminders/      upcoming anniversaries, reminder settings, push subscription
    import/         AI import: prompt, JSON paste, diff preview
    export/         PNG/SVG/PDF export, share links
    help/           in-app user guide
  shared/
    ui/             design tokens, base components (shadcn/ui patterns on Radix), scrapbook primitives
                    (Polaroid, DateMark, Thread, Stitch, Board), theme, DualDateInput, InfoHint
    lib/            api client, removeDiacritics, formatters
  locales/          vi.json, en.json
  sw/               service worker entry (vite-plugin-pwa / Workbox)
```

Each feature exposes its public API only through its `index.ts`. Features never import another feature's internal files.

### 7.2 Routes (React Router)

| Path | Content |
|---|---|
| `/login`, `/register`, `/forgot-password` | Accounts |
| `/clans` | My clans + create |
| `/clans/:id/tree` | ⭐ Tree (main page); `?focus=:personId` flies to a person |
| `/clans/:id/upcoming` | Upcoming anniversaries |
| `/clans/:id/history` | Change history |
| `/clans/:id/members` | Members & invites |
| `/clans/:id/import` | AI import |
| `/clans/:id/settings` | Name, progenitor, in-law settings, share links, incoming links, reminders |
| `/join/:token` | Accept an invite |
| `/share/:token` | Public read-only tree; `?focus=:personId` |
| `/help/*` | User guide |

### 7.3 State management

| Data | Tool | Notes |
|---|---|---|
| Clan list, members, upcoming anniversaries, history, current user, linked-tree previews | **TanStack Query** | Caching, refetching, loading/error states |
| The tree being edited | **Zustand** store `useTreeStore` | `persons`, `unions`, `confirmedVersion`, `confirmedTree`, `pending[]`, `undoStack[]`, `redoStack[]` |
| Local UI state (open panel, selected person) | `useState` / small Zustand slice | |

Components read the store through **selectors** (`useTreeStore(s => s.persons[id])`) so they re-render only when that slice changes.

TanStack Query cache is persisted to IndexedDB (`@tanstack/query-persist-client`) so recently opened trees are viewable offline (S7).

### 7.4 ⭐ Rendering large trees

**Pipeline:**

```
persons + unions (store) + view options (collapsed ids, showInLaws, daughtersDescendantsDepth)
  → postMessage to the Layout Web Worker
      1. computeGenerations() + classifyLineage()
      2. build "family units": [blood member + their spouses in order] → children per Union
      3. measure subtree widths bottom-up
      4. place x top-down: children centered under their Union; subtrees never overlap
      5. skip collapsed branches and nodes hidden by view options
  ◀ { nodeId: {x, y} }
  → React Flow renders PersonNode, UnionNode (marriage dot), and parent→child edges
```

Because in-laws never expand upward (§8), the layout is a pure descendant tree: one bottom-up and one top-down pass, O(n), no edge crossings.

**Performance techniques:**

| Technique | Effect |
|---|---|
| React Flow `onlyRenderVisibleElements` | Only nodes inside the viewport are rendered |
| `React.memo` on PersonNode + per-id selectors | Editing one person re-renders only that card |
| Level of detail (LOD) by zoom | < 0.4: a strip of washi tape in the branch color · 0.4–0.8: a taped name label with life years · > 0.8: the full polaroid with photo and date marks (§13.3) |
| Layout in a Web Worker | Re-layout never freezes the UI |
| Re-layout only on structural changes | Renaming or editing dates does not recompute positions |
| Collapse/expand branches | Fewer nodes on very large trees |

**Search:** strips diacritics from names and query ("nguyen van tu" matches "Nguyễn Văn Tư"), includes `aliases`. Selecting a result expands collapsed ancestors on the path, calls `fitView` to fly there and highlights the card.

**Benchmark script:** `pnpm seed:fake --people 2000` generates a multi-generation fake tree to measure S1 and S2. Before/after numbers go into the README.

### 7.5 Tree toolbar

Top bar of the tree page, left to right: clan name (or the breadcrumb when following a linked tree, §8.1) · **↶ Undo · ↷ Redo** · save status · search · view menu (show/hide in-laws, daughters' descendants depth, collapse all) · export · fit view. On mobile it collapses into a bottom bar with Undo/Redo always visible and the rest in a "more" menu. All buttons have accessible labels and visible focus states.

### 7.6 Forms & input

- React Hook Form + Zod resolver (schemas from `packages/shared`).
- Clicking a person opens a **side panel** (bottom sheet on mobile) to view/edit. Saving creates an `updatePerson` op with only the changed fields.
- `DualDateInput`: toggle **Lunar / Solar / Year only**. Entering one side shows the converted other side and the Can Chi year. A "leap month" checkbox appears in Lunar mode.
- Context menu (and card buttons on touch devices): Add child · Add spouse · Add parent (if missing) · Change relationship… · Link to another family tree · Delete.
- People are created through forms and AI import (§10), never by dragging. Dragging only **changes relationships**.

**Drag to relate (editors only).** Positions always come from the layout (§7.4); a drag never stores a free position.

- **Drop zones.** Dropping card A on the top, middle or bottom third of card B makes A a **parent**, **spouse** or **child** of B. The zones are labelled on B while hovering, and the status line says exactly what the drop will do.
- **Replace, don't stack.** Any existing direct relationship between A and B (spouse, parent or child) is replaced by the new one. When a couple becomes parent and child, their shared children stay with the person who becomes the child.
- **Follow-up questions instead of dead ends.**
  - If B has several spouses, making A a child of B asks "child of B with whom?" (or "only B").
  - If B already has two parents, making A a parent of B asks which parent A replaces.
  - If either partner has children with only one known parent, making A and B spouses asks whether those children are shared.
  - Every question has a "Cancel, change nothing" option.
- **Blocked only when impossible.** A drop is blocked only when it would create an impossible state, such as someone becoming an ancestor of themselves through other people. Blocked zones are crossed out with the reason before the drop, and the reason says how to proceed. Validation runs the same `applyOp` as the server, so the UI never accepts a drop the server would reject.
- **Undo.** Each completed drop is a single `batch` op, so it is one undo step. A toast confirms the change and offers "Undo".
- **Cancel a drag.** Press Esc, or drop the card on empty space more than about one card width from its place.
- **Cut.**
  - Clicking a thread or its red pin, or a marriage knot, shows **Cut**.
  - Cutting a parent → child thread is `setParents(null)`.
  - Cutting a marriage with shared children asks who the children stay with. The other partner is removed from that Union with `updateUnion`.
  - A divorce where both stay parents is recorded as Union status `divorced` (shown as a broken stitch), not by cutting.
- **Loose photos.** Anyone left unconnected moves to the **Loose photos** tray instead of being deleted. A detached branch moves as one stack and can be dropped back onto the tree.
- **Nudge.** Dropping a card within about one card width of its place keeps a small display offset, so short threads stay easy to reach. Offsets are per device (localStorage), are not ops and are not shared. **Tidy up** clears them.
- **Touch.** A long press (about 400 ms) picks a card up; a normal swipe still pans the tree.
- **Keyboard and screen reader.** The card menu item **Change relationship…** lists each relationship with a **Remove** button and offers the same add and replace choices.

### 7.7 PWA

- `vite-plugin-pwa` (Workbox) generates the service worker and manifest: name, Vietnamese short name, icons (192/512, maskable), theme color, `display: standalone`.
- Caching: app shell precached; `/api/clans/:id/tree` uses network-first with cache fallback; images use stale-while-revalidate with a size cap.
- Offline: the tree opens read-only from cache with an "Offline — read-only" banner; edit buttons are disabled (offline editing is phase 2).
- Install prompt: custom "Install app" button using `beforeinstallprompt` on Android/desktop; on iOS a short illustrated guide (Share → Add to Home Screen), because **iOS only allows web push for PWAs added to the Home Screen**. The reminder settings page shows that guide when an iOS user enables push without the app installed.
- Update flow: when a new service worker is waiting, show "New version available — Reload".

### 7.8 Responsive & accessibility

- Touch pan/zoom (built into React Flow); panel becomes a bottom sheet on small screens.
- Keyboard: Tab through cards, Enter opens the profile, arrow keys move between parent/child/siblings. "Change relationship…" in the card menu is the keyboard alternative to drag-to-relate (§7.6).
- WCAG AA contrast. Each card has an `aria-label` with name, life years and generation.

---

## 8. In-laws and the maternal side

Vietnamese genealogies are traditionally patrilineal, but families want to see who married in and where they came from, without the tree exploding sideways.

**Classification** (`classifyLineage()`, derived, never stored):
- `blood` — the progenitor and anyone who descends from them through `parentUnionId`.
- `in-law` — not blood, but a partner in a Union with a blood member.
- `unlinked` — neither; listed under "Not yet linked".

**Display rules:**
- In-laws are placed **beside their blood spouse** (ordered by `Union.order`) and never expand upward, so the layout stays a pure descendant tree (§7.4).
- In-law cards use a distinct but quiet style (outlined card, lighter fill) and a subtitle built from `birthFamily`, e.g. "Daughter of Mr. Trần Văn X · Hà Nam". Opening the panel shows the full birth-family details.
- They share their spouse's generation number but are **excluded from blood statistics** ("312 members · 85 in-laws").
- **Daughters' descendants**: `Clan.settings.daughtersDescendantsDepth` controls how many generations below a married-out daughter are shown (default 1 = her children, collapsed by default). The traditional "sons' line only" view is depth 0.
- **"Hide in-laws" toggle** in the view menu and in export options produces a traditional lineage-only chart. Hidden in-laws collapse into a small marker on the spouse's card ("+1 spouse").
- Search includes in-laws, with a filter chip.

### 8.1 Linked trees

Any person — an in-law, a daughter who married out, an adopted child with a known birth family — can be linked to **the same person in another family tree** on the platform, once that tree has been shared.

**Creating a link** (Owner/Editor of the source clan):
1. Person panel → "Link to another family tree".
2. Choose the target: a clan the user is a member of, **or** paste a share link someone sent them (`/share/:token`).
3. Search and pick the matching person in the target tree (a mini-tree preview confirms the right person).
4. Saved as a `setTreeLink` op, so it appears in history and can be undone.

**Hover indicator:**
- Linked cards carry a small "linked tree" icon badge in the corner at every zoom level ≥ 0.4; below that, a thin accent ring.
- Hover (desktop), long-press (touch) or keyboard focus opens a **preview popover**: target clan name, hometown, number of people, the person's name in that tree, access status, and an "Open their family tree" button.
- Popover data is lazy-loaded from `GET /api/persons/:personId/tree-link/preview` and cached by TanStack Query. Hovering also **prefetches** the target tree, so the click feels instant.
- Status variants: ✅ **Available** · 🔒 **No access** (viewer is not a member and holds no valid share link — "Ask the owner of {clan} for access") · ⚠️ **Unavailable** (share link revoked/expired, target person deleted, or the target owner blocked this clan).

**Click → open the linked tree:**
- Navigates to `/clans/:targetId/tree?focus=:personId` (member access) or `/share/:token?focus=:personId` (share-link access); the tree flies to and highlights that person.
- A **breadcrumb trail** shows the path: "Nguyễn family (Nam Định) › Trần family (Hà Nam)". Clicking a crumb or pressing the browser Back button returns to the previous tree at the same viewport. The trail lives in router state; beyond 5 levels the middle collapses into "…".
- A short transition between trees (disabled under `prefers-reduced-motion`).
- In the target tree, the same person shows a reciprocal badge "Also in: Nguyễn family" when the viewer has access to the source tree.

**Access & privacy (enforced on the server):**
- Preview and open succeed only if the viewer is a member of the target clan or the link's share link is still valid.
- Through a share link the target tree is read-only and filtered like any public link (living people's details hidden). In the preview, a living linked person accessed via share link is shown as "A living member".
- Creating a link from a share link never grants membership.
- The target clan's Owner sees **Incoming links** in clan settings (which clans link in, and how many people) and can **block** a source clan; revoking a share link breaks links created from it.
- Links are one-directional; the target clan can create its own link back.

**Endpoints:**
- `GET /api/clans/:id/persons/search?q=` — person picker in the target tree (requires access)
- `GET /api/persons/:personId/tree-link/preview` — popover data + access status
- `GET /api/clans/:id/incoming-links` — Owner only
- `POST /api/clans/:id/incoming-links/:sourceClanId/block` — Owner only

---

## 9. Lunar calendar & reminders

### 9.1 Lunar↔solar conversion

- `packages/shared/lunar/` implements the **Hồ Ngọc Đức algorithm** for **UTC+7**. A Chinese-calendar library (UTC+8) is not used because some years differ from the Vietnamese calendar (e.g. Tết 1985).
- Interface (callers depend on the interface, not the algorithm):
  ```ts
  interface LunarCalendar {
    solarToLunar(date: Date): LunarDate                  // { day, month, year, isLeap }
    lunarToSolar(l: LunarDate): Date | null              // null if that lunar date does not exist
    daysInLunarMonth(month: number, year: number, isLeap: boolean): 29 | 30
    leapMonthOf(lunarYear: number): number | null
  }
  canChiYear(lunarYear: number): string                  // 1924 → "Giáp Tý"
  ```
  The default implementation is `HoNgocDucCalendar`; year data is memoized per lunar year.

**Is there a year limit (e.g. 2100)?** No. The algorithm is an **astronomical computation**, not a lookup table: it computes new-moon times and the sun's longitude (solar terms) with formulas from Jean Meeus' *Astronomical Algorithms*, then applies the calendar rules (month starts on the day of the new moon; the month without a major solar term in a 13-month year is the leap month). It works for any year; accuracy only degrades slowly over many centuries. 1900–2100 is just the range of the **published reference table** we test against. Beyond that range, correctness is protected by:

| Layer | What it does |
|---|---|
| Golden tests | 100% match with the published Tết table 1900–2100 |
| Property-based tests (`fast-check`, years 1800–2400) | Invariants: each month has 29 or 30 days; each lunar year has 12 or 13 months; a leap month contains no major solar term; Tết falls between Jan 21 and Feb 20; `lunarToSolar(solarToLunar(d)) === d` |
| Differential tests (2100–2400) | Compare month starts against an independent high-precision ephemeris library (`astronomy-engine`). Mismatches can only occur when a new moon lands within minutes of midnight; any such date is listed in an ADR |
| Swappable implementation | If more precision is ever needed, an `EphemerisCalendar` (astronomy-engine based) or an official-almanac `TableCalendar` can replace `HoNgocDucCalendar` without touching callers |

**Historical caveat:** Vietnam's lunar calendar was computed for UTC+8 before 1968 (and longer in the South). Converting a **solar** death date earlier than 1968 to lunar can therefore be off by a day or even a month. When `source: 'solar'` and the year is before 1968, the UI shows a note asking the family to confirm the lunar date. *(Verify this cutoff year against a source before implementing.)*

### 9.2 This year's anniversary

```ts
anniversaryFor(deathLunar: LunarDate, targetLunarYear: number): {
  solarDate: Date,
  notes: AnniversaryNote[],         // rendered as hints in the UI
  kind: 'first' | 'second' | 'regular'
}
```

| Case | Rule | UI note (shown in Vietnamese via i18n) |
|---|---|---|
| Died in a leap month; this year has no such leap month | Use the regular month with the same number | ℹ️ Died on 10/4 (leap). This year has no leap 4th month, so the anniversary is on 10/4 (regular). |
| Died in a leap month; this year has the same leap month | Still use the **regular** month (common practice) | ℹ️ Anniversary uses the regular 4th month, as most families do. |
| Died on day 30; this year's month has only 29 days | Use day 29 | ℹ️ Died on 30/7 (lunar). This year's 7th month has 29 days, so the anniversary is on 29/7. |
| 1st lunar year after death | `kind: 'first'` | 🏷️ **First anniversary (giỗ đầu)** |
| 2nd lunar year after death | `kind: 'second'` | 🏷️ **Second anniversary (giỗ hết)** — usually a larger ceremony |
| Death date entered as solar | Converted to lunar on save (`source: 'solar'`) | ℹ️ Lunar date derived from solar date 12/05/1990 — please confirm with your family. (+ pre-1968 caveat when applicable) |
| Only the year / incomplete date | No anniversary computed | ⚠️ Not enough information to compute the anniversary. [Add details] |

The `InfoHint` component displays notes (hover on desktop, tap on mobile).

### 9.3 Upcoming anniversaries page

- Anniversaries in the next 30 days, sorted by date: solar date (weekday) · lunar date · name · generation · branch · badges/notes · "in N days".
- "Add to Google Calendar" link (event template URL, no API needed).

### 9.4 Reminder job

**Triggering — layered, independent of repository activity:**

| Layer | Service (free) | When | Role |
|---|---|---|---|
| 1. Primary | **Cloudflare Worker Cron Trigger** (`apps/cron-worker`) | 00:00 UTC = 07:00 VN | Calls the endpoint; a scheduled Worker may run up to 15 minutes, so it can wait for a sleeping Render instance (30–60 s); retries 3× one minute apart |
| 2. Backup | **cron-job.org** | 00:30 UTC = 07:30 VN | Calls the endpoint again; emails an alert on failure |
| 3. Monitoring | **Sentry Cron Monitor** | — | The job checks in on completion; no check-in by 08:00 → alert |
| 4. Self-healing | Catch-up logic in the job (below) | — | Missed days are sent late on the next run, never lost |

- Because the job is **idempotent**, layers 1 and 2 both firing on the same day is safe.
- `POST /api/internal/run-reminders` (requires the `X-Cron-Secret` header) **responds `202 Accepted` immediately** and runs the job in the background inside the Express process (cron-job.org waits at most 30 s).
- Not used: GitHub Actions `schedule` (auto-disabled after 60 days without activity in public repos) and in-process `node-cron` (Render free instances sleep after 15 idle minutes).

**Algorithm (with catch-up):**
```
milestones = daysBefore sorted descending, e.g. [7, 1]
for each ReminderSub:
  for each deceased person (filtered by personIds if set) with a lunar death date:
    d = next anniversary solar date (this lunar year, or next if already passed)
    remaining = d - today   (Asia/Ho_Chi_Minh)
    n = the SMALLEST milestone with remaining <= n     // 5 days left → milestone 7; 1 or 0 → milestone 1
    if n exists:
      insert ReminderLog { subId, personId, lunarYear, daysBefore: n }   (unique)
        → duplicate key (E11000): skip
      send email and/or push using the real remaining days: "In {remaining} days: anniversary of ..."
      success → status 'sent'; failure → delete the log so the next run retries
```
Example: both layers fail on the "7 days left" day. The next day (6 days left), milestone 7 is still unsigned, so the job sends "In 6 days…". The user gets it a day late but never misses it.

- **Idempotent** thanks to the ReminderLog unique index ("sign first, send after"). Not "check, then send", which has a **race condition**.
- A push endpoint answering 410 (expired) deletes that PushSub.
- Email body: "In 7 days: anniversary of Mr. Nguyễn Văn Tư (generation 3) — Saturday 21/11/2026, lunar 11/10" + link to the profile + unsubscribe link. (Rendered in the user's locale.)

---

## 10. AI-assisted import (users bring their own AI)

### 10.1 Flow

```
1. /clans/:id/import shows a PROMPT TEMPLATE + Copy button + a 3-step illustrated guide
2. The user pastes the prompt + a photo of the genealogy page into ChatGPT / Gemini / Claude
3. The user copies the JSON answer and pastes it into the app
4. Validation (entirely in the browser):
   a. Extract JSON from surrounding text (models often wrap it in ```json ... ```)
   b. JSON.parse error → "Invalid JSON at line X, column Y"
   c. Zod ImportSchema errors → list each wrong field, e.g. "people[3].gender must be male or female"
   d. Relationship checks: every referenced tempId exists; no cycles
   e. Duplicate detection against the current tree: diacritic-insensitive name similarity ≥ 90% AND birth years within 2 (when known)
5. DIFF PREVIEW (list + mini tree):
   🟢 new person
   🟡 possible duplicate of "Nguyễn Văn Tư (1920)" → [Same person – merge] [Different – add]
   ⚠️ fields the AI marked uncertain are highlighted and editable inline
   + "attach to": choose which existing person is the parent of the imported top person
6. "Import into tree" → one `batch` op → POST /api/clans/:id/ops (one transaction)
   → a single Undo removes the whole import
```

### 10.2 JSON format requested from the AI

```json
{
  "people": [
    {
      "tempId": "p1",
      "fullName": "Nguyễn Văn Tư",
      "aliases": ["Cụ Tư"],
      "gender": "male",
      "birth": { "lunar": { "day": 5, "month": 1, "year": 1924, "isLeap": false } },
      "death": { "isDeceased": true, "lunar": { "day": 12, "month": 3, "year": 1990, "isLeap": false } },
      "uncertain": ["birth"]
    }
  ],
  "unions": [
    { "tempId": "u1", "partners": ["p1", "p2"], "order": 1 }
  ],
  "children": [
    { "child": "p3", "parentUnion": "u1", "siblingOrder": 1, "isAdopted": false }
  ]
}
```

The prompt instructs the AI to: return only JSON in this format; never invent information; mark unreadable fields in `uncertain`; convert Can Chi years to numbers only when they can be inferred, otherwise mark them uncertain.

### 10.3 Safety

- AI output is always **untrusted**: it must pass Zod, then `applyOp`, then explicit user approval.
- All strings render as text (React escapes them). `dangerouslySetInnerHTML` is never used.
- Max 500 people per import.

---

## 11. Export & sharing

- **PNG/SVG:** `html-to-image` captures the React Flow viewport with LOD temporarily disabled for full detail.
- **PDF:** `jsPDF`, landscape A4/A3/A1. Trees larger than the page are tiled with assembly marks. Title and export date included. Options: hide in-laws, daughters' descendants depth.
- **Share link:** `GET /api/share/:token/tree`. The **server** strips data before responding: living people keep only name, gender and relationships; birth date, photo and bio are removed. Filtering happens server-side because anything sent to the browser is visible in DevTools. The Owner can revoke a link anytime. A share link is also one way another clan can link into this tree (§8.1).

---

## 12. Security

- Passwords hashed with bcrypt (cost 12).
- Sessions: **JWT** in `httpOnly; Secure; SameSite=Lax` cookies. Access token 15 min; refresh token 30 days with rotation.
- Every `/clans/:id/*` route checks Membership + role in middleware. A `clanId` in the request body is never trusted; `Person.clanId === :id` is always verified.
- `helmet`, `express-rate-limit` (sign-in: 5/min/IP; general API: 300/min/user).
- Image upload: the client requests a **signed upload** from the API, then uploads directly to Cloudinary; max 2 MB; jpg/png/webp only. Paths and checks: "Image storage" below.
- `/internal/*` requires `X-Cron-Secret` to match an environment variable.
- Invite/share tokens: 32 chars from `crypto.randomBytes`.

### Image storage (Cloudinary)

One Cloudinary cloud serves every environment. The API decides every path; the browser never chooses one.

```
ancestors-tree/                      Cloudinary root
├─ dev/                              CLOUDINARY_FOLDER=ancestors-tree/dev (local development)
└─ prod/                             CLOUDINARY_FOLDER=ancestors-tree/prod (Render)
   └─ clans/<clanId>/
      └─ people/<personId>/
         └─ <random>                 one asset per uploaded photo
```

- **Per clan, then per person.** Deleting a clan deletes the prefix `…/clans/<clanId>/`; deleting a person for good deletes `…/people/<personId>/`. Storage per clan can be measured by prefix.
- **No names in paths.** IDs are database IDs and the last segment is 16 random characters (`crypto.randomBytes`). Photo URLs can leak (screenshots, browser history), so they reveal no names or dates and cannot be guessed.
- **Signed by the API.** `POST /api/clans/:id/people/:personId/photo-upload` (Editor or Owner) signs exactly: `public_id` (the full path), `asset_folder` (its folder part, so both Cloudinary folder modes give the same tree), `allowed_formats=jpg,png,webp`, `tags=clan_<clanId>`, and an incoming transformation `c_limit,w_1600,h_1600` that re-encodes the image and drops its metadata (including GPS location). The client rejects files over 2 MB before uploading.
- **Verified on save.** The client saves `photo: { publicId, version }` with a normal `updatePerson` op. The server accepts it only if `publicId` starts with this clan's and person's prefix and the asset exists with at most 2 MB (Admin API); otherwise it answers 422 and deletes the asset.
- **Old photos are kept** while an op that references them can still be undone or reverted (§6.4). Cleaning up unreferenced assets is Phase 2.
- **Delivery.** The browser builds URLs from the public cloud name (`VITE_CLOUDINARY_CLOUD_NAME`), `publicId`, `version` and named transformations: polaroid `c_fill,g_face,w_172,h_148,f_auto,q_auto` (twice the 86×74 photo area), profile `c_fill,g_face,w_480,h_480,f_auto,q_auto`. Share links (§11) remove `photo` from living people on the server, so their URLs are never sent.
- **Secrets.** `CLOUDINARY_URL` (API key and secret) exists only in the API's environment.

---

## 13. Errors, UX states & visual design

### 13.1 Error handling

- **Server:** every error uses one shape:
  ```json
  { "error": { "code": "VERSION_CONFLICT", "message": "The tree was updated by someone else" } }
  ```
  Codes are defined once in `packages/shared/errors.ts` (`ERROR_CODES`) with HTTP status and description; the error-code doc is generated from it. Main codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (400, with `details`), `VERSION_CONFLICT` (409), `RULE_VIOLATION` (422, from `applyOp`), `RATE_LIMITED` (429).
- **Client:** the API client maps errors to `ApiError { code, message }`, and the UI shows the Vietnamese text for that code. Each feature is wrapped in an **Error Boundary**. Failed actions show a toast. Network failures while sending ops keep them in `pending` and retry with **exponential backoff** (1 s, 2 s, 4 s…); the toolbar shows "Unsaved".
- **Render cold start (~30–60 s):** the first load shows a "Waking up the server…" screen instead of a blank page.
- **Sentry** (free Developer plan: 5,000 errors/month, 1 user, 30-day retention; over quota, events are dropped, never billed). Production only.

### 13.2 Loading & empty states

Skeletons shaped like the real content (no generic spinners on main pages). Empty clan → guided first step ("Add the progenitor"). Empty upcoming list → explains what is needed (lunar death dates).

### 13.3 Visual direction: "family scrapbook" (anti-slop)

The UI must not look like a generic AI-generated SaaS template. It is aimed at younger family members, stays readable for older relatives, and must still fit when birthday reminders are added.

**Direction:** a family scrapbook laid out on grid paper. Every decorative device carries information:

| Element | Meaning |
|---|---|
| Polaroid card | one person: photo (or initials on a tinted block) and a handwritten caption |
| Washi tape color | the person's branch, taken from the Okabe–Ito colorblind-safe palette. The progenitor has vermilion tape; in-laws have neutral grey tape |
| Thread ending in a red pin | parent → child |
| Dashed stitch with a round knot | marriage |
| Red rubber stamp | death anniversary (lunar date) |
| Round yellow sticker | birthday |
| "Loose photos" tray | people not connected to the tree (§7.6) |

Each card tilts slightly by an angle derived from the person id (±2.5°). The board feels hand-made, but a card never changes its tilt between renders.

**Color tokens** (light = "grid paper by day", dark = "desk at night"). Polaroid paper stays light in both themes.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` / `paper-grid` | #FAFAF8 / #ECECE7 | #14161C / #1E2129 | page and board background, 22 px grid |
| `surface` | #FFFFFF | #1C1F27 | panels, dialogs, inputs |
| `ink` / `ink-muted` | #1A1A1A / #5B5F66 | #ECEAE4 / #A4A9B3 | text |
| `line` / `line-strong` | #E2E2DC / #8A8F98 | #2C303A / #737882 | decorative borders / control borders (≥ 3:1) |
| `stamp` / `on-stamp` | #D7263D / #FFFFFF | #FF5A6E / #14161C | anniversaries, destructive actions |
| `accent` / `on-accent` | #2B59FF / #FFFFFF | #7C9CFF / #14161C | links, focus ring, selection |
| `success` | #12805C | #3CCB91 | "server is running" and other OK states |
| `thread` / `pin` | #5B5F66 / #D7263D | #A4A9B3 / #FF5A6E | relationship lines |
| `photo`, `photo-ink`, `photo-muted`, `photo-stamp` | #FFFFFF, #1A1A1A, #5B5F66, #B8202F | #E9E6DD, same inks | polaroid paper and what is printed on it |
| `sticker` / `on-sticker` | #FFD23F / #1A1A1A | same | birthday stickers |
| `tape-*` | progenitor #D55E00; branches #E69F00, #56B4E9, #009E73, #F0E442, #0072B2, #CC79A7; in-law #B8BCC4; loose #C9C9C2 | same | washi tape |

Text pairs meet WCAG AA (4.5:1), and borders and lines meet 3:1. A unit test checks every pair in both themes.

**Type:** all three typefaces are self-hosted with their Vietnamese subsets.
- **Be Vietnam Pro**: UI text and headings (700, −0.02em tracking).
- **Patrick Hand**: only captions on photos and handwritten notes. It is never used for controls or body text.
- **JetBrains Mono**: dates, stamps and numbers.

**Anti-slop checklist (S9):**
- ❌ No purple/indigo gradients, no glassmorphism, no glowing blobs, no emoji as icons.
- ❌ No default shadcn look shipped as-is: tokens (color, radius, spacing, type scale, shadows) are customized first, and Tailwind's default palette is removed so only tokens can be used.
- ❌ No "hero + three feature cards" landing cliché; the landing page shows a real (sample) tree.
- ❌ No identical gray cards everywhere; hierarchy comes from type, spacing and a few deliberate accents.
- ❌ No drop shadows on resting cards; depth appears only while a card is lifted (dragged).
- ❌ No decoration without meaning: tape color, threads, stitches, stamps and stickers always encode data.
- ✅ Branch colors come from the Okabe–Ito colorblind-safe palette, not random hues.
- ✅ Light and dark themes both designed (dark = "desk at night").
- ✅ Motion is purposeful and short (card settle, fly-to, panel slide); respects `prefers-reduced-motion`.
- ✅ Icons from one consistent set (Lucide) at stroke width 1.75.

Design tokens live in `apps/web/src/shared/ui/tokens.css` (CSS variables mapped into Tailwind with `@theme`). The `/design` page shows every token and component in both themes.

---

## 14. Documentation

| Audience | Document | Location / format |
|---|---|---|
| End users | **User guide**: getting started, building the tree, dates & lunar calendar, anniversaries & reminders, installing the app (Android/iOS), AI import, linked trees, sharing & privacy, FAQ — with screenshots | In-app `/help` (Vietnamese) + `docs/user-guide/` (English) |
| Developers | **README**: pitch, demo GIF, architecture diagram, performance numbers, quick start | `README.md` |
| Developers | **Architecture**: modules, data flow, Operation model, layout algorithm (Mermaid diagrams) | `docs/architecture.md` |
| Developers | **API reference**: generated from the Zod schemas (`@asteasolutions/zod-to-openapi`) into OpenAPI 3.1, browsable at `/api/docs` (Scalar) | Generated; CI fails if any Express route is missing from the OpenAPI document |
| Developers | **Error codes**: code, HTTP status, meaning, client handling | `docs/error-codes.md`, generated from `ERROR_CODES` |
| Developers | **ADRs** (Architecture Decision Records): one short file per major decision (monorepo, Operation log, React Flow + custom layout, UTC+7 lunar algorithm, cron layering, Netlify proxy, linked trees) | `docs/adr/0001-*.md` |
| Developers | **Contributing**: setup, scripts, conventions (English only, commit style, feature folders), testing | `CONTRIBUTING.md` |
| Developers | **Environment variables**: every variable with description | `.env.example` files + `docs/configuration.md` |
| Everyone | **Bilingual design docs** | `docs/superpowers/specs/*-design.md` (EN) + `*-design.vi.md` (VI) |

---

## 15. Testing

| Type | Tools | Main coverage |
|---|---|---|
| Unit | Vitest | `applyOp` per op type, per business rule, and inverse correctness (`applyOp(applyOp(t, op), op.inverse) ≡ t`); lunar golden + property-based (`fast-check`) + differential tests; `anniversaryFor` for every row of §9.2; layout (no overlapping nodes, children below parents); `classifyLineage`; duplicate detection |
| Component | Vitest + Testing Library | `DualDateInput`, import diff preview, profile panel, toolbar undo/redo states, linked-tree popover (3 states) |
| Integration | Supertest + `mongodb-memory-server` (replica-set mode for transactions) | Op writes, 409 on stale version, viewer/editor permissions, share link hides living people, linked-tree preview/open permissions, blocking a source clan, reminder job run twice sends once, catch-up after a missed day, OpenAPI route coverage |
| E2E | Playwright | Sign up → create clan → add 3 generations → set death date → see upcoming anniversary → undo via toolbar button → export PNG; two tabs edit concurrently → the later one rebases; link a person to another clan's share link → hover shows the preview → click opens the target tree focused on that person → breadcrumb returns; revoked share link shows the "Unavailable" state; offline: reload while offline shows the cached tree read-only |
| Performance | Seed script + React Profiler | S1, S2 with 1,000 and 2,000 people |
| Visual | Playwright screenshots (light/dark, mobile/desktop) | Design review against §13.3 |

**CI (GitHub Actions)** on every push/PR: `lint` → `typecheck` → `test` (with coverage) → `build` → OpenAPI route check. Deploys run only on merge to `main`.

---

## 16. Deployment & cost (target: $0)

| Component | Service (free tier) | Notes |
|---|---|---|
| Web | **Netlify** | Accounts created on/after 2025-09-04 get 300 credits/month; each production deploy costs 15 (~20 deploys/month) → **deploy only on merge to `main`, disable deploy previews**. Out of credits = sites paused until next month. Fallback: Cloudflare Pages |
| API | Render | Sleeps after 15 idle minutes → wake-up screen |
| Database | MongoDB Atlas M0 | 512 MB, supports transactions |
| Images | Cloudinary | Free plan: 25 credits/month (storage, bandwidth and transformations together); one cloud, dev and prod kept apart by folder (§12) |
| Email | Resend | 3,000 emails/month |
| Push | Web Push (VAPID) | Free |
| Primary cron | Cloudflare Workers Cron Trigger | Free: 5 triggers/account, up to 15 min per run |
| Backup cron | cron-job.org | 30 s timeout, email alerts, no retries |
| Error tracking | Sentry Developer | |

Environment variables are documented in `apps/*/.env.example` (no real values).

---

## 17. 8-week roadmap (overview)

> The step-by-step implementation plan lives in a separate document once this spec is approved.

| Week | Goal | Demoable result |
|---|---|---|
| 1 | Monorepo, CI, **design system & tokens (§13.3)**, i18n setup, auth (email + Google), Clan, Membership, Invite, OpenAPI pipeline | Sign in, create a clan, invite someone; distinct visual identity in place |
| 2 | `packages/shared`: Zod schemas, `applyOp` + tests; ops API (transaction, version, 409); Zustand store; tree visible with a simple layout | Add people, see them on the tree, survives reload |
| 3 | Profile panel, `DualDateInput`, lunar algorithm + golden/property tests, `computeGenerations`, `classifyLineage`, in-law display | Enter lunar/solar dates; see generations and in-laws |
| 4 | Layout worker, **undo/redo toolbar + shortcuts**, history page, 409 rebase → **deploy MVP** | MVP online; family starts entering data |
| 5 | ⭐ Performance: 2,000-person seed, LOD, memo, collapse, search, minimap, in-law view options, measurements | Before/after numbers for the CV |
| 6 | Upcoming page + notes, `anniversaryFor` + differential tests, idempotent job with catch-up, email, **PWA (install, offline read, push incl. iOS)**, cron worker | Real reminder email/push; installable app |
| 7 | AI import (prompt, validation, diff preview, batch); PNG/PDF export; share links; **linked trees (§8.1)** | Import a real genealogy page; jump from an in-law into their family's tree |
| 8 | E2E, accessibility, Lighthouse, Sentry, **docs (user guide, architecture, ADRs, error codes)**, README with demo GIF, onboard real users | CV-ready release |

---

## 18. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Custom layout takes longer than planned | Week 2 ships a simple layout first; week 4 replaces it. Worst case: use ELK (`elkjs`) inside the worker |
| Scope creep ("everything") | Phase 2 list is explicit; anything new goes there unless it replaces an in-scope item |
| Netlify credits run out | Deploy only from `main`; fallback to Cloudflare Pages |
| Render cold start annoys users | Wake-up screen; cron calls keep it warm in the morning |
| Lunar edge cases disputed by families | Notes explain every rule; `source` keeps the user's original input |
| iOS push only works for installed PWAs | Install guide shown at the moment push is enabled on iOS |
| Linked trees expose data unintentionally | Server checks access on every preview/open; share-link access is filtered like a public link; target Owner sees and can block incoming links |

---

## 19. Glossary

| Term | Plain explanation | Where it is used |
|---|---|---|
| **PWA (Progressive Web App)** | A website that can be installed like an app (home-screen icon, full screen, offline support, push notifications) without app stores | §7.7 |
| **Service worker** | A background script the browser runs for the site; it caches files and receives push notifications | PWA |
| **Monorepo** | One Git repository containing several projects (web, api, shared) that share code | Architecture |
| **Operation (op)** | One entry in the change log: who, what, details, and how to undo it | §6 |
| **Transaction** | A group of database writes that either all succeed or none do, like a bank transfer | Writing ops |
| **Version / baseVersion** | The tree's version number; the client says "I'm editing on version X" so conflicts are detected | §6.2 |
| **409 Conflict** | HTTP status meaning "your change is based on an outdated version" | §6.3 |
| **Rebase** | Re-applying your own changes on top of the latest version (borrowed from Git) | §6.3 |
| **Pure function** | Same input always gives the same output; no API/DB calls; no outside mutation | `applyOp`, lunar |
| **Reducer** | A pure function `(oldState, action) → newState`, like `useReducer`/Redux | `applyOp` |
| **Immutable** | Never modify an existing object; create a new one, so React can detect changes | `applyOp`, store |
| **Optimistic update** | Update the screen immediately, without waiting for the server; roll back on error (like tapping ❤️ on Facebook) | §6.2 |
| **TanStack Query** | Data-fetching library with caching, refetching and loading/error states | §7.3 |
| **Zustand** | A small global state store, simpler than Redux | Tree being edited |
| **Selector** | A function that picks one slice of the store, so a component re-renders only when that slice changes | §7.3 |
| **React.memo** | Tells React to skip re-rendering a component when its props did not change | PersonNode |
| **Web Worker** | A background JavaScript thread; heavy computation there never freezes the UI | Tree layout |
| **LOD (Level of Detail)** | Draw simpler versions of things when zoomed out, full detail when zoomed in | §7.4 |
| **Prefetch** | Loading data in the background before the user asks for it (e.g. on hover), so the next screen opens instantly | Linked trees |
| **Breadcrumb** | A "you are here" trail of links showing the path taken, each clickable to go back | Linked trees |
| **Popover** | A small floating panel anchored to an element, shown on hover/tap | Linked-tree preview |
| **Zod schema** | A description of what valid data looks like, used for automatic validation | Forms, API, AI JSON |
| **OpenAPI** | A standard machine-readable description of an HTTP API; tools render it as interactive docs | API reference |
| **ADR** | Architecture Decision Record: a short note explaining one important decision, its alternatives and why | `docs/adr/` |
| **i18n** | Internationalization: UI text kept in per-language files, looked up by key | Vietnamese UI |
| **Middleware** | Checkpoints a request passes through, in order, before reaching the handler | API |
| **JWT** | A signed "ticket" proving who you are | Auth |
| **httpOnly cookie** | A cookie page JavaScript cannot read, so injected scripts (XSS) cannot steal it | Auth |
| **Third-party cookie** | A cookie from a different site than the one open in the tab; increasingly blocked by browsers | Why the `/api` proxy exists |
| **Proxy** | An intermediary that forwards requests, so the browser sees a single origin | Netlify `_redirects` |
| **Rate limit** | A cap on requests per time window, against spam and password guessing | API |
| **Cron job** | A task scheduled to run periodically | Reminders |
| **Idempotent** | Running it once or ten times gives the same result | Reminder job |
| **Unique index** | A database rule that forbids two records with the same combination of values; enforced even under concurrent writes | ReminderLog |
| **E11000** | MongoDB's duplicate-key error code | Reminder job |
| **Race condition** | Two processes run almost simultaneously, both "check then act", and both act | Why "sign first, send after" |
| **Web Push / VAPID** | Notifications that appear even when the site is closed; VAPID keys prove they come from our server | Reminders |
| **Snapshot** | A full copy of data at one moment, used to restore it | `deletePerson` inverse |
| **Error Boundary** | A React component that catches errors in its children so only that area shows an error | Client |
| **Exponential backoff** | Retrying after 1 s, 2 s, 4 s… so the server is not hammered | Sending ops offline |
| **Cold start** | A free server "sleeps" when idle; the first request waits for it to start | Render |
| **Property-based testing** | Instead of a few hand-picked examples, generate thousands of random inputs and check rules that must always hold | Lunar tests |
| **Differential testing** | Run two independent implementations on the same inputs and compare results | Lunar tests vs astronomy-engine |
| **Ephemeris** | High-precision astronomical tables/models of where the sun and moon are at any time | `astronomy-engine` |
| **Coverage** | Share of code lines exercised by tests | CI |
| **CI** | A service that runs lint/tests/build automatically on every push | GitHub Actions |
| **E2E test** | A test where a script drives a real browser like a user | Playwright |
| **Design tokens** | Named design values (colors, spacing, radii, fonts) defined once and reused everywhere | §13.3 |
| **OKLCH** | A color space where equal numeric steps look equally different to the eye; good for building balanced palettes | Branch colors |
| **GEDCOM** | The standard file format for exchanging genealogy data | Phase 2 |
| **Progenitor (thuỷ tổ)** | The founding ancestor of the clan, generation 1 | `Clan.progenitorId` |
| **In-law (dâu/rể)** | Someone who married into the clan | §8 |
| **First / second anniversary (giỗ đầu / giỗ hết)** | Death anniversary in the 1st / 2nd lunar year after death | §9.2 |

---

## 20. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Time budget | 10–15 h/week × 8 weeks | |
| Audience | Multi-clan platform with roles | Stronger CV; own family as first users |
| Showcase features | Large smooth tree + edit history | Pure React/performance, low risk |
| Real-time | Phase 2, Operation model ready from day one | Can be added without rewrites |
| Architecture | MERN monorepo + `packages/shared` | Builds on MERN background; shared schemas and `applyOp` |
| Tree rendering | React Flow + custom layout in a Web Worker | Pan/zoom/culling for free; layout is the engineering story |
| In-laws | Beside spouse, never expanded upward; configurable daughters' descendants | Keeps layout O(n) and readable; respects tradition but flexible |
| Other families | Linked trees: hover indicator + preview, click opens the shared tree with a breadcrumb back | Connects families without merging data; each clan keeps control of its own tree |
| Lunar calendar | Hồ Ngọc Đức algorithm, UTC+7, behind a `LunarCalendar` interface | Correct for Vietnam; no year limit; swappable |
| AI import | Users run their own AI chat and paste JSON | Free, no API keys stored, safe |
| Mobile | PWA instead of native apps | No store accounts needed; installable + push |
| Language | English in repo; Vietnamese UI via i18n; bilingual design docs | Professional codebase; real users are Vietnamese |
| Web hosting | Netlify | Familiar; commercial use allowed; deploy only from `main` |
| Reminder triggering | Cloudflare Worker Cron + cron-job.org backup + Sentry monitor + catch-up | Independent of commits; tolerates cold starts; missed days are sent late, not lost |
| Docs | User guide + generated OpenAPI + generated error codes + ADRs | Measurable (S8); signals engineering maturity |
| Visual direction | "Family scrapbook" on grid paper: polaroids, washi tape = branch, threads, stamps and stickers (§13.3) | Appeals to younger users and leaves room for birthdays; every decoration encodes data |
| Relationship editing | Drag to relate on the board, with cut, follow-up questions and undo; keyboard menu as an alternative (§7.6) | Fixing mistakes is direct and never a dead end |
| Image storage | One Cloudinary cloud, `ancestors-tree/<env>/clans/<clanId>/people/<personId>/<random>`, every upload signed and verified by the API (§12) | Clans and people are deleted by prefix; no names in URLs; dev and prod stay apart without a second account |
