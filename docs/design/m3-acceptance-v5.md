# M3 garage and catalog — V5

Verified 1 October 2026. Source, hosted schema and browser checks are distinct from installed-device acceptance.

The Garage offers category filters, searchable brands/models, verified configurations and custom entry. A scooter remains a scooter regardless of displacement. Petrol/hybrid/diesel display cc; EVs display motor kW. Optional nickname, color and private photo personalize the selected card. The fast catalog path is plus → category → model → save; optional personalization adds interaction. Empty garages show the animated add control without manufactured vehicles.

The editable JSON contains 90 configurations, 87 with reviewed specifications and three explicitly unverified legacy EV suggestions, across 72 verified families: 21 scooters, 25 motorcycles and 26 cars. Official provenance and exact decimals are retained. The user's unspecified Civic RS is not assumed to be e:HEV or Turbo. Existing vehicle IDs and captured ride snapshots are preserved.

Owner garage changes use durable immutable operations and explicit revision conflict resolution. A later edit cannot be marked clean by an earlier response. Account switching closes old work. Edits to a removed vehicle are rejected rather than recreating it. Private photo drafts retain exact bytes, survive lost upload/commit responses, and rotate only after a definite expired reservation. A committed reservation remains reusable after its initial TTL. Photo attachment updates only its current target and draft cleanup requires the current acknowledged garage.

## Evidence

- All 258 app tests, 71 backend tests, app typecheck/lint and web/iOS/Android exports passed before M3 commit. Focused cases cover scope isolation, immutable retry, stale queued edits, EV precision, Unicode bounds, conflicts, disk failure, photo expiry and current acknowledgement cleanup.
- Migration 005 and the separate catalog-only seed were each applied once in the hosted SQL editor, returning Success. No rows returned. Exact immutable hashes are in backend/DEPLOYMENT.md. No user vehicles, ride data or ranked fixtures were seeded.
- The canonical vehicle-photo-url bundle passed Deno validation, was deployed, and matched the saved editor source after CRLF normalization. Its no-token POST returned 401 AUTH_REQUIRED. The function validates project Auth; the incompatible legacy-secret gateway is off.
- The real signed-in account loaded and refreshed its empty synced garage. The isolated localhost guest added an explicitly labelled Device-only QA EV, retained 150 kW, edited its nickname/color, changed its active selection and retained both vehicles after reload. Thai/English states were checked. The real account remains empty. These are browser checks, not a cloud write or native photo test.
- Local screenshots in build/review-v5/m3: schema-deployed.png, garage-guest-thai.png, garage-owner-synced-thai.png, photo-function-deployed.png. The guest screenshot is a desktop browser capture; it is not evidence of the requested phone viewport.

## Remaining gates

No private photo or test vehicle was published under the owner's account, and no account was deleted. Installed iPhone/Android photo acquisition, signed upload/read, two-device conflict behavior, native Thai font scaling and card FPS remain unmeasured. Scheduled orphan cleanup is an operational task. M2 iOS release/development cloud compilation succeeded; Android Gradle succeeded but its packaging validator required the separately tested Build Tools metadata fix. Fresh binaries and installation are separate results.
