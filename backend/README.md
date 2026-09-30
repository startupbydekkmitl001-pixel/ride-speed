# RideSpeed online backend

Deployment sources for Supabase Auth, PostgreSQL/RLS, private Storage, server Broadcast presence and four Edge Functions. [API.md](API.md) is the native contract. No credentials or artificial course approvals are seeded.

Local verification: Node 24, `npm ci` then `npm test` in this directory. Tests execute **all** timestamp-sorted migrations with real PostgreSQL grants/RLS in PGlite, evidence recomputation and the maintained Edge handlers. Coverage includes onboarding/profile separation, preference revisions, ghost-mode topic revocation, owner-bound immutable avatar uploads, accepted/blocked avatar access, cross-owner challenge/evidence/record deletion, stale verifier fencing, deletion retries and Storage→DB→Auth failure gates. Auth, Storage and Realtime boundaries are stubs; these tests do **not** prove a hosted Supabase integration. Check all Edge entrypoints:

```powershell
npx --yes deno check --node-modules-dir=auto functions/media-url/index.ts functions/verify-submission/index.ts functions/profile-avatar-url/index.ts functions/delete-account/index.ts
```

## Deploy to the already-created project

Target project: `mzjmhvwixptrmnaalijt` (`ride-speed`, Singapore). Do not apply the foundation twice: it is a versioned creation migration, not a reset script. Preserve real data on later upgrades through new migrations.

**History gate:** the foundation was applied via dashboard; CLI history was still absent on the 1 October read-only check. Verify every already-deployed migration's SHA-256 against DEPLOYMENT.md, then reconcile it as applied using the CLI migration repair workflow before any `db push`. A dry run must list **only reviewed, unapplied additive migrations**, never the foundation or a dashboard-applied upgrade. M1 uses `202610010002_profile_account_lifecycle.sql` and the separate `202610010003_deletion_receipt_lookup.sql`; once either is dashboard-applied, it must not appear again. If a dry run lists deployed SQL, stop and reconcile history. Alternatively apply only exact reviewed additive SQL once through the dashboard and record its hash. These sources never reset a project.

From the repository root, stage maintained sources into the CLI's required `supabase/` layout. The linked-project workflow below requires the history gate first:

```powershell
node backend/scripts/stage-supabase.mjs
npx --yes supabase login
npx --yes supabase link --workdir backend/.supabase-work --project-ref mzjmhvwixptrmnaalijt
npx --yes supabase db push --workdir backend/.supabase-work --dry-run
npx --yes supabase db push --workdir backend/.supabase-work
npx --yes supabase functions deploy media-url verify-submission profile-avatar-url delete-account --workdir backend/.supabase-work --project-ref mzjmhvwixptrmnaalijt --use-api
```

The CLI can prompt securely for database credentials; do not paste credentials into source, chat, screenshots or shell command arguments. `--use-api` bundles remotely without Docker. Alternatively, apply the exact migration once in the authenticated dashboard SQL editor, then manage migration history before subsequent CLI pushes. The staged directory is ignored; edit canonical backend sources and restage after changes. These commands are preparation instructions, not a claim of deployment.

For the dashboard editor's single-file code input, run `node scripts/bundle-edge-dashboard.cjs` from the repository root. It writes only the two M1 handler bundles and a source/hash manifest to ignored `build/deploy-m1/`. Check the generated bundles with Deno before deployment, and compare the saved editor content against those exact bundles. Canonical multi-file sources remain in backend/functions. Bundling reads no credentials and performs no deployment.

Function gateway JWT checking is disabled in config because all four handlers validate the caller's Bearer JWT with Auth `getUser` before touching user data. Do not remove that application authentication. The handlers use platform-injected named publishable/secret key maps, single-key fallbacks, or legacy anon/service-role variables. Never put a secret/service key in an `EXPO_PUBLIC_` variable. Optional `ALLOWED_ORIGINS` is a comma-separated list of exact approved web origins; native requests without Origin work without it.

Project configuration:

