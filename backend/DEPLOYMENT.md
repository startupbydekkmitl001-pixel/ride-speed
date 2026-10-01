# Hosted deployment โ€” 30 September 2026

Project: `ride-speed`, ref `mzjmhvwixptrmnaalijt`, Singapore, free plan.

The foundation migration was applied once through the authenticated Supabase SQL editor, which returned **Success. No rows returned.**

`migrations/202609300001_online_foundation.sql` SHA-256:
`EBE8421F17FFE2E9D593B17AB79976D57F0CC2D566B87E4F4CB83EDD45F5C16C`

Do not apply this creation migration again. Dashboard execution does not record CLI migration history. Reconcile the CLI history against this exact deployed hash before a future `db push`; use new migrations for changes.

Both Edge Functions were bundled from canonical source with esbuild 0.25.12 (`--bundle --platform=neutral --format=esm --external:npm:*`) and deployed through the dashboard editor. Their application code validates user JWTs with Auth `getUser`; the legacy-secret-only gateway check is off.

| Function | Deployed bundle SHA-256 | Live no-token check |
| --- | --- | --- |
| media-url | `65AEAE71E482EF7C3C3E5084D69475F7FAA307468C82BE2C96D3B75F478AA727` | 401 AUTH_REQUIRED |
| verify-submission | `B7661E0AA9A05E70CA1A0EC9996685AB6756443187889B6C2E56D7873D8CC8F0` | 401 AUTH_REQUIRED |

On 1 October both dashboard editors were replaced with the exact canonical bundles, removing a leftover dashboard starter template. The verifier additionally rejects explicitly simulated/mock samples across the entire evidence stream. Saved editor content is compared with the local bundle after reloading; the listed hashes describe these exact bundles.

Anonymous API reads against profiles, routes, posts and verified records returned PostgreSQL 42501. These are live denial checks, not a complete authenticated acceptance test.

Auth site URL: `ridespeed://auth/callback`. Exact redirect allowlist:

- `ridespeed://auth/callback`
- `ridespeed-dev://auth/callback`
- `http://localhost:8082/auth/callback`
- `http://127.0.0.1:8082/auth/callback`

Realtime public-channel access is disabled. Only private channels are allowed; the application's friend authorization policies remain required.

The non-secret `ALLOWED_ORIGINS` function environment setting is `http://localhost:8082,http://127.0.0.1:8082`. It authorizes the local web preview; native requests have no browser Origin header. Revisit local preview callbacks/origins when publishing a hosted web version.

Google OAuth was enabled by the project owner and confirmed by the live Auth settings endpoint (`external.google: true`). Only basic identity scopes are requested (`openid email profile`). On 1 October 2026 (Asia/Bangkok), the owner completed Google consent, the local app displayed successful authentication, and the requested rider name/handle were saved through the authenticated profile flow and retained after a full reload. Community, friends and challenge screens opened under this account without a profile gate. Default email delivery remains restricted to the project team until a custom SMTP provider is configured. No production course approvals, synthetic ride records, user posts or friend relationships were seeded.

Remaining acceptance requires two-account friend/media flows and a real iPhone capture in an approved closed-course session. See `README.md` for the checklist and operational limits.

## V5 M1 — 1 October 2026

Applied the following additive transactions once through the authenticated SQL editor, each returning **Success. No rows returned.** They are immutable deployment sources; make future changes in new migrations.

| Migration | SHA-256 |
| --- | --- |
| 202610010002_profile_account_lifecycle.sql | `0AB2C8FBB5F448A3769044C2FBA76A0044D4F4976DE9CB1DEA666FD1E8B0A282` |
| 202610010003_deletion_receipt_lookup.sql | `DC7BEED0D2F9ED7A26F4C0498CC49284268C13E3011DA71B439914B7B9CD106A` |

Deployed canonical account function bundles generated with `node scripts/bundle-edge-dashboard.cjs`; generated source/hash manifest remains in ignored build/deploy-m1. Both passed Deno checks before deployment. Reloaded function settings confirm the legacy-secret gateway is off; handlers independently validate project Auth. The completed deletion receipt fallback verifies the original unexpired token cryptographically and performs only the exact completed receipt lookup.

| Function | Bundle SHA-256 | Live check |
| --- | --- | --- |
| profile-avatar-url | `6B0F4241E4DCAB40F69FC19C5F42DE2802264F673DB8FDDD04F9625446FAF96E` | POST without token: 401 AUTH_REQUIRED |
| delete-account | `F894176D1950568EE73F77E88292A0E42E034A9631F247C0FC40443BF068B3F4` | POST without token: 401 AUTH_REQUIRED |

