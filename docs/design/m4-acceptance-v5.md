# M4 route builder and private geometry — V5

Source and hosted-provider acceptance, 1 October 2026. Source tests, hosted deployment, browser interactions and installed-device measurements are separate results.

The fullscreen route editor supports ordered start/via/finish pins, selected-pin dragging, undo, reversal, return to start and searchable Thailand places. Road requests use the selected scooter/motorcycle/car profile. Recorded import retains disconnected pause/GPS-gap fragments and has no invented road ETA. The library retains unfinished edits, offers explicit draft recovery/reset, and shows durable sync or revision conflicts. Public/friend detail receives the authorized server projection; it cannot reconstruct private pins or original metrics.

## Source verification

All329 app tests and98 backend tests pass. App typecheck/lint and web/iOS/Android exports pass. Cases cover pending search/calculation generations, initiating JWT, consent, late drag origin/selection, immutable save/receipt replay, response loss, disk acknowledgement failure, owner A→B→A changes, deleted-route tombstones, microsecond pagination, bounded geometry, imported recording gaps and draft restart recovery. Actual adapter tests show Back, movement and unmount cannot be overridden by a late shared-preview response.

Four web fit tests execute the actual pinned MapLibre Camera/MercatorTransform. Three native tests execute the real app adapter boundary using independently checked additive-inset semantics of Android11.4 and iOS6.31; they do not run those native engines. Web bounds store viewport padding once and use zero additional fit padding; native renderer insets are zero while camera commands own padding once. Bounds Overview reserves attribution/marker clearance above the sheet, including measured taller credits. Normal recenter/singleton behavior is preserved. The regressions failed before the fixes. The final phone screenshot shows both endpoints without credit overlap.

The additive route migration passes actual PostgreSQL/RLS tests. Full pins and provider output are owner-private. Nonowner geometry removes at least 200 m of traversed path from both ends without connecting recording gaps; routes of 400 m or less are hidden. Geometry changes reset course approvals. Historical public snapshots are sanitized, without granting new verification eligibility. The migration defines account cleanup; deployment did not perform account deletion.

## Hosted and browser evidence

Migration 006 was applied once in the authenticated Supabase SQL editor and returned Success. No rows returned. Its immutable SHA-256 is recorded in backend/DEPLOYMENT.md. Before deployment, aggregate counts showed no existing routes or post/challenge route snapshots. The canonical route-service function was deployed with independent project Auth validation; a live no-token request returned 401 AUTH_REQUIRED. The privately provided Geoapify key was never read, printed or placed in client source.

The signed-in owner consented to public landmark queries/pins, searched Lumphini Park and CentralWorld and selected the real returned places. Search returned Thai place results. The initial road response failed validation despite an upstream HTTP 200. Fixed diagnostics established that Geoapify returned lowercase `meters`, whereas its documentation shows `Meters`. The tested parser now accepts exactly those two metric forms and still rejects missing/unknown/imperial units; both normalization and credit reconciliation use the same rule. No request text, coordinates, upstream URL, body or secret was logged.

After deployment, the actual scooter route displayed road geometry, 4.1 km and an estimated 8 minutes with Save enabled. A full browser reload preserved both public landmark pins, the geometry and its calculation time. Reversal invalidated the old proof; undo restored the original pins and recalculated from the private server cache. The first reversed route created one additional admitted provider call and a second cached route; a repeated reverse/undo kept counters unchanged at9 admitted calls/2 cached road results. Phone Overview now fits both endpoints between the controls and sheet. No synthetic saved cloud route, post, ride, friend invitation or account deletion was performed; provider cache entries are private consented request results.

The isolated localhost guest declined provider consent and retained local editing without egress. Phone-size browser checks use a 428×926 viewport; they are not native iPhone tests. Screenshots are retained in ignored build/review-v5/m4.

## Remaining acceptance

Saved-route cloud writes, authorized shared preview and two-installation conflict acceptance require a genuine route or a separately agreed disposable test account; synthetic production routes are excluded from routine verification.

Installed iPhone 14 Plus/iOS 26 and mid-range Android still require native long-press/drag, camera fitting, keyboard/safe areas, Dynamic Type/Thai shaping, screen-reader labels, Reduce Motion/Transparency, 50-marker pan/zoom and measured frame pacing. Road access must be checked in the field. Provider estimates exclude live traffic and do not establish legal access or race eligibility. Physical GPS, startup, memory and battery results are not inferred from source tests or browser views.
