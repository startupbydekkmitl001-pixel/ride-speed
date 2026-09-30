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