Allowed localhost and 127.0.0.1:8082 CORS preflights return 200 with the exact requesting allowed Origin. Real Google sign-in, profile read, ghost preference read and browser session reload pass against this schema. No actual owner deletion, private photo upload, synthetic users or rides occurred. Automated backend acceptance passes 45 tests. Native and disposable-account checks remain explicit gates.

The owner saved GEOAPIFY_API_KEY in private function secrets; only its presence was inspected. Route-service deployment belongs to M4. The secret is never bundled into client/public source.

## V5 M2 — 1 October 2026

Applied `202610010004_private_ride_summaries.sql` once through the authenticated SQL editor; it returned **Success. No rows returned.** SHA-256: `51FFEA033F1E8A71AD52F7DD4448CE95ADC680E1D64F91971097BB902339181D`. Earlier migrations remain unchanged. Dashboard execution still requires explicit CLI-history reconciliation before any `db push`.

This additive transaction provides owner-only, idempotent ride-summary sync, exact operation receipt lookup and bounded keyset history. Summaries remain private and self-reported; they cannot enter verified rankings. It extends the already fenced deletion function to remove these summaries and receipts before Auth removal. Deploying its definition did not delete any user data. No synthetic rides or GPS coordinates were uploaded during this check.

The real signed-in browser opened ride history and retried its cloud read without an error; it correctly showed an empty account. Separate automated backend checks pass 55 cases, including owner isolation, direct mutation denial, payload bounds, operation/revision conflicts, clock anomalies and deletion dependencies. Browser screenshots are retained in ignored `build/review-v5/m2`.

## V5 M3 — 1 October 2026

Applied `202610010005_garage_catalog.sql` and the separate catalog-only seed once through the authenticated SQL editor, each returning **Success. No rows returned.** Deployed `vehicle-photo-url` from the reviewed canonical bundle. Earlier deployed migrations remain immutable; future changes require additive migrations.

The new owner garage/photo contract preserves the existing deletion Edge entrypoint: SQL object enumeration includes `vehicle-photos`, and SQL purge refuses remaining binaries before deleting owner garages, receipts/reservations and Auth. The catalog seed contains no user garage, profile, ride or ranked fixtures. Deployed004 is unchanged;005 adds diesel metadata compatibility through an otherwise identical validator replacement. No account deletion is authorized as routine deployment QA.

Deployed SQL/seed and reviewed canonical source hashes:

| Source | SHA-256 |
| --- | --- |
| 202610010005_garage_catalog.sql | `296DD4767D1E19FBCF870247005BD3D7D3C92F2B2F6D5148BC9F6FD1732A5B08` |
| seeds/vehicle_catalog_v5.sql | `90BB19326F6DB7152527CBF7763E4A815E01876C653A08DCA4D82720619A699B` |
| functions/vehicle-photo-url/index.ts (canonical entry, not bundle) | `4E15249B6B5FBC3D59A52D6E9DF3BD57E16C74A478D15D8A4BF9BC9CD5462B7C` |
| functions/_shared/garage-requests.ts | `FE52F6158013CC5F9296D5791DB64A2D5AB091DFCE514C0F1D6F2ECEA25A5C73` |
| Expo catalog source vehicleCatalog.json | `CDBDD4A204F3EFD627DE57E8CF9AB4823ADD2C1438756928C655A5F08AFD1085` |

The deployed function bundle SHA-256 is `9246D0BA56F1C2D9AAD67AC08B309EDE24253F05155F010845A7B5E09E2AD7D3`. Its saved editor source matches the reviewed bundle after CRLF normalization; the listed hash describes the local reviewed bytes. Deno validation passed. Reloaded settings showed the legacy-secret gateway off; project Auth validation remains in the handler. A live POST without a token returned 401 AUTH_REQUIRED.

Final local acceptance: all 71 backend and 258 app tests, app typecheck/lint and all-platform export pass. Cases cover exact response-loss receipts, owner/path authorization, photo expiry/committed retries, immutable pending documents, crash-safe acknowledgement and deletion dependencies. The real owner loaded an empty synced garage. A separate localhost guest retained explicitly labelled local-only EV edits after reload; no fake owner garage was uploaded. Two real installed devices, private photo upload and periodic orphan cleanup remain operational acceptance gates; no account was deleted during verification.

## V5 M4 — 1 October 2026

