# M5B UI flow brief — QR friendship and foreground group trips

1 October 2026. This brief preceded implementation and was accepted at the root M5B gate. The UI is now implemented against [the M5B contract](../research/m5b-live-contract-v5.md); backend rollout, native acceptance and location activation remain separate. The backend contract is the authority for wire fields, caps and authorization. The existing M5A Friends/Invitations behavior and M4 safe route projection remain intact.

## Composition and entry points

Keep Map · Garage · Community · Ranked · Me. Map adds a group-trip entry in its existing shared lower control, plus a compact current-trip control only when an actual authorized room exists. Friends gains QR/link entry alongside its exact-username request. These are secondary journeys rather than another navigation tab.

Use the reference screenshot principles: map fills the canvas, a few floating controls share a glass container, one lower sheet holds the current action, and detail text sits on opaque black. Apply the existing theme, Anuphan Thai/English body and fixed/tabular Latin numerals. Real member names, an actual safe route and the current action carry the composition. Empty seats may say “Available seat”; they never become invented people, online avatars, positions or progress.

A long members/history list uses one FlatList. Sheets with at most four accepted members and twelve host-visible requests can use short, bounded rows. Do not mount a live map for every list item. QR and final route review sheets are mounted deliberately and disposed on close/focus loss. Preserve map attribution and segmented/hidden route geometry.

## Friendship QR and links

1. Add a friend offers Username, Scan QR and Paste link. Entering or scanning only creates a local incoming intent. It does not resolve a stranger or send a request automatically.
2. Scan explains the camera purpose, requests permission on that action, and has manual entry when permission is declined. The scanner is active only while visible and foreground; a repeated scan cannot open multiple reviews.
3. An installed-app link validates its scheme/version/UUID and 43-character fragment token before retaining the incoming intent. Across login it stays in memory for at most five monotonic minutes, with no token in ordinary account JSON, route params, analytics or logs. A signed account switch clears the intent. A guest must finish sign-in before the review screen consumes it.
4. The user presses Review. Authenticated resolution returns a minimal identity/proof or generic unavailable state. Show the actual display name and @username, expiry and a Send request action. The caption states this requests friendship; it neither accepts friendship nor shares location.
5. LiveProvider persists the exact proof/issuer request and operation before transport. UI says saved/pending until a matching server receipt confirms it. The resulting canonical request appears in the existing M5A request list. A later friendship acceptance stays a separate participant action.

My QR is an owner-only sheet. Choose a one-hour or 24-hour expiry; persist private token material before its create operation. QR is rendered from the exact encoded link; the server supplies no recoverable plaintext. Show only the actual active receipt/canonical link state and expiry. Copy/share/revoke are deliberate actions. A link created on another device whose private token is unavailable shows that fact and offers Create new link, rather than rendering a fabricated QR.

QR accessible text describes its purpose and expiry, without reading the token aloud. Sharing uses the native share sheet after a user press. HTTPS installation fallback is an explicit later domain/setup gate, not a claim that the installed-app scheme already works on any browser/device.

## Group-trip entry and creation

The entry sheet offers Create group trip, Join with code and the actual current room if present. An operationally disabled pilot, full project slots, missing profile or unread room state has a specific state and recovery action. No sample room, code or participants fill the screen.

Create selects a synced own M4 route, gives the trip a name of at most 48 Unicode codepoints, and reviews its exact sanitized immutable projection. Older routes remain reachable through bounded owner paging. A genuinely hidden short route is valid and says its endpoints are hidden; metadata-only historical or raw/unproven geometry cannot substitute for a safe preview.

The host then creates the room. SecureStore owns its eight-character code; ordinary outbox data contains only the domain-separated hash and immutable control request. A matching create receipt acknowledges room creation; it does not enable receiving, recording or location sharing. The room lasts at most one hour under the pilot. A lobby already consumes the project slot.

The lobby shows the real host and accepted participants, up to four including the host. The host sees up to twelve actual pending applicants with Approve/Decline actions. Other accepted members see accepted members only. Applicants see host+self and a waiting-for-approval state, with no topic, peers or other members' consent. A requested join is never drawn as an accepted member or a live marker.

Start group trip is enabled only when canonical accepted membership meets the server's requirement. It transitions a normal group trip; there is no fake race countdown, result, verified badge or leaderboard reward. The existing sustained-speed challenge remains separately labeled in M5A, and route-time/live-race work stays M5C.

## Joining and host decisions

Join has an eight-character Latin code entry, accepts display spaces/hyphens and validates the Crockford alphabet. Resolve starts only on Review code, under current foreground Auth scope. The preview shows the actual host/trip and explains that accepted host friendship plus host approval are required. Unavailable/expired/revoked/blocked/not-found all use generic unavailable copy.

