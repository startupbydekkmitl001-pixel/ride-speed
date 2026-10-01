# M8 map lifecycle slice — verified source behavior

2026-10-01. This is an early M8 performance fix, not completion of the motion/performance milestone.

`ActiveMapSurface` disposes the native/GL map on tab blur, OS suspension or fullscreen speedometer expansion. It retains only the settled camera and screen data. A new OS lifecycle generation forces a new renderer even when background/resume events arrive before React renders. Late status/camera callbacks cannot overwrite the restored viewport. Native camera padding and web attribution clearance keep their existing single-owner contracts.

Route search and road calculation cancel their debounce/AbortSignal work on blur/background. Dispatch and completion independently check activity generation, account identity, consent, online state and input identity. Outer shared-route previews cannot reopen after navigation or OS suspension. Saved local drafts, ongoing explicit ride recording and durable owner-scoped acknowledgements stay in their providers.

Idle map location accepts a screen AbortSignal and permanently revokes that request on OS suspension. A held permission response cannot start GPS after disposal/resume. Cancellation stops only the idle request's exclusive capture owner; it cannot stop an active recorded ride.

Route detail/shared snapshots fit new geometry only when a live handle receives the intent. Unchanged geometry retains the restored pan/zoom. The source initially marked hidden geometry fitted without a handle; independent review reproduced that regression and the actual-component test now covers its fix.

## Evidence

- Full current workspace app tests: **517 passed, zero skipped/failed**. TypeScript and ESLint exit0. The workspace count includes the separately developed preliminary race-clock tests; this map fix does not claim M5C integration. Output is recorded in ignored `build/app-m8-lifecycle.txt` and the associated terminal output.
- Web/iOS/Android bundle export succeeded, recorded in ignored `build/export-m8-lifecycle.txt` / `build/export-v5-m8-lifecycle`. Bundle generation is not a native installed-device test.
- Actual-source regression coverage: synchronous OS revocation; complete suspend/resume before render; renderer disposal and camera retention; stale callbacks; hidden debounce/held responses; deferred route fit; outer share-preview intent; held idle permissions and recorded-ride isolation.
- Browser QA on the real signed-in preview: one map canvas at home, zero on Me, zero in fullscreen speedometer, one after restoration. Thai setting restored; no ride, cloud friend, position, approval or result was fabricated.
- Ignored screenshot: `build/review-v5/m8/map-lifecycle-th.png` shows the loaded neutral-black in-app basemap and actual unavailable GPS state.
- Public CI for source commit `67fabb9162d8c7dd3e8725f850f006d4a3fcdcd8`: Android compile/package run `36806370737` succeeded; iPhone source verification run `36806370646` succeeded. That iPhone run did not perform a new native iOS compile.

## Still to verify

Installed-device renderer memory and remount cost, cold start/map readiness, mid-range Android performance, 30-minute GPS/battery behavior, Reduce Transparency/large text/landscape layouts, and 60/120 Hz interaction remain physical-device acceptance. Browser canvas counts and unit tests do not establish those targets. The separately rendered motion family and complete M5C/M6/M7 functionality are ongoing.