Applied006 once through the authenticated SQL editor after001–005; it returned **Success. No rows returned.** Deployed the reviewed canonical route-service bundle. Existing deployed migrations remain immutable; do not replay them or run an unreconciled CLI push.

| Source | SHA-256 |
| --- | --- |
| migrations/202610010006_private_routes_and_provider.sql | `45889DCA724C81AE804D2DD2011358393E773CC0F65862D86482AE562C5CBA5A` |
| functions/route-service/index.ts (canonical entry, not bundle) | `264F501C105CC6624092CAD2EC55506BD790BBE758BFDC216027848C315F9D42` |
| functions/_shared/route-provider.ts | `1115FB10A90A88FE4DD818F87BAD933222F9988A5430FF8B9789AB2E96D04166` |
| route-service dashboard bundle | `2EA17E8C8ADE47ADC23991954BB5FC2A16FB53451A54DA5D7A051F02842F9A87` |

The transaction preserves owner pins privately before sanitizing old public route and post/challenge snapshot paths, and changes no existing verification eligibility. Before deployment, aggregate counts showed no routes/post/challenge route snapshots. The function editor was reloaded and compared with the exact checked bundle after CRLF normalization. Its legacy-secret gateway is off; the handler independently validates project Auth. A live no-token POST returned401 AUTH_REQUIRED. Its private Geoapify secret is owner-provided and was never read/displayed; source/bundles contain no key value.

Local validation: all98 backend tests pass; all six canonical Edge entrypoints and the final deployed bundle pass Deno checks. Tests cover exact response-loss/CAS/tombstone behavior, owner-private provider cache, service-only grants, geodesic200m projection clipping without bridging recording gaps, historical compatibility sanitization, account-deletion dependencies, microsecond cursors, live200-route capacity, max-int revision deletion, quota reservations measured after lock acquisition, and observed lowercase metric units. Provider reconciliation raises known long-detour estimates before rejecting oversized routes; unknown billed work remains explicit, with no free-quota guarantee.

The real signed-in owner consented to public-landmark search/routing. Thai search results worked; the scooter route Lumphini Park Gate3→CentralWorld rendered4.1km/estimated8minutes, survived reload, and repeated reverse/undo left admitted-call/cache counters unchanged at9/2. The initial upstream200 normalization failure was diagnosed using fixed stage/unit-category enums only and repaired for documented `Meters` and observed `meters`; no coordinates/query/URL/body/key entered logs. See the M4 normalization record. No synthetic cloud route/post/ride or account deletion was performed. Native gestures/frame pacing and second-device save/conflict checks remain separate acceptance gates.

## V5 M5A — 1 October 2026

Applied only additive `migrations/202610010007_social_operations.sql` once after the committed M4 source. Preflight confirmed no social receipt table or block-token column. The editor's full copied selection matched reviewed source after CRLF normalization; execution returned **Success. No rows returned**. Earlier deployed001–006 sources are unchanged. Source SHA-256: `A6586BFD5A50AFD6DF4DCF20789ACB00C9C0538AEAA0306ABCAB3466BC6B5EE2`. Never reapply the creation migrations or run an unreconciled CLI push.

The transaction adds private exact receipts, owner social pages, block tokens and atomic invitations, and extends the existing binary-first account purge without changing the deletion Edge entrypoint. Deploying definitions creates no synthetic user/relationship/invitation/route or course approval and deletes no account. No new function/key/account is required. Six superseded friend/challenge/presence browser write grants are retired to close admission/CAS bypass; deploy the matching M5 client and require old clients to update these actions. Trusted service and account-preference definer calls remain supported; read/heartbeat/verifier grants remain unchanged.

All118 backend tests pass, including20 actual PostgreSQL social cases. An independent review also ran those responses through the real client decoders. Cases cover committed failed-probe limits, exact owner receipt/replay/collision, stale pair/member/account/block-token CAS, bounded microsecond pages, private status, safe/historical snapshots, atomic create/invite rollback and unknown error uncertainty, operator/time fences and Storage→SQL→Auth ordering. Historic helper tests retain their assertions through the existing internal service grants; direct browser denial is separately proven. Six canonical Edge entrypoints still pass Deno checks; no Edge redeployment is needed. The signed-in owner now reads a genuine empty friend/request list without a profile/error gate. Native subscriptions, response-loss and two-account actions remain acceptance gates; no synthetic hosted fixtures, social relationships or actual owner deletion were created for routine QA. Screenshots are retained in ignored build/review-v5/m5a.

## V5 M5B — 1 October 2026

