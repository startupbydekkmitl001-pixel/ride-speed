# RideSpeed online backend

Deployment sources for Supabase Auth, PostgreSQL/RLS, private Storage, server Broadcast presence and two Edge Functions. [API.md](API.md) is the native contract. No credentials or artificial course approvals are seeded.

Local verification: `npm ci` then `npm test` in this directory. Fourteen tests execute the migration and real PostgreSQL grants/RLS in PGlite, plus evidence recomputation. Auth, Storage and Realtime service schemas are stubs; these tests do **not** prove a hosted Supabase integration. Edge TypeScript checks pass with `npx --yes deno check --node-modules-dir=auto functions/media-url/index.ts functions/verify-submission/index.ts`.

## Deploy to the already-created project

Target project: `mzjmhvwixptrmnaalijt` (`ride-speed`, Singapore). Do not apply the foundation twice: it is a versioned creation migration, not a reset script. Preserve real data on later upgrades through new migrations.

From the repository root, stage the maintained backend files into the CLI's required `supabase/` layout:

```powershell
node backend/scripts/stage-supabase.mjs
npx --yes supabase login
npx --yes supabase db push --workdir backend/.supabase-work --project-ref mzjmhvwixptrmnaalijt --dry-run
npx --yes supabase db push --workdir backend/.supabase-work --project-ref mzjmhvwixptrmnaalijt
npx --yes supabase functions deploy media-url verify-submission --workdir backend/.supabase-work --project-ref mzjmhvwixptrmnaalijt --use-api
```

The CLI can prompt securely for database credentials; do not paste credentials into source, chat, screenshots or shell command arguments. `--use-api` bundles remotely without Docker. Alternatively, apply the exact migration once in the authenticated dashboard SQL editor, then manage migration history before subsequent CLI pushes. The staged directory is ignored; edit canonical backend sources and restage after changes. These commands are preparation instructions, not a claim of deployment.

Function gateway JWT checking is disabled in config because both handlers validate the caller's Bearer JWT with Auth `getUser` before touching user data. Do not remove that application authentication. The handlers use platform-injected named publishable/secret key maps, single-key fallbacks, or legacy anon/service-role variables. Never put a secret/service key in an `EXPO_PUBLIC_` variable. Optional `ALLOWED_ORIGINS` is a comma-separated list of exact approved web origins; native requests without Origin work without it.

Project configuration:

1. Keep `ride_private` outside the Data API exposed-schema list. Leave RLS enabled on application and managed service tables. Audit existing permissive Storage/Realtime policies; policy alternatives combine with OR, so a broad old policy can bypass these restrictions.
2. Realtime: disable **Allow public access**. Presence uses private Broadcast topics authorized by `realtime.messages` SELECT policies. No client broadcast INSERT permission is granted. Realtime authorization is cached, so relationship/opt-in changes rotate topics and clients must refresh subscriptions. All cached online indicators expire after 70 seconds.
3. Auth: enable email confirmation and set a real app redirect allowlist. Configure custom SMTP before inviting ordinary users; the default sender is restricted and unsuitable for production signup. Configure password recovery redirect handling in the native app. Passwords remain in Supabase Auth.
4. Storage buckets remain private. Uploads have MIME/size caps. Clients remove EXIF/location metadata before image upload. Other viewers receive only 60-second signed links after the Edge Function checks post RLS. Previously issued links remain usable until expiry. Choose and operate an evidence/image retention cleanup policy before broad release; deleting database users alone does not remove Storage binaries.
5. Only an operator may approve a real closed course, its boundary polygon (`[{lat,lng},…]`), a reviewed saved-route revision and an authorized time session. Never approve roads or seed test fixtures into production. A normal route supports group rides immediately; timed ranks stay empty until real eligible records exist.

## Live acceptance checks

Use separate, consented test accounts. Confirm registration/recovery delivery and app links; real image upload plus authorized/blocked/deleted image access; private Broadcast join, opt-out, disconnect TTL and topic rotation; friend acceptance and route revisions; a group invitation's accept/decline/cancel transitions. Verify anonymous and unrelated accounts cannot read protected rows or call server-only RPCs. Revoke test artifacts afterward.

For verification, use a controlled approved course/session and actual CoreLocation samples. Upload UTF-8 evidence, queue it, invoke `verify-submission`, and confirm the derived result only enters the chosen audience and correct Bangkok date/category. Missing speed accuracy, a three-sample maximum, malformed evidence and public-road rides must not create ranks. No synthetic fixture is valid production evidence.

The verifier recomputes the highest conservative three-second **minimum speed** from consecutive valid observations. It checks real sample times, gaps ≤1.5s, horizontal accuracy ≤15m, speed accuracy ≤1m/s, speed/acceleration/coordinate consistency, approved course boundary and session. It requires at least four observations and rejects missing native fields. It measures sustained speed, not a completed lap or route time. Server processing of a client-supplied sample stream is not sensor attestation or a full anti-cheat system.

An atomic two-minute, token-fenced lease prevents parallel/stale workers from committing. Three attempts are allowed; transient failures requeue, invalid evidence rejects, and exhausted jobs need operator inspection. Operator-only moderation and record-revocation RPCs exist; a moderation queue/retention job and GNSS attestation are future operational work, not implemented services.
