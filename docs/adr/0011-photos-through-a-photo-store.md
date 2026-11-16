# ADR 0011: Photos through a PhotoStore, shrunk in the browser

- Status: Accepted
- Date: 2026-11-17

## Context

P6d puts a photo on each person's card and profile (spec §7.6 "Photo", §12). The photos need a host that crops around the face, serves the card and profile sizes from one original, and accepts signed uploads, so a browser can only write where the API allows.

- The API must stay the only place that names photo paths and holds the host's secret. The web app knows only the cloud name, which is public.
- Spec §12 caps a photo at 2 MB. A phone photo is 3–6 MB, so a straight upload of most family photos would be refused.
- Photos are part of the tree, so they must behave like every other edit: saved through the operation log, undone, reverted and shown in the history.

## Decision

**Cloudinary, behind a small `PhotoStore`.** `apps/api/src/photos/store.ts` defines four calls: `signUpload` (the URL and signed fields for one upload), `inspect` (an asset's bytes and version), `destroy` and `deletePrefix`. `cloudinary.ts` implements them with the official `cloudinary` SDK. `createMemoryPhotoStore` keeps assets in a `Map` for unit tests; the e2e server uses it with `assumeUploaded`, because the browser's upload never reaches that process. Without a configured store, signing answers `PHOTOS_NOT_CONFIGURED`.

**The browser shrinks, then uploads straight to Cloudinary.** `photoFile.ts` checks the type (jpg, png or webp), then draws the photo upright at no more than 1600 px on its long side and re-encodes it as WebP, or as JPEG where the browser cannot write WebP, at quality 0.85. Only a result over 2 MB is refused. `POST /api/clans/:id/people/:personId/photo-upload` signs one upload for a new random path under that person's folder (`…/clans/:clanId/people/:personId/<16 hex>`). The browser posts the file and the signed fields to Cloudinary with XHR, not fetch, because only XHR reports upload progress for the progress bar.

**A photo is an ordinary `updatePerson`.** The op stores `{ publicId, version }`. Before its transaction, the server verifies every photo an op sets, undo, redo and revert included (`verifyOpPhotos`): the id must be under this person's prefix, exist on the host, have that version and weigh at most 2 MB. An oversized asset inside the person's folder is deleted; nothing outside it ever is. A failed check is a 422 `PHOTO_REJECTED`, also when photos are not set up on the server: the web's send queue retries 5xx answers, so a 503 would retry forever.

**Photo changes run through the change runner** (ADR 0010). "Đổi ảnh" and "Gỡ ảnh" sit on the profile photo and save at once as their own undo step, with the "Đã đổi" toast, its Undo, and a history phrase ("đổi ảnh của …", "gỡ ảnh của …").

**Deleting a clan deletes its photos.** After the clan's transaction commits, the route deletes the clan's prefix. A failure there is only logged: the clan is already gone, and its assets are unreachable.

## Alternatives considered

- **Uploading through the API.** Every photo would cross Render twice, costing its bandwidth and needing a larger body limit than the JSON routes.
- **Unsigned upload presets.** The browser would choose the path, so anyone could write anywhere in the folder.
- **Our own signing over Cloudinary's REST API, without the SDK.** More code to get right (the parameter order, the signature and the admin calls), for one fewer dependency.
- **A manual crop tool.** Deferred: `g_face` crops most portraits well. Group and scanned photos are the cases it will not cover.

## Consequences

- One more API dependency, `cloudinary`, used only in `apps/api/src/photos/cloudinary.ts`.
- A replaced or removed photo stays on Cloudinary, because undo and revert may bring it back. Unreferenced assets are cleaned up in Phase 2 (spec §12).
- A Cloudinary outage fails photo saves with a 5xx that the queue retries; other edits carry no photo, so they never call the host.
- Netlify needs `VITE_CLOUDINARY_CLOUD_NAME` at build time. Without it the web app hides the photo controls and draws initials.
- The CSP allows the two Cloudinary hosts: `res.cloudinary.com` for images, `api.cloudinary.com` for the upload.