Root applied only additive `migrations/202610010008_foreground_convoys.sql` once in the authenticated Supabase SQL editor after independent source review. The reviewed source SHA-256 is `228141005DC4FE61392C92377B7618D96C573B06B9254C3C3071CD24DF00C5F8` (70,946 bytes). Root observed **Success. No rows returned** and confirmed policy stays false. Operator-reported approximate time is2026-10-01 about02:14UTC; the exact execution timestamp was not retained. Earlier deployed001–007 sources are unchanged. This record does not claim Cron installation, pilot enablement or managed Realtime acceptance. Do not replay deployed migrations or use unreconciled CLI migration history.

The transaction adds private hash-only friend links/proofs, bounded four-person foreground convoys, exact scalar control receipts and cancellation tombstones, latest-only unverified positions, consent/lease/topic rotation and service-only bounded cleanup. Eight existing entry bodies move intact to revoked private helpers behind own-account→global wrappers, preserving public grants and predecessor behavior. Six old browser writes remain retired. Binary-first deletion is extended through the existing Edge entrypoint. No new Edge deployment, credential or paid service is required, and schema deployment creates no cloud participant, link, convoy or GPS fixture.

Fresh local acceptance: **154/154 backend tests pass, 0 skips**, including17 M5B behavioral cases,9 actual PostgreSQL17.11 independent-connection races,7 tests decoding real SQL responses through the maintained client validators and3 operator-SQL tests. Independent review separately reran151 pre-operator cases with no skip. Concurrent proofs cover final room/participant capacity, opposite-owner preferences, block/read/publication, issuer rename, both delayed-grant/cancellation orders and janitor/deletion lock ordering. Operator tests use a Cron facade to verify repeat/owner/retention statements and do not certify a managed scheduler. All six canonical Edge entries pass Deno checks. Dev-only `pg8.22.0` and its dependency graph are added to npm/Deno workspace locks for those local tests; no Edge imports node-postgres. Runtime provenance/readiness and scratch cleanup are documented in README. The runtime is isolated at127.0.0.1:2178 with no system service; fixtures never target Supabase.

Prepared operator files are `ops/m5b-live-readiness.sql`, `ops/m5b-live-cron.sql` and `ops/m5b-live-cron-status.sql`. They were not executed against the hosted project by the backend agent. Setup targets only the current operator/database's exact named job, refuses foreign/duplicate collisions and never enables policy. Readiness returns no location, profile or link/code hash. Current official Free quotas, message accounting, middleware/private-channel acceptance and first-WebSocket partition behavior are linked in README; organization Dashboard usage remains authoritative.

Root executed the read-only readiness query; observed server time is `2026-10-01T02:21:40.293601+00:00`. It reported12 private tables with RLS on and anon/authenticated table access denied;12 public RPCs with empty search paths and anonymous execution denied, authenticated execution allowed except service-only cleanup;8 predecessor helpers with browser/service execution denied. Links/rooms/members/points/precise consents are all0, live policy is false and room cap2. Database aggregate size is13,588,147bytes; this catalog figure is not a billing-quota attestation. Exact result is retained in ignored `build/review-v5/m5b/hosted-readiness.json`.

Cron extension/tables/schedule/alter functions are absent. Dashboard shows **Install integration**; operator installation and the permanent expired-live-row/own seven-day run-history cleanup await the user's browser-rule confirmation. No Cron job installation or successful run is yet claimed. Live policy remains disabled; no cloud QA friendship, convoy, link or GPS mutations were made. Private middleware/socket and paired installed-device gates remain pending.

`ride_private.live_policy.live_enabled` remains false by default. Before enabling rooms, the operator must inspect private-only Realtime settings, configure/update one minute `ride-live-cleanup-v1` job, observe successful executions and bounded seven-day Cron history, inspect actual organization usage and complete installed paired-device tests. Read-only readiness can confirm disabled policy/table/function/grant/Cron configuration without creating participants or sending positions. GPS never appears in invalidation Broadcast; every later position read re-authorizes current membership, friendship/block/privacy/consent and TTL. Cached channel RLS cannot authorize GPS. Native QR/code, consent/revocation/foreground/background, sequence recovery, fifteen-second hide, alignment/FPS/battery and thirty-minute memory remain explicit gates. Source tests do not certify these device or managed-service targets; no real account deletion is routine QA.
## V5 M5C — 1 October 2026, schema and authenticated workers deployed

