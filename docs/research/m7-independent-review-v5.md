# M7 independent Community review — 1 October 2026

This records source and local behavior review. It performs no hosted mutation, production fixture upload, moderation action, cleanup invocation or account deletion.

## Frozen backend evidence

Reviewed additive 011 SHA-256: `ADCFA97FB0B81F7727B7068310062873D19A1C77AFEA38768AA2E539861EEBAC`. The shared JPEG, media, cleanup and strict-vendor hashes match the final inventory in `backend/DEPLOYMENT.md`. Independently reran the complete backend suite: **274/274 pass, zero skips**. Four Community concurrency cases use independent connections to disposable PostgreSQL 17.11; canonical wire tests use the actual migrations and maintained frontend decoders.

The bounded review covers exact owner/request/revision/reservation identity; successful replay and unknown-outcome recovery; current parent and child visibility; author-only comment deletion; explicit publication and safe attachment copies; metadata-only owned privacy settings; private Storage and signer authorization; default-deny table/function grants; retirement of superseded browser mutation/upload paths; aggregate capacity entry fences; verification-versus-quarantine ordering; and binary-first account cleanup. The readiness query reads aggregate counts and catalog permissions without exposing post contents, media paths, account identities or credentials.

The JPEG review checks the pinned upstream hash and exact strict-fork delta, real bounded entropy-to-pixel decoding, actual-byte digest and dimensions, metadata/trailing/unread-payload rejection, derived pixel BlurHash and progressive/grayscale fixtures. Commit and signing handlers accept server-issued identity, never caller-supplied paths or remote download URLs. A short-lived signed URL can remain usable until its 60-second expiration after revocation; the client must independently retire its rendering lease.

Three independently authored actual database-to-client regressions are in `backend/tests/m7-community-review.test.mjs`:

- Legacy audience and deletion CAS transitions increment exactly once, preserve their immutable receipts and decode on replay.
- The post owner can read another rider's comments through the exact decoder. Its `can_delete` flag is false, the comment author can delete, and a foreign-author deletion is denied.

Both mismatches were reproduced as failing tests before the backend correction. No remaining confirmed backend P1/P2 was found in this review.

After 011 became immutable, a separate upgrade edge was found: the original pre-011 delete operation could leave an unpublished draft terminal at revision0, which the strict owner metadata reader correctly refused. Independently reviewed additive 012 SHA-256 `D68F84930EDF17F6BAE544F7E6529BACD4F34D28E88B3DBDC7E9EFC71D532F09`. It repairs only deleted v0 revision0 metadata and adds a not-deleted condition to the three legacy draft decisions; live drafts stay0. The original trigger ABI/grants and deployed011 bytes remain unchanged. Independently reran actual pre-upgrade/getter/page/ACL tests plus prior decoder repros: **6/6 pass, zero skips**. This is source clearance, not a claim of 012 hosted deployment.

## App durability and presentation evidence

Actual `CommunityState` tests use real coordinator, local model and private PhotoStore implementations with injected OS/storage/SDK ports. They cover hydration before egress; account generation and foreground/movement ABA fences; a host's captured focus guard after held preflight and queue flush; durable draft settlement before queue removal; exact UUID recovery after missing queue persistence; runtime private upload identity/size constraints; immutable private byte reads; failed published cleanup and restart recovery; local draft discard; and synchronous owner closure.

`CommunityPhotoStore.putAndAdopt` keeps the serialized disk lane through durable metadata adoption. `prune` receives a fresh metadata reference reader and repeats owner/activity checks before every removal. Ambiguous adoption preserves bytes, read failure is never interpreted as an empty reference set, and cleanup failure remains retryable. Existing `put` remains compatible. The provider and photo/adoption checks independently passed **28/28**, with zero skips.

The FlashList 2.0.2 migration was checked against installed `ViewHolder` and viewability implementation. Changed rows receive new item/render callbacks; the private media component immediately hides another binding's URL, resets bounded per-asset retry state, denies obsolete replies/errors and supplies Expo Image's native `recyclingKey`. Feed visibility belongs to the exact owner generation/filter list, never a retained callback from another list. Independently reran **79/79** actual component/host/media/provider/photo/Ranked checks, zero skips. These are source/lifecycle checks, not a scrolling frame-rate measurement.

The owner settings review separately reproduced retained confirmation after cancel and retained deletion after audience selection. Memory-only consent/action tickets now retire these callbacks. A subsequent integration check found a false rejection when a successfully queued privacy action intentionally retired its canonical getter before returning the operation ID. Corrected post-success presentation retains the local consent/activity guard while requiring canonical authority before and throughout queue acceptance. Auth-only owner settings use a narrowly scoped profile exemption; all other Community controls retain their profile requirement, and exact pending privacy work stays retryable. Independently reran **64/64** owner model/transport/Reader/host/UI and ordinary Community component/host checks, zero skips; all **25** owner cases pass. Scoped lint and the full app typecheck also pass. No remaining confirmed P1/P2 was found in this bounded owner review. These frontend findings do not change the frozen backend hashes.

## Remaining acceptance boundaries

Actual installed iOS/Android codec output, hosted Edge entropy CPU/memory, managed Storage/signing behavior, private cleanup operation, organization usage, sustained scrolling/battery/memory and paired native race/live behavior require their own runtime acceptance. No native 60/120 Hz claim follows from these tests. Neither this review nor backend local tests enable live/race policies, install schedules, approve courses or manufacture public records.