Request to join freezes the exact proof, room revision and host-friend generation. Pending differs visually from Requested, which differs from Accepted. The host's approval/decline/remove pins the reviewed room revision, member generation and member state; a changed room requires a fresh review. Approving a member never grants that member's location consent.

Host end/cancel and nonhost leave have distinct confirmation copy. Host exit cancels/ends the room for everyone; there is no automatic host transfer. Rotating a code invalidates old admissions but does not revoke approved membership or rewrite the route. Unknown responses preserve the same operation for receipt recovery rather than creating a second room/join.

## Receiving and precise-location disclosure

Receiving and sending have separate controls. Both start off; neither is restored on foreground/reconnect by a prior receipt.

View group members enables only authorized position reads/markers. It does not start GPS, recording or the sender's disclosure. A ghost user can explicitly receive; the UI must not imply receiving requires sending. Requested applicants cannot enable the peer view.

Share my precise location requires a current active accepted room, current non-ghost/presence choice, explicit foreground ride capture and actual quality fixes from RideProvider's one capture owner. If recording has not started, explain it and offer Start ride first; after actual acquisition, require the separate disclosure confirmation. LiveProvider consumes a passive guarded sample bus; a screen never creates a second watcher.

The disclosure names who receives it: **everyone accepted into this room**, including host's friends who may not be the sender's direct friends. Offer 15 minutes or up to one hour, clipped to room lifetime. Explain precise location, foreground-only publication, no offline GPS queue, 15-second read expiry, possible already-delivered coordinates and provider retention limits. Do not say “only your friends” or claim already-delivered locations can be recalled.

Canonical ACK acknowledges the specific consent lease/capture. It does not manufacture sensor attestation, a verified ride or new permission. The send control displays actual granted expiry, waiting-for-ACK, revoked, expired, GPS-quality failure or uncertain-clock state. Turning it off immediately stops local publication; pending server confirmation remains visible until the exact revoke is confirmed. A changed lease requires another explicit review, never a silent rebased revoke or regrant.

If ghost mode blocks sending, offer Review privacy settings. Do not silently disable ghost mode as part of granting precise location. Leaving a room, stopping/pausing capture, permission loss, background, account switch or deletion clears ephemeral sample/peer UI and stops sending. A return to foreground requires canonical refresh and a new deliberate grant; local recording's normal recovery continues independently.

## Map and stale-data treatment

Only accepted, currently authorized, consenting members with fresh server-derived positions become markers; at most three other markers. Keep the map's route/HUD hierarchy. Marker labels use real names and distinguish unverified live location from competitive evidence. Accuracy/heading are actual optional values, not invented circles or headings.

Interpolation stays on the UI thread between valid fixes. Never extrapolate beyond the latest fix or freeze a marker after expiry. A failed authorization read, rotation, receive-off intent or 15-second deadline hides peers. An absent position means no fresh shared position; it does not prove a member is offline, stationary or at a previous point.

The compact trip control shows the real current member count, actual session state and receive/send state. The room's one-hour limit and host's 45-second foreground lease are separate from each point's 15-second TTL. Derive UI expiry conservatively from server time and monotonic request-start anchors; a bad device clock gets a useful error, not rewritten GPS evidence.

Control events are GPS-free refresh hints. Dropped hints can be repaired by bounded visible foreground polling. Hidden pages dispose heavy maps and stop receive polling; they cannot keep a second map renderer or an unused playback lease alive. Record no sample/peer coordinates in screenshots used for shared acceptance evidence.

## State copy and accessibility

Use localized codes at render time so a manual language switch updates existing errors. Thai line height remains 1.55, with no Thai letter spacing. Every icon action has a label and 44 pt target; member states are textual, not color-only. Route/QR detail, confirmations and scanner have deliberate modal focus and accessible dismiss actions. Reduce Motion uses immediate state transitions/posters; Reduce Transparency keeps an opaque fallback.