Root applied additive `migrations/202610010009_route_time_races.sql` once after preflight confirmed its schema/functions absent. The copied editor selection matched the reviewed `D42EC8E7B28246872AFB55C0D6F9073EF90A75895F77E37C81E71819DC49BA14` source, and execution returned **Success. No rows returned**. All001–008 deployed source bytes remain unchanged. Fresh source verification:206/206 backend tests pass, zero skips;16 independent-connection PostgreSQL17.11 race tests (nine008+seven009), five actual SQL→maintained race-decoder fixtures including nonempty pure-verifier finalization, restart history and long-running live probe retention,16 pure route-time verifier cases,15 SQL race cases, six maintained-handler cases and three operator-Cron facade cases. The seven009 races cover both exact activation/cancellation orders, route edit versus opposite-owner arm, final live capacity, block versus finalization, janitor/deletion lock order and last-byte evidence reservation contention. Facade checks are not managed Cron acceptance. Review regressions prove withdrawal immediately terminates active authority and frees the owner attempt slot, active original countdown probes survive the worker grace period, and every original completed-gate motion chord/uncertainty tube is audited even after finish.

All eight canonical Edge entries pass Deno2.9.6 check. No `backend/deno.lock` change was introduced by M5C. The existing Supabase SDK pin/shared current-JWT Auth boundary is reused; node-postgres remains dev-only. Latest isolated bounded algorithm measurement on this Windows machine:8,000 samples,512 course vertices,128 boundary vertices,16 gates;434.04ms wall,469ms CPU,+4.18MiB heap. The2,446,018-byte fixture deliberately exceeds the real2MiB input cap to exercise the hard sample ceiling. It passed the≤1,000ms local CPU/64MiB incremental target, but does not prove hosted cold-start/CPU or native paired timing.

Reviewed deployment inventory and SHA256:

| Source | SHA256 |
| --- | --- |
| `migrations/202610010009_route_time_races.sql` | `D42EC8E7B28246872AFB55C0D6F9073EF90A75895F77E37C81E71819DC49BA14` |
| `functions/_shared/verify-route-time.mjs` | `36AE69B7BA8115E79A36B82A6740505AF765B9E7355CFA05BACC40DA75FEE016` |
| `functions/_shared/race-verification-handler.mjs` | `6DDA01CF3D4264F8553C4A8169864EC63205866C69BE64791F0AA727D7AE1507` |
| `functions/verify-race-attempt/index.ts` | `81EE38441282141EF0414559D30ED512B277EA468F2743C08624FE16C2E83EB7` |
| `functions/_shared/race-cleanup-handler.mjs` | `D246D46F64715F4A9EFD26D2E26DDCEEC374643D0F24FA394ED75677B5CDFE34` |
| `functions/race-evidence-cleanup/index.ts` | `921A65D01D1CDE487603D7EA18BD6AEF3BB33BFF8E6D8FBB1DD9BCBACF1C642A` |
| `ops/m5c-race-readiness.sql` | `E681658C1E9B8239FE3D93080E4A9A4EE7DF46266C0CFF3487F2F124132C78FB` |
| `ops/m5c-race-cron.sql` | `2F612F7513E613E0D97898902B728CB6CBF16032201FEF30A4E16147801F8839` |

Do not replay009 or use an unreconciled history push. Root deployed the two reviewed standalone worker bundles: `verify-race-attempt` SHA256 `9C7ADFE381BCE9B714CDA67DD7ED8A077B5B2F5430FA52B2DD32046F654A57FD`; `race-evidence-cleanup` SHA256 `2199BC6A0B4E8D2F1150B075BAD0DD9968B49AACB82D905D0155E59E20ACFF02`. After explicit user approval, both legacy gateway JWT switches were saved off and reloaded; each canonical handler performs its own required authorization. Anonymous POST `{}` returned401 `AUTH_REQUIRED` and401 `SERVICE_AUTH_REQUIRED`, respectively. Ignored proofs are `build/review-v5/m5c/*auth-saved.png` and `worker-anonymous-denial.json`. Existing delete-account requires no new deployment and still removes all returned bucket/path lists binary-first. Policy remains disabled; deployment created no real race, invite, approval, evidence upload or account deletion. Cron installation, protected binary-cleanup scheduling and successful scheduled execution remain pending, and no permanent deletion job was invoked for QA.

Dashboard-only deployments can reproduce standalone JavaScript with `npm ci` in the pinned `motion` workspace, followed by `node scripts/bundle-edge-dashboard.cjs verify-race-attempt race-evidence-cleanup` at the repository root. Generated files and their exact canonical dependency/hash manifest stay in ignored `build/deploy-m1`. The esbuild module bundle preserves lexical scopes; it does not replace canonical Deno typechecks. `node --test scripts/test_edge_bundles.cjs` passes three actual generated-runtime/provenance/authentication checks without project credentials. Compare the saved dashboard source against the reviewed generated bytes before considering either function deployed.

