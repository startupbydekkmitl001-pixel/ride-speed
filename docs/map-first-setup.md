# Map-first build setup

This branch expands the native preview in the M0–M8 order recorded in `PLAN.md`. The last published IPA remains preview build 9; source changes are not a newly published native binary until the build/release evidence is recorded.

## Local app

Use Node supported by Expo SDK 57 (22.13+), and run from `ExpoRideSpeed`:

```powershell
npm ci
npm run start:dev -- --web --port 8082
```

Expo Router route files stay under `src/app`; shared feature code lives under `src/features`. All native dependency additions use `npx expo install`. Regenerate native projects through config plugins/CNG; do not edit generated projects. Native MapLibre needs a new development/Release build and is not included in Expo Go.

## Configuration

For a separate backend, copy root `.env.example` to `ExpoRideSpeed/.env` and fill the **publishable** Supabase URL/key. The existing owner's public project configuration remains a fallback. These values identify a project; RLS and caller authorization protect its data. Never use a service/secret key in the app or commit `.env`.

MapLibre renders the keyless OpenFreeMap basemap. The owner created a free Geoapify project and saved `GEOAPIFY_API_KEY` in the existing project's **Edge Functions → Secrets** on 1 October 2026; only name/digest presence was verified. The key is never read into source or the client bundle. The routing/search Edge API is implemented in M4 and must be deployed before those operations are available. Provider credits are shared across all riders, not per rider. Keep the required attribution visible.

Google login is already configured. Public email signup/reset delivery requires custom SMTP; do not claim the default sender works for arbitrary friends. Apple login and store distribution need provider/capability setup. Push delivery needs native provider/entitlement configuration. None of these require paid Google Maps billing in the chosen architecture.

## Checks and performance evidence

```powershell
npm test
npm run typecheck
npm run lint
npm run check:build
npx expo install --check
```

Backend migrations/tests remain in `/backend`, with a documented `/supabase` entry point added in M1. Apply additive migrations in timestamp order to a clean test database; never blindly reapply the dashboard-deployed foundation to production.

Motion renders and seam/size proofs live in `/motion`. At most two ambient video surfaces may hold playback leases. A poster remains visible for reduced motion, power saving, hidden screens and budget exhaustion. Text and photos are native, separate from the material.

Browser/source/CI checks establish UI behavior and build health. They do not establish a native cold start under 2.5 seconds, map interactivity under 2 seconds, 60 fps with 50 markers, 30-minute memory/battery stability or two-device race skew. Run those release-build tests on the iPhone 14 Plus/iOS 26 and a mid-range Android. The iPhone target uses 60 Hz; test 120 Hz only on supported hardware. Record actual traces in `docs/TEST_PLAN.md` rather than inferring performance from code.
