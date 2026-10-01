# M5C route-time races — source and schema acceptance

Verified on 2026-10-01. This slice adds separate approved-course route-time trials/live-race source; it does not enable competitive participation or certify sensor authenticity.

## What is implemented

- A bilingual race hub, route/friend selection, independent safety/evidence review, accepted-member private course map, lobby, ready/countdown, original-capture attempt, recovery, results and fresh rematch flow. The map uses the actual approved route, directed gates and staging outline only while exact current membership/course permissions remain fresh.
- Passive competitive capture taps the existing native recorder. Original sample flags and wall/monotonic receipts stay private; display interpolation and route snapping cannot become evidence. Background/source loss persists exact stop intent. Restart never constructs missing clock/GPS samples.
- Immutable owner upload files, bounded durable operations, exact receipt-first response-loss recovery and canonical terminal cleanup. Failed writes remain retryable; account generation changes cannot send or settle another owner's intent.
- Migration009 and two reviewed canonical worker sources provide atomic activation/cancellation, bounded leases/clock proofs, private evidence reservations and directed-course verification. Initial policy remains false, with two live rooms maximum and four participants each.

## Evidence and limitations

Independent source review reran all206 backend tests with zero skips, including genuine isolated PostgreSQL concurrency cases and SQL responses decoded by maintained client validators. Eight canonical Edge entrypoints passed Deno checks. Generated standalone worker bundles passed three actual runtime/provenance/authentication tests. The final course map/race/provider/reader slice passed59 focused source tests and zero-warning lint. The full app suite passed700 tests/typecheck/lint before the final course map addition; later frozen integration results belong to the build record rather than an invented native measurement.

The schema was applied once through the authenticated SQL editor after preflight proved it absent and full editor selection matched reviewed source. Aggregate readiness at2026-10-01T05:14:55.344351+00:00 reports13 private RLS tables with no anon/authenticated direct table access,23 narrow public RPCs with anonymous execution denied, six revoked predecessor helpers, a private2MiB JSON evidence bucket, zero race/approval/attempt/result/staging/cleanup rows, and policyfalse. Source/bundle hashes and deployment status are in backend/DEPLOYMENT.md. Ignored browser evidence is retained under build/review-v5/m5c.

The latest isolated verifier benchmark measured469ms CPU/+4.18MiB incremental heap at the hard8,000-sample/512-route/128-boundary/16-gate ceiling. It is a local algorithm result, not hosted cold-start margin. Managed Cron/Vault binary retention, private socket behavior, hosted CPU/organization usage, an independently operator-approved course and consenting installed-device timing/GPS/performance checks remain gates. No synthetic hosted race/course approval/GPS/evidence, push notification or real account deletion was used as routine QA.

## How to review

Open Map → Challenge. A guest sees the honest login gate. A signed-in account can read its actual race list. With no authorized race the list is genuinely empty; the app never invents competitors, ranks or route results. Closed-course participation remains disabled until operational/device acceptance. Native build compilation is tracked separately from physical installation.
