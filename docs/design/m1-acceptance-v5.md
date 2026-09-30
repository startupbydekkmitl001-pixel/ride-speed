# M1 account and profile acceptance — 1 October 2026

Source milestone: account-scoped local recovery, persistent Auth, four-step optional onboarding, private profile photographs, Thai/English profile/privacy/legal/account deletion, and additive owner RPC/RLS/Storage lifecycle. Returning accounts bypass onboarding and open Home. The fullscreen map replaces the old Home in M2.

## Verified

- App: 125 tests pass; typecheck, lint and build configuration checks pass. Backend: 45 tests pass, including real PGlite owner/RLS checks and Supabase SDK signature verification. All four canonical Edge Functions and the two generated deployment bundles pass Deno checks. Web export passes.
- Real Google login loads Arnalxz / @arnalxz. Full browser reload retains the session and cloud profile. Thai preference survives reload; ghost mode defaults to enabled. Empty profile names produce a localized validation error.
- A fresh guest tab completes language → location skipped → profile skipped → vehicle skipped → Home without acquiring or sharing a location. This is a functional browser flow, not the measured new-account 60-second native acceptance.
- The deletion screen leaves permanent deletion disabled with an empty confirmation. No real account was deleted. Regression tests cover unconfirmed authentication/network failure, confirmed receipt recovery, retry and owner cleanup isolation.
- Avatar reservation/commit and the private signer, owner switching, interrupted drafts, and deletion lease/receipt handling pass automated tests. No owner photograph was uploaded during QA.
- Migrations 202610010002 and 202610010003 were applied once in the live project's SQL editor with success. The deployed avatar/deletion functions use application Auth validation, with the incompatible legacy-secret gateway disabled. Both return 401 AUTH_REQUIRED without a token; allowed localhost/127.0.0.1:8082 preflights pass.

## Limits and remaining gates

Public email signup/reset needs custom SMTP; Apple is hidden until provider/entitlement setup. Google is the available real provider. Native secure-session restart, fresh-user timing, physical photo selection/upload, actual disposable-account deletion, Dynamic Type and hardware performance remain device/operator acceptance gates. Tests do not establish those results.

Deletion receipt lookup requires the original valid, unexpired project-signed token; expired receipts need an operational recovery procedure before store release. Foreground recording and its memory-only evidence remain the published build 9 behavior until M2 is delivered.

Database migration history was absent because the foundation was deployed through the dashboard. Reconcile exact source hashes before CLI migration pushes; never reapply foundation or reset production data. See backend/DEPLOYMENT.md.

## Local proof

Ignored local screenshots are under build/review-v5/m1: profile-arnalxz-thai.png, deletion-form-disabled.png, schema-deployed.png and delete-account-deployed.png. The Thai profile proof excludes the account email. No private photograph, credentials or precise location appears in committed evidence.