Policy startsfalse, maximumtwo live races/four competitors; qualifying async/live entry is disabled until readiness is complete. New256MiB reserved+actual private evidence cap is global-lock serialized, includes unknown/orphan sizes conservatively, frees only after genuine binary cleanup, and leaves local bytes available on `RACE_CAPACITY`. It provides dedicated headroom rather than organization-wide billing guarantees. Raw binary expiry is due≤seven days from immutable reservation; compact exact receipts and nongeographic results persist until account deletion. Unknown processor failures preserve retry semantics; exhausted leases become processing DNF, never a quality verdict.

Operator steps remain pending: read aggregate readiness; inspect private-only Realtime and canonical Edge Auth denial; configure/observe own minute state cleanup via reviewed `m5c-race-cron.sql`; configure a separate protected service/Vault minute invocation of binary `race-evidence-cleanup`; inspect organization quota/egress/Storage usage and hosted CPU margin; then explicitly review enablement after consenting installed iOS/Android closed-course/pair acceptance. Neither this file nor local tests install Cron, configure Vault, enable policy, approve a personal course or send push messages. Trusted legacy course/session writes must obtain global before lower rows; the offline compiler output alone is not operator authorization. No new secret belongs in the repository or chat.

## V5 M6 — 1 October 2026, additive010 deployed

Root applied `migrations/202610010010_ranked_publication.sql` once through the public SQL editor after preflight confirmed010 objects absent,009 present and original legacy claim present. The reviewed selection matched exact LF source SHA256 `E393851B15B578524FCD4A3913B1C46735BE2907557C902FE43EAAB9E18900F4`; execution returned **Success. No rows returned**. Deployed001–009 bytes remain unchanged. Never replay010 or use unreconciled migration history. No new Edge, key, account, course approval, fake result or routine account deletion was created.

Root's aggregate-only `ops/m6-readiness.sql` (SHA256 `BBC396DCAB01CE2D54A9BBEC509296E5ABA2B5A7EB2BE670BFDE0AEF13878F9D`) observed `2026-10-01T05:55:33.224413+00:00`: six private tables have RLS and no anon/app direct read/write;15 public RPCs have empty search path/security definer/anonymous denial and expected service grants, with the seven typed app RPCs allowed; five predecessor helpers deny app/service execution; old browser leaderboard is denied. Publication/operation/report/public-course counts are0, race policy remainsfalse. Proofs are ignored `build/review-v5/m6/schema010-success.png` and `hosted-readiness.json/png`. No genuine claims/results, hosted fixtures or data deletion were used for readiness.

Fresh complete local backend acceptance is230/230 tests, zero skips. M6 adds20 actual database behavior cases and four real PostgreSQL17.11 connection races. The genuine old worker/deletion cycle reproduced40P01 before the new entry fences, then passed after account→global→submission ordering. Tests preserve exact private predecessor prosrc, old public signatures/defaults/service grants, genuine preexisting lease seeding, token owner-reassignment denial, publication exact CAS/replay, source purge, expired-qualification discovery/revocation, Bangkok boundaries, immutable classes, connected full-board interval ties and owner/private cursor isolation. Actual nonempty SQL responses pass maintained Ranked page/publication/own-record decoders. All eight canonical Edges pass Deno2.9.6 checks; no deno.lock change or worker redeployment is introduced by M6. Local race/cursor tests are not hosted scalability or device performance acceptance.

010 adds six private RLS/default-deny tables for publication, exact receipts, reports, separately operator-reviewed course discovery, moderation and immutable legacy worker leases. Explicit owner publication is private by default and independent of ride/evidence/friend/location consent. Older browser `rs_leaderboard` access is retired; update clients to the new Ranked APIs. Legacy speed quality remains submitted-evidence consistency with unknown sensor/class provenance; route-time quality remains distinct. Service-only report queue/moderation never automatically rewrites verification. Existing binary-first account deletion gains dependent metadata/lease cleanup without an Edge change. Restoring course eligibility does not recreate consent after explicit unsharing.

Reads share60/minute,5,000/day actor and50,000/day project; controls share60/minute,100/day actor and5,000/day project. Full-board canonical candidate count is bounded10,000 and fails unavailable if exceeded. No global table subscription or deployed Realtime board hint is claimed; current UI has finite bounded refresh. Before larger rollout, measure real board query cost/actual organization usage and implement the separately reviewed generic private invalidation slice if needed. Private-channel/scheduler/native acceptance and M5C policy remain separate gates;010 never enables races or publishes existing records.

