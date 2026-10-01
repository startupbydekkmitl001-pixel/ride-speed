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
## V5 M5C — local source freeze, deployment pending

Additive `migrations/202610010009_route_time_races.sql` is **not deployed**. All001–008 deployed source bytes remain unchanged. Fresh source verification:206/206 backend tests pass, zero skips;16 independent-connection PostgreSQL17.11 race tests (nine008+seven009), five actual SQL→maintained race-decoder fixtures including nonempty pure-verifier finalization, restart history and long-running live probe retention,16 pure route-time verifier cases,15 SQL race cases, six maintained-handler cases and three operator-Cron facade cases. The seven009 races cover both exact activation/cancellation orders, route edit versus opposite-owner arm, final live capacity, block versus finalization, janitor/deletion lock order and last-byte evidence reservation contention. Facade checks are not managed Cron acceptance. Review regressions prove withdrawal immediately terminates active authority and frees the owner attempt slot, active original countdown probes survive the worker grace period, and every original completed-gate motion chord/uncertainty tube is audited even after finish.

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

Apply009 once only after independent review; no creation migration replay/unreconciled history push. Deploy the two new canonical Edges (or exact reviewed bundles); verification accepts current owner JWT and exact `{attempt_id}`, cleanup accepts only existing configured service authorization. Matching config disables legacy gateway verification in favor of explicit handler authentication. Existing delete-account function requires no new deployment: it already removes all returned bucket/path lists binary-first. Source deployment creates no real race, invite, course approval, evidence upload or account deletion.

Dashboard-only deployments can reproduce standalone JavaScript with `npm ci` in the pinned `motion` workspace, followed by `node scripts/bundle-edge-dashboard.cjs verify-race-attempt race-evidence-cleanup` at the repository root. Generated files and their exact canonical dependency/hash manifest stay in ignored `build/deploy-m1`. The esbuild module bundle preserves lexical scopes; it does not replace canonical Deno typechecks. `node --test scripts/test_edge_bundles.cjs` passes three actual generated-runtime/provenance/authentication checks without project credentials. Compare the saved dashboard source against the reviewed generated bytes before considering either function deployed.

Policy startsfalse, maximumtwo live races/four competitors; qualifying async/live entry is disabled until readiness is complete. New256MiB reserved+actual private evidence cap is global-lock serialized, includes unknown/orphan sizes conservatively, frees only after genuine binary cleanup, and leaves local bytes available on `RACE_CAPACITY`. It provides dedicated headroom rather than organization-wide billing guarantees. Raw binary expiry is due≤seven days from immutable reservation; compact exact receipts and nongeographic results persist until account deletion. Unknown processor failures preserve retry semantics; exhausted leases become processing DNF, never a quality verdict.

Operator steps remain pending: read aggregate readiness; inspect private-only Realtime and canonical Edge Auth denial; configure/observe own minute state cleanup via reviewed `m5c-race-cron.sql`; configure a separate protected service/Vault minute invocation of binary `race-evidence-cleanup`; inspect organization quota/egress/Storage usage and hosted CPU margin; then explicitly review enablement after consenting installed iOS/Android closed-course/pair acceptance. Neither this file nor local tests install Cron, configure Vault, enable policy, approve a personal course or send push messages. Trusted legacy course/session writes must obtain global before lower rows; the offline compiler output alone is not operator authorization. No new secret belongs in the repository or chat.
