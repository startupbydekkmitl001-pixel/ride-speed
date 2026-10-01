# M5A acceptance — friends, status and invitations

Verified1October2026 against current V5 source and the real deployed Supabase project. This is the first M5 slice; QR links, foreground convoy positions, route-time/live races, multi-recipient flows and push delivery remain required in PLAN.md.

## Implemented behavior

Friends has accepted/request tabs, exact-handle requests, request actions, generation-bound remove/block, private blocked pages and token-bound unblock. Invitations has incoming/outgoing pages, creation from synced owner routes/current accepted friends, safe-route review, real approved-course availability and bounded date windows. Unknown mutation outcomes retain immutable owner operations for receipt recovery. A single provider fences account generation, captured JWT, foreground, deletion and local-storage failures. No production fixtures are used.

Status is a separate explicit online preference, initially off, and contains no coordinates. Private scoped socket events invalidate canonical reads. Conservative server-clock expiry, failed heartbeat/read handling, immediate off intent and block/remove quarantine prevent cached status from appearing fresh. Failed or unread pages retain error/retry controls and cannot claim that no people exist.

## Verification

- App suite:397/397pass. Includes actual provider/reader/coordinator and SDK paths, A→B→A, captured token, uncertain receipts/storage, held background acknowledgements, delayed TTL, prune versus in-flight read, native text-child structure and failed-page empty states.
- Backend suite:118/118pass, with actual PostgreSQL-engine migration/RLS behavior. Twenty database response cases also pass the actual TypeScript decoders. These single-connection tests do not prove future convoy concurrency.
- TypeScript and Expo lint pass. Web/Android/iOS export succeeds; native installation and frame rate are separate gates. Six unchanged Edge entry points pass Deno checking.
- Real signed-in owner: map Friends/Challenge entries, empty friend/request/blocked/inbox reads, add-friend sheet, and disabled invitation review without a synced route/accepted friend. Thai and English checked; Thai restored. Guest gets sign-in guidance and disabled mutations. No test invitation/friend or location-sharing grant was created.
- At428×926, the owner map Friends button navigates correctly. At the desktop preview's932×430viewport, the compact HUD covers the top-left control. Responsive short-height polish remains M8; the source navigation path itself is not guest-specific. The guest auth gate was also checked by its route URL.
- No fresh browser console error during the final owner checks. Screenshots are local ignored review artifacts in `build/review-v5/m5a`, including Thai/English friends, blocked/invitation requirements and deployment.

## Hosted deployment

Migration`202610010007_social_operations.sql` applied once through the dashboard. SHA256:`A6586BFD5A50AFD6DF4DCF20789ACB00C9C0538AEAA0306ABCAB3466BC6B5EE2`. Full editor source was compared with the local file after CRLF normalization before execution. Result:Success/no rows returned.

Read-only hosted inventory confirms authenticated actor mutation allowed, anonymous mutation denied, retired exact-handle writer denied, receipt RLS enabled and direct authenticated receipt-table SELECT denied. No secret was read or moved into the client. Current Google login remains available. Old browser clients using retired mutation RPCs must update.

## Remaining acceptance

Two consenting real accounts/devices are needed for end-to-end friend accept/block/unblock and invitation response checks. Physical installed-device lifecycle/voice-over/font scaling, native camera/photo permissions, performance, location evidence and push capabilities remain unmeasured. Published build9 predates V5. M4 Android run#7 compiled the current map foundation; its matching iOS run was source verification, while earlier M2 manual#12 actually compiled both iOS variants. Fresh final artifact publication remains M8.
