# Supabase entry point

Canonical schema/functions/config live in [backend](../backend/README.md); the native RPC and HTTP contracts live in [backend/API.md](../backend/API.md). This directory is a documentation entry point, not a second set of deployable sources.

Run `node backend/scripts/stage-supabase.mjs` from the repository root to populate ignored `backend/.supabase-work/supabase/` for CLI use. Edit canonical sources and restage; do not edit generated copies. Dashboard single-file M1 bundles are generated with `node scripts/bundle-edge-dashboard.cjs` into ignored `build/deploy-m1/`.

The foundation is already dashboard-deployed and must never be reapplied. CLI migration history must be reconciled with the exact deployed hashes in [DEPLOYMENT.md](../backend/DEPLOYMENT.md) before a push. Additive migrations preserve real accounts and data. No secrets belong in this directory, repository, app public environment variables or test fixtures.

M1 additive migrations: `backend/migrations/202610010002_profile_account_lifecycle.sql` and `202610010003_deletion_receipt_lookup.sql`. They distinguish established profiles (completed onboarding) from new accounts, add owner preferences/private avatars, and implement service-only deletion with Storage binaries removed before cross-owner challenge dependencies and Auth. The separate receipt lookup lets a cryptographically verified original token read only its exact completed result after a lost response. It never authorizes a deletion mutation. Hosted acceptance and operational cleanup gates are documented separately; local tests do not claim a live integration.