1. Keep `ride_private` outside the Data API exposed-schema list. Leave RLS enabled on application and managed service tables. Audit existing permissive Storage/Realtime policies; policy alternatives combine with OR, so a broad old policy can bypass these restrictions.
2. Realtime: disable **Allow public access**. Presence uses private Broadcast topics authorized by `realtime.messages` SELECT policies. No client broadcast INSERT permission is granted. Realtime authorization is cached, so relationship/opt-in changes rotate topics and clients must refresh subscriptions. All cached online indicators expire after 70 seconds.
3. Auth: enable email confirmation and set a real app redirect allowlist. Configure custom SMTP before inviting ordinary users; the default sender is restricted and unsuitable for production signup. Configure password recovery redirect handling in the native app. Passwords remain in Supabase Auth.
4. Storage buckets remain private. Uploads have MIME/size caps. Clients remove EXIF/location metadata before image upload. Other viewers receive only 60-second signed links after the Edge Function checks post RLS. Previously issued links remain usable until expiry. Choose and operate an evidence/image retention cleanup policy before broad release; deleting database users alone does not remove Storage binaries.
5. Only an operator may approve a real closed course, its boundary polygon (`[{lat,lng},…]`), a reviewed saved-route revision and an authorized time session. Never approve roads or seed test fixtures into production. A normal route supports group rides immediately; timed ranks stay empty until real eligible records exist.

M1 operational gates: avatars are private `ride-avatars` objects capped at 1 MiB (JPEG/PNG/WebP). A signed self-avatar refresh performs bounded obsolete/expired cleanup, but a periodic off-device cleanup and seven-day completed-deletion-receipt retention job still need to be operated before broad release. Deletion jobs retain only owner/request IDs, timestamps/status and error codes. Lost-final-response recovery requires the original unexpired asymmetric JWT and exact completed receipt; it never uses verified claims to authorize a mutation. No password/JWT or removed profile data is retained in the receipt. Expired-token recovery still needs truthful client sign-out/quarantine guidance or operator receipt inspection. Direct Auth deletion is not a substitute for Storage→DB→Auth cleanup.

## Live acceptance checks

Use separate, consented test accounts. Confirm registration/recovery delivery and app links; real image upload plus authorized/blocked/deleted image access; private Broadcast join, opt-out, disconnect TTL and topic rotation; friend acceptance and route revisions; a group invitation's accept/decline/cancel transitions. Verify anonymous and unrelated accounts cannot read protected rows or call server-only RPCs. Revoke test artifacts afterward.

For M1, confirm established profiles still open the map while a new Auth-only account has incomplete state; skip permission/profile/vehicle without fabricated data; restart during onboarding and after preference save. Use a consented test avatar to verify reserve/upload/commit/retry, actual MIME/size caps, private Storage access and signed self/friend/block access. Toggle ghost mode in both directions and observe the authoritative friend presence. Review the typed DELETE sheet and rejection paths without submitting actual deletion for the real owner. Successful account deletion requires a separately authorized disposable-account acceptance test; local PostgreSQL/handler tests cover ordering/retry but do not prove managed Auth/Storage deletion in the hosted service.

For verification, use a controlled approved course/session and actual CoreLocation samples. Upload UTF-8 evidence, queue it, invoke `verify-submission`, and confirm the derived result only enters the chosen audience and correct Bangkok date/category. Missing speed accuracy, a three-sample maximum, malformed evidence and public-road rides must not create ranks. No synthetic fixture is valid production evidence.

The verifier recomputes the highest conservative three-second **minimum speed** from consecutive valid observations. It checks real sample times, gaps ≤1.5s, horizontal accuracy ≤15m, speed accuracy ≤1m/s, speed/acceleration/coordinate consistency, approved course boundary and session. It requires at least four observations and rejects missing native fields. Explicit simulated/mock flags anywhere in the stream reject the entire submission, while absent/null flags remain unknown. A real accessory source is allowed and must pass every other check. It measures sustained speed, not a completed lap or route time. Server processing of a client-supplied sample stream is not sensor attestation or a full anti-cheat system.

An atomic two-minute, token-fenced lease prevents parallel/stale workers from committing. Three attempts are allowed; transient failures requeue, invalid evidence rejects, and exhausted jobs need operator inspection. Operator-only moderation and record-revocation RPCs exist; a moderation queue/retention job and GNSS attestation are future operational work, not implemented services.