## V5 M7 — 1 October 2026, additive011/012 and three workers deployed

Root applied `migrations/202610010011_community_media.sql` once after an absent-object preflight and exact normalized-LF clipboard comparison to SHA256 `ADCFA97FB0B81F7727B7068310062873D19A1C77AFEA38768AA2E539861EEBAC`. The SQL editor returned **Success. No rows returned**. Deployed001–010 bytes are unchanged; never replay011. Aggregate readiness at `2026-10-01T07:35:00.712777+00:00` confirmed eight private RLS tables,25 selected fixed-search-path definer functions with anonymous denial and expected app/service grants, a private1MiB JPEG bucket, retired predecessor browser/storage grants, zero posts/media/operations/reports and race policyfalse. Ignored proof is `build/review-v5/m7/schema011-success.png` and `hosted-readiness.json/png`. No hosted content/photo fixture or account deletion was created for QA.

After011 was frozen and deployed, an additional actual pre011 upgrade regression found that a previously deleted draft could retain revision0 in the new projection. Root applied the independently reviewed additive012 repair once at SHA256 `D68F84930EDF17F6BAE544F7E6529BACD4F34D28E88B3DBDC7E9EFC71D532F09`, preserving001–011 bytes. The editor returned success; aggregate proof at `2026-10-01T07:58:07.873101+00:00` shows three live-draft guards, zero repairable rows, fixed search path and no anon/app/service execution of the private trigger helper. The hosted preflight had zero affected rows. Latest complete backend acceptance is277/277, zero skips; independent actual upgrade/decoder regressions also pass. Proofs are `build/review-v5/m7/schema012-success.png` and `terminal-drafts-{before,after}.json`.

Fresh complete acceptance is **274/274 backend tests, zero skips**: M7 adds23 database behavior/readiness cases, four actual PostgreSQL17.11 independent-connection races, eight actual-entropy JPEG cases, six maintained-handler cases and three independently authored decoder regressions. Existing historical behavior stays asserted through its established same-actor trusted internal helper; direct retired browser writes are separately denied. Upgrade tests preserve exact predecessor bodies, public argument names/defaults/returns/grants and real preexisting legacy content. Cases prove failed business admission/free exact replay/unknown SQL uncertainty; owner/revision/descriptor/tombstone identity; genuine M2 and saved-route projection precedence; six ordered photos versus24 replacement candidates; current block/child/audience ACL; hidden owner metadata and privacy revocation; exact microsecond feed/comment/owner pages; quota contention, quarantine versus commit, binary-first purge and current-parent signer recheck. Legacy audience/delete CAS and post-owner reading another author's comment were reproduced and repaired against maintained strict client decoders. Feed fingerprints materialize only compact candidate metadata, then≤31 full DTOs.

All **eleven canonical Edge entrypoints** and the JPEG benchmark script pass Deno2.9.6 checks. Isolated legal1600×1600 baseline entropy fixture:823,991bytes,214.83ms wall,RSS160.16MiB. Independently encoded progressive fixture:439,112bytes,176.59ms wall,RSS134.14MiB. These Windows local measurements passed the≤1000ms wall/256MiB RSS check; they are not hosted CPU, native Expo codec, phone FPS or billing acceptance. Synthetic grayscale/progressive codec files contain no user image or metadata. The exact pinned vendor delta allows only reviewed ESM export and strict entropy/alignment validation, including a single inert all-one byte-aligned codec padding byte. Both BSD and Apache license notices must accompany standalone bundles. No hidden-steganography guarantee is made.

Frozen canonical inventory:

