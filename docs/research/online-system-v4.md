# Online system research and implementation decisions

Checked 30 September 2026. Current choice is a real native iPhone app with free Apple Maps; this supersedes the Google Maps options in v3. The new Supabase project is `mzjmhvwixptrmnaalijt`. Source implementation and local verification exist under `backend/`; live deployment and acceptance must be reported separately.

## Accounts, privacy and friendship

Use Supabase Auth for passwords, confirmation and recovery. The client receives only a publishable key and user session. Secret/service credentials stay in Edge runtime variables. Each write RPC derives its actor from `auth.uid()`; fixed empty function search paths, explicit execute grants and RLS restrict direct reads. Profiles are private to self/accepted friends; a rate-bounded exact-handle request flow is not a public directory. Supabase documents RLS and separate execute permissions for database functions. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [password authentication](https://supabase.com/docs/guides/auth/passwords).

The canonical friend pair has one row with a unique ordered pair, one requester and an explicit state. Recipient-only acceptance, paired advisory locks and row locks prevent crossed requests or simultaneous actions from silently granting friendship. Block works both ways for visibility. Friendship generations prevent an old route share from reappearing after removal and later reconnection. Auth failure and invalid requests roll back transactions, so database daily quotas bound successful actions, not all failed network attempts; production abuse handling also needs Auth/project rate limits.

The default Supabase email sender is restricted; custom SMTP and app redirect configuration are prerequisites for reliable signup/recovery for real users. Creating a project does not complete that setup. [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp).

## Online status without location

Use opt-in server Broadcast, not a trusted client-authored `online:true`. The foreground client sends a heartbeat; the server publishes the authenticated UID with a 70-second expiry on an opaque friend-pair topic. No GPS is broadcast. Recipients join private channels using RLS. Disable public Realtime access, refresh memberships on relationship changes and render expired status as offline/unknown. Presence authorization is cached on a connection; rotating the topic after revocation stops subsequent writes to a formerly authorized topic. This addresses a documented limitation rather than assuming policy edits instantly evict clients. [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [server Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Presence behavior](https://supabase.com/docs/guides/realtime/presence).

## Routes and challenges

The owner saves 2–12 named coordinates with an optimistic revision number. Sharing is explicit and friend-only. Challenges snapshot that exact revision, category and stop order before invitations; later edits/deletion cannot change the invitation. Group rides work for normal routes. A timed challenge additionally requires operator-approved closed-course geometry, the reviewed route revision and an approved time session. A client checkbox cannot approve a course. Create, invite, accept/decline/withdraw and creator cancel are transactional RPCs; unrelated users cannot discover the private challenge.

Apple Maps renders user pins locally; no paid Google key or backend directions service is required by this architecture. Straight connectors show stop order only; they are not computed road directions, route distance or ETA. Directions remain an explicit handoff to Maps until a real routing service is implemented.

## Posts and pictures

Posts begin as private drafts. Publishing explicitly chooses private, friends or authenticated community visibility and may disclose a copy of the author's route. User-supplied speed remains labelled self-reported and cannot affect ranks. Reports are private, the author can delete, and an operator can hide posts or revoke records. Blocked users lose post access in both directions.

Images/evidence use private buckets with size/MIME caps. Upload paths tie authenticated owners to their own draft or submission. Evidence cannot be overwritten. The `media-url` Edge Function first queries post RLS as the caller, then signs the approved object's URL for 60 seconds; the recipient cannot choose a longer expiry. Signed links remain usable until expiry after a block/delete. Strip EXIF before upload, and implement an operational retention policy for unused binaries before public release. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [private downloads and signed URLs](https://supabase.com/docs/guides/storage/serving/downloads).

## Credible measurements and rankings

The evidence envelope contains actual CoreLocation timestamps, latitude/longitude, speed, horizontal accuracy and speed accuracy. The Edge verifier validates ordering, quality, gaps, coordinate/speed consistency, approved boundary and challenge/session time. It finds complete three-second windows supported by at least four observations, conservatively takes the minimum supported speed, and chooses the highest such window. It never treats three samples as three seconds. Missing native speed accuracy cannot be invented.

Only the service-authorized finalizer can create a ranked record; owner/category/course are derived from the saved challenge. The job lease uses a fresh token so an older timed-out worker cannot release, reject or finalize a newer attempt. The SHA-256 of immutable evidence is retained for review. Rejected, pending, private or self-reported values are excluded from public ranks. Server recomputation checks submitted evidence, but does not prove that client GNSS data are authentic; device attestation and stronger anti-cheat are separate future work.

Rankings use one best eligible result per rider and vehicle category, optional course filtering, audience checks and shared ranks for ties. Day/week/month periods are **Asia/Bangkok calendar periods** (Monday week start), while stored event timestamps are UTC instants. This measures sustained speed within an approved course/session, not lap completion or route elapsed time.

## Verification and remaining setup

Fourteen tests currently pass: nine real PostgreSQL authorization/lifecycle tests and five measurement tests. PGlite runs PostgreSQL in WASM; Auth, Storage and Realtime network services are stubbed here. Both Edge entrypoints pass Deno TypeScript checking. Hosted signed links, Broadcast delivery, email delivery, native evidence upload and a controlled-course end-to-end result still require live checks. [PGlite](https://pglite.dev/docs/).

The handlers authenticate Bearer sessions with Supabase Auth before data access and use platform-injected server credentials. The checked CLI supports API-based function bundling without Docker. Deployment instructions, source staging, operator setup and live checks are in `backend/README.md`; no credentials belong in the public repository. [Edge authentication](https://supabase.com/docs/guides/functions/auth), [runtime secrets](https://supabase.com/docs/guides/functions/secrets), [deployment](https://supabase.com/docs/guides/functions/deploy).