| Meaning | English direction | Thai direction |
| --- | --- | --- |
| Normal convoy | Group trip | ขับไปด้วยกัน |
| Join pending | Request saved; waiting for confirmation | บันทึกคำขอแล้ว รอการยืนยัน |
| Approved application | Host approved your request | เจ้าของกลุ่มตอบรับแล้ว |
| Receive only | View shared positions · GPS stays off | ดูตำแหน่งที่แชร์ · ไม่เปิด GPS |
| Precise sharing | Share with everyone accepted in this group | แชร์ตำแหน่งแม่นยำกับทุกคนที่ได้รับตอบรับในกลุ่มนี้ |
| Revocation unknown | Sending stopped on this device; server confirmation pending | อุปกรณ์นี้หยุดส่งแล้ว รอเซิร์ฟเวอร์ยืนยัน |
| Stale point | No fresh shared position | ยังไม่มีตำแหน่งที่แชร์ล่าสุด |
| Foreground restart | Review again before sharing | ตรวจสอบอีกครั้งก่อนแชร์ |
| Host unavailable | The host connection expired. Refresh the trip. | การเชื่อมต่อของเจ้าของกลุ่มหมดอายุ รีเฟรชเพื่อดูสถานะกลุ่ม |
| Disabled pilot | Live group trips are not enabled for this project yet | โปรเจกต์นี้ยังไม่เปิดใช้กลุ่มที่แชร์ตำแหน่งสด |

These are copy directions, not product translation keys or a renamed RPC contract. Final natural Thai is checked in the actual screens.

## Implementation and acceptance gates

Root freezes the wire and owns LiveProvider, owner outbox/SecureStore integration, sample bus, server-clock/lifecycle fences and confirmed-deletion cleanup. UI consumes that one provider, the existing SocialProvider and M4 projection readers; it owns no independent polling/mutation loop or GPS acquisition. Camera/QR dependencies and local scheme configuration are agreed before install. No source implementation starts merely because this brief exists.

First prove actual-source cases: malformed QR/code and repeated scan; missing secure material; A→B→A/held resolver/expired proof; old membership button; unknown ACK and restored sensitive review; receive without GPS; denied permission; background/ghost/revoke/rotation; stale point disappearance; successful empty versus unread/error; older saved route paging; Thai/English, large text and reduced motion. Reuse M5A's error/empty lessons: an unread or failed page cannot claim “no members,” and a pending receipt cannot claim approval.

Real rollout needs private-channel configuration, verified minute janitor, service-only enable policy and actual PostgreSQL concurrency tests. Native/two-account acceptance uses consenting installed devices; fixture participants and browser/CI do not certify live GPS, 60 fps, battery or timing. No real account deletion is performed for QA. Push delivery, universal links/install fallback, approved route-time races and broader motion loops retain their separately documented gates rather than being represented as completed here.

## Implemented UI evidence

`FriendLinksScreen` and `ConvoyScreen` consume the single root `LiveProvider`; they start no polling, GPS watcher or independent mutation client. Canonical empty state, pending durable operation, rejected result and unread/error state remain distinct. Member controls pin the actual room revision and member generation. The location disclosure pins room, member, consent and exact passive capture; ghost and online-presence choices have separate explanation/actions and never change automatically.

The scanner uses installed Expo SDK57 `expo-camera ~57.0.6`, mounts only inside its explicitly authorized, visible foreground sheet and disposes on blur/movement/background. `qrcode-generator 2.0.4` generates the exact fragment-bearing private link, with a four-module quiet zone and no logo overlay. The actual generated SVG path was independently rasterized and decoded by OpenCV5.0.0 into the exact 108-byte synthetic fixture payload. No real token or test participant is embedded in the app.

The installed Expo config-plugin compiler confirms Android CAMERA remains present, RECORD_AUDIO is removed, iOS camera purpose is present and no microphone purpose is added. `expo-image-picker` no longer globally blocks Android CAMERA; image selection still uses its existing library flow. Camera purpose translations are in the existing English/Thai native locale files. Physical-device scanner permission, optics and localization are still native acceptance checks.

Native Expo Router interception captures valid private links in root memory and returns only `/friend-links`; callback forwarding retains only the existing PKCE fields `code`, `sb_flow_id`, `error_description`. Unknown schemes/paths and arbitrary token query/fragment data never become a route. The Map pending-link control lets a guest resume explicit review after Google sign-in.

Ten actual-provider tests execute the real LiveReader, LiveCoordinator, LiveShareAuthority, LivePositionCoordinator and passive capture bus. They cover hydration, receive without GPS, canonical ACK before sending, held ACK across pause/background/account/deletion, exact grant cancellation, independent receive after own pause, secret-before-control persistence, canonical code rotation, immutable recovery and guest login intent. Actual screen tests cover repeated scanning, held resolver blur/input replacement, stale member/capture controls, presence guidance and false-empty/raw-native-text regressions. This is source/port evidence, not two-device location or frame-rate certification.

Browser secrets use sessionStorage: an ordinary same-tab reload retains them while the browser session lasts. Native owner secrets use root's scoped, hash-versioned Keychain adapter. Incoming links remain five-minute memory-only intentions. A new code is unavailable until its canonical hash is acknowledged; a device without matching private bytes shows an honest unavailable state.
