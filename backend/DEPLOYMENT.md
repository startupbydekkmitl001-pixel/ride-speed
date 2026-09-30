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