| Source | SHA256 |
| --- | --- |
| `migrations/202610010011_community_media.sql` | `ADCFA97FB0B81F7727B7068310062873D19A1C77AFEA38768AA2E539861EEBAC` |
| `functions/_shared/community-jpeg.mjs` | `ECAC164E9EB18FC66D9E52997A1F512C644CE429CC64C3E2284E321BFA0A3638` |
| `functions/_shared/community-media-handler.mjs` | `75BAE507EF26F5231F356CC5E375B4AA82DFF7B3177EFAD96017497F4A5C63FE` |
| `functions/_shared/community-cleanup-handler.mjs` | `DACFF227DFFEA395707A8FE83ABC6FCB3ABBE67970AB00801925CEE63333EE63` |
| `functions/_shared/vendor/jpeg-js-0.4.4-strict.mjs` | `EF52562BD855357534059B441A93C935270D72C568DF5AB4CAE1E63EA581C0A0` |
| `functions/community-media-commit/index.ts` | `2FF209EC6D5DD8A4199F346F40F697EA9347FF9F166D4E40ABBCF77DC576E259` |
| `functions/community-media-url/index.ts` | `16A4D83E4A2E0612DB3A4C280B93C058382F37A6219B76AE3405C5ECB27146EA` |
| `functions/community-media-cleanup/index.ts` | `30ED9F7403513F2D4757834FF5699F7AE0B0F412858620F5BBAE8CAED6E28BEC` |
| `ops/m7-community-readiness.sql` | `F033AFBCB502EA9BDC1C5C05169EB53305F61B559E225B7F740B5196BB20604D` |

011 adds eight private RLS/default-deny tables and one private JPEG bucket. Eleven typed owner/viewer APIs are authenticated; eight media/cleanup/moderation APIs are service-only. Six existing allocation/deletion entrypoints wrap exact private predecessors under account→global fencing. Five superseded Community/feed browser grants and the old unrestricted media-upload policy are retired; update older clients for these actions. Genuine legacy content remains readable with honest unknown codec/proof metadata. Private owner settings expose only IDs/revision/audience/state/time for hidden sharing revocation, without weakening normal content/image ACL. `COMMUNITY.md` records exact DTOs, capacities, quotas, retained metadata and signer TTL.

New post media has256MiB dedicated reserved+actual headroom, and all six application buckets share768MiB. Uncommitted photos reserve1MiB and evidence2MiB; actual committed size counts once per path. Unknown sizes fail closed, and retained binaries are not freed by a database-only update. This is application admission protection rather than organization-wide billing authority. Backend npm/Deno locks add pinned dev fixture/reference `jpeg-js0.4.4` and `blurhash2.0.5`; the Edge imports the reviewed local strict decoder and only the pinned BlurHash dependency. No existing dependency pin, app key or source verifier method changes.

Root deployed the three reviewed standalone bundles after exact editor clipboard comparison: `community-media-commit` SHA256 `91c97baf46916a5abd6bbaf43f5a0f2cda1fe8a2ee45962c5a5e7ea2dc0fac3a`; `community-media-url` `dfc9c816b7265cb0a8ab6f317cceda02f29e53aa024d52ff0a26bc577c9addab`; `community-media-cleanup` `f9d8905ad1366d63e00887fe719c2b51981df400e608cbe552fb609c51ac9230`. Both full vendor license notices are embedded. After the user's explicit approval, all three legacy JWT gateway settings were saved off. Actual anonymous POST `{}` at `2026-10-01T07:56:23.461Z` returned401 from the canonical handlers: `COMMUNITY_AUTH_REQUIRED` for commit/URL and `SERVICE_AUTH_REQUIRED` for cleanup. Proofs are `build/review-v5/m7/*auth-saved.png` and `worker-anonymous-denial.json`. Existing platform credentials are reused; no credential value was read/displayed and no new delete-account deployment is required. `node --test scripts/test_community_edge_bundles.cjs` passes three generated-runtime/provenance/license/auth checks; run separately from the race bundle suite because both regenerate the ignored output manifest.

The real browser Google sign-in reaches the app, but the subsequent existing account/profile RPCs returned PostgREST `PGRST002` (HTTP503, schema-cache connection failure). A documented `NOTIFY pgrst, 'reload schema';` completed successfully after012; the profile retry still failed. This is unresolved hosted API acceptance, not proof of a token defect or successful new-profile/community read. No auth workaround or fake hosted posts were used. PostgREST references: https://docs.postgrest.org/en/stable/references/errors.html#group-0-connection and https://docs.postgrest.org/en/stable/references/schema_cache.html .

Operational gates remain: execute aggregate-only `ops/m7-community-readiness.sql`; inspect private bucket caps/no permissive bypass; verify authentic installed native/browser re-encoded bytes and hosted entropy CPU/memory; observe current Storage/database/egress/function usage; authorize and operate a protected bounded `community-media-cleanup` schedule and confirm Storage→ACK behavior. Each invocation claims≤20 binaries, with24h reserved expiry, seven-day unpublished committed cleanup and protected published manifests. Exact retired reservation identities remain compact tombstones until account deletion. Cron/Vault installation and permanent cleanup still require the user's separate operator confirmation; this source does not install, invoke or enable them. Race/live policy stays disabled and no synthetic production fixtures are required for readiness.
