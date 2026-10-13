# Listing image storage

Listing documents now accept optional `imageUrl: String?`. Omit it or use `null` for listings without an image; existing listings remain valid. A supplied URL must contain 8–2048 characters. Empty strings are rejected. The listing owner may change or clear the reference; other users cannot. The existing category and channel fields remain strings, so Event, T-shirts, Hats and Other are supported alongside all existing channels.

Listings also accept optional `kind: 'placement' | 'service' | null`. A missing or null kind is interpreted by the app as a legacy placement. The owner may change the kind; all other non-null values, including an empty string, are rejected on create and update. Service categories such as Photography, Video, Design, Content, Hosting, Music, Community, Development and Other use the existing category string. Kind is catalog metadata and does not alter escrow authorization or terms.

Upload a JPEG, PNG, WebP or AVIF to:

```ts
const path = `listingImages/${user.id}/files/image_${crypto.randomUUID()}`;
const result = await setFile(path, file);
```

Use the stable account identity `user.id`, not `user.address`, for the path. Those values differ for email/social accounts. Ownership is established by the path; no custom metadata is needed. The current browser SDK's core declaration accepts `metadata`, while the installed server wallet-client declaration does not expose it. This implementation works without it on either client.

The storage create rule requires an authenticated account matching `$userId`. The read rule permits public serving only when trusted persisted `@data.size > 0 && @data.size <= 5242880` and `@data.contentType` is JPEG, PNG, WebP or AVIF. `proofs.publicReads` names this exact collection so the verifier recognizes the deliberately public subset; the declaration does not widen runtime access. Updates remain denied. Deletion requires the authenticated path owner and an invalid-image READ predicate; valid public images cannot be deleted.

These are **public-serving limits, not app-specific storage-admission limits**. The browser validates type and 5 MiB before upload, and the platform applies its own upload quota. A custom client can upload an unsupported or oversized file into its own namespace, but the persisted metadata read rule must prevent it from receiving a public URL or being served. Such files consume storage until their owner deletes them; other accounts cannot remove them. The policy does not decode image bytes or guarantee an asserted image MIME contains valid image data.

`setFile` supplies the system metadata; never pass `size`, `contentType`, `status`, `uploadedBy` or `createdAt` as custom metadata. The previous CREATE rule evaluated system size/type before they were available and refused every upload. An explicit-field probe on backend revision 4/runtime 7 did not resolve that timing issue. The current contract checks those fields on READ instead.

The frontend should validate the same type/size constraints before uploading, validate HTTPS before rendering or persisting a URL, and handle returned paths and uncertain outcomes explicitly:

1. Preserve `result.path` exactly; the server can return a concrete path different from a requested collection path.
2. For `status: 'uploaded'`, the object committed. Use its non-null public URL, or resolve the matching path through `getFiles('listingImages/<userId>/files')` when visibility or URL is missing.
3. For `status: 'unknown'`, retain the returned path and reconcile it. Do not blindly re-upload: the original object may have committed, and a new attempt may create another permanent object.
4. Store only the permanent public URL in `listing.imageUrl`. A private signed URL must never be persisted as the listing image.

The collection is `type: 'storage'`, offchain, with a persisted-metadata read predicate and updates denied. Only an invalid unreadable file can be deleted, by its path owner. Public file URLs are tokenless and permanent while the policy continues to allow anonymous reads. Valid public image bytes cannot be replaced or deleted, including by the uploader. To replace a listing image, upload to a fresh path and update the listing reference. Uploading an image and saving a listing are separate operations; failed/cancelled listing creation can leave an unreferenced immutable upload.

According to the current Bounded file-storage documentation, public files are served from the realtime origin, use `Cache-Control: public, no-store`, and each fetch is billed as a request. Public immutable storage provides stable image URLs for this initial app; a larger image workload will need a deliberate delivery/caching design. The file endpoint's attachment disposition applies to direct navigation; actual embedded image rendering should be checked in the browser during final UI acceptance.

## Validation

`policy-tests/10-image-storage.json` exercises account versus wallet identity, owner/non-owner creation, denied modification/deletion of valid images, and owner-only deletion of invalid uploads. Seeded metadata fixtures exercise the READ predicate for four accepted MIME types, size boundaries, and rejected SVG/GIF/HTML. The sandbox expectation evaluator reads fixture state without applying document READ authorization, so these predicate assertions are not HTTP read-access tests. Actual anonymous serving is covered by the real integration below.

`policy-tests/11-listing-image-reference.json` checks legacy records, owner-only reference edits, length bounds and the four added category labels.

`policy-tests/12-listing-kind.json` checks absent/null legacy kinds, both accepted kinds, invalid create/update values, owner-only kind edits, and service category labels.

After the new policy is deployed, run `node scripts/test-listing-images.mjs`. The integration script creates ephemeral identities entirely in memory, uses the installed real SDK to upload a tiny PNG, proves anonymous download returns those bytes, exercises ownership denials, verifies an inactive Photography service listing retains the URL, and confirms both a tiny unsupported SVG and an actual 5 MiB + 1 byte upload receive no public URL, are absent from public listings, and return HTTP 403 on the same public download route without credentials. It removes both invalid uploads through the owner-only delete rule and leaves one tiny immutable public PNG and one inactive test listing; it does not perform any escrow or token operation. It never writes or logs keys, session tokens or request headers. An ambiguous upload result fails the run and must be reconciled before retrying the test.

The live contract was verified on backend revision 5/runtime publication 8: all 12 policy suites passed (318 steps), the verifier reported zero failures across 70 checks, and the real SDK integration passed. The PNG was downloaded anonymously with identical bytes and stored on an inactive Photography service listing. Separate direct anonymous GET probes returned 403 for SVG and 5 MiB + 1 byte files; every invalid test upload was deleted by its owner. Full release evidence: `/private/tmp/adpad-storage-readgate-summary.json`.

The explicit-field probe evidence is retained in `/private/tmp/adpad-storage-summary.json` with the verify, 12-suite test, preflight, deployment and inspection receipts alongside it. That earlier probe created no image or listing, and returned no ambiguous upload outcome. The read-gate release uses separate `/private/tmp/adpad-storage-readgate-*.json` receipts. The integration script now emits a single sanitized JSON result and preserves any returned upload path for exact-path reconciliation if a future PUT outcome is uncertain.

Reference: installed `bounded-backend/docs/files-and-search.md`, `bounded-frontend/docs/sdk-reference.md`, and the actual installed `@bounded-sh/core`/`@bounded-sh/server` declarations and upload implementation.
