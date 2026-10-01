# M6 ranked contract — root-approved 2026-10-01, backend implementation pending

This additive contract does not redefine deployed RPCs. The root approved the read proposal and clarified the policies below; `types.ts` is the exact client contract for backend review. Backend 010 acceptance remains required before a hosted read can be called supported.

## Audited sources and gaps

- `src/app/(tabs)/rankings.tsx` currently reads `rs_leaderboard`, renders Thai-only controls and up to 100 unpaged rows. It has no own-rank reader or vehicle-class filter. A failed first read also reaches its empty-state branch.
- Migration 001 `rs_verified_records` genuinely verifies `sustained_min_3s_v1`: the minimum supported speed over a continuous three-second window. The published metric is not an instantaneous GPS maximum. `rs_leaderboard` selects one record per owner, evaluates approval/block/friend/visibility, and already computes Bangkok day/week/month bounds. Its `dense_rank` speed ties are an existing metric policy.
- These legacy records retain category, course and evidence digest, but no immutable vehicle/cc/powertrain snapshot. They can only be classified as unknown. A current Garage vehicle must never retroactively supply their class.
- Migration 004 ride summaries retain a start vehicle snapshot/class but explicitly remain private, self-reported. Ordinary ride maxima and M5C result `maximum_speed_mps` do not become sustained verified records merely by displaying them in Ranked.
- Migration 009 `ride_private.race_results` retains `route_time_v1` intervals, private approval/config identity and native-evidence-consistency quality. `rs_race_results` is an accepted-member private read. Neither the evidence consent nor a friend's race invitation authorizes a public board. There is currently no audience publication mutation.
- Race attempts retain an immutable owner-selected vehicle snapshot. Its category/cc/powertrain is self-reported metadata, independent of evidence quality. The current scheme supports scooter 125/160 boundaries, motorcycle 500/900 boundaries and separate EVs; cars have no declared car-class field and must remain unclassified or EV in version 1.

## Eligibility and board identity

1. Metrics stay separate: `sustained_speed` / `sustained_min_3s_v1`, and `route_time` / `route_time_v1`.
2. Route-time identity includes the exact approved configuration (`approval_id`, `config_hash`, route revision) and race mode (`async` or `live`). Different modes/configurations are not comparable. An approved course selector is a bounded, paginated sanitized projection, without route geometry, pins, gates, evidence paths or private membership.
3. A row is eligible only while its canonical result is verified, operator approval remains valid, the owner and requester are permitted, no block exists, the account is not deleting, and explicit publication audience permits this scope. Rejected/DNF/processing/self-reported results never enter the board.
4. A new result starts private. Sharing a verified result to Friends or Global requires an explicit separate review/action, with revocable audience. Global accepts only global publication; Friends accepts friends/global publication and current accepted friendship or self. Private owner results are not silently inserted into a shared comparison; `self_status` explains private/unclassified/no qualifying record.
5. New sustained-speed production, if included in M6, needs an explicit independent trusted-worker sink using complete approved-course evidence, not promotion of the existing instantaneous speed field. Preserve old records/method semantics. The root/backend owner must select that producer or declare its capability unavailable honestly.

## Immutable class scheme 1

Categories are `scooter`, `motorcycle`, `car`. Class selection supports `all` plus category-specific keys:

| Category | Combustion/unknown-powertrain with known cc | Electric | Missing class |
| --- | --- | --- | --- |
| scooter | `scooter:le125`, `scooter:gt125_le160`, `scooter:gt160` | `scooter:ev` | `scooter:unknown` |
| motorcycle | `motorcycle:le500`, `motorcycle:gt500_le900`, `motorcycle:gt900` | `motorcycle:ev` | `motorcycle:unknown` |
| car | No invented body/performance class in v1 | `car:ev` | `car:unknown` |

Classification is computed on the server from the immutable result start snapshot. Electric wins before cc; legacy speed records remain unknown. Hybrid keeps its real displacement; label this metadata self-reported, never vehicle-certified. Default selects the active vehicle's declared class for convenience only; server filtering remains authoritative. With no valid class, default unknown. `All` deliberately combines classes and the UI discloses that comparison.

## Bangkok periods and uncertainty

Server chooses a single `as_of` per query and returns `timezone: 'Asia/Bangkok'`, `starts_at`, `ends_at` and `as_of` in UTC. Intervals are half-open `[starts_at, ends_at)`. Day starts at Bangkok midnight; week starts Monday; month starts day 1. Device locale/clock never selects eligibility. PostgreSQL official datetime/ISO week behavior: https://www.postgresql.org/docs/current/functions-datetime.html (checked 2026-10-01).

- Speed uses canonical `window_end`, matching the existing deployed metric.
- Approved conservative route-time period policy: the entire finish UTC interval must fit the half-open period, not the verification/upload date. Boundary-straddling uncertain finishes are excluded from that period; do not assign via an invented midpoint.
- Speed uses one best sustained value per owner and preserves dense-rank ties; equal values share rank. Stable display order uses completed time then owner/result ID, not a hidden extra competitive tie-break.
- Route time uses one qualifying interval per owner, choosing smallest upper elapsed bound, then lower bound, canonical completion time and ID for deterministic selection. Overlapping closed elapsed intervals form connected tie clusters across the complete eligible board, including chains spanning pages. Use shared competition rank; next rank advances by cluster size. UI displays outward-rounded whole-second bounds and never ranks rounded labels or interval midpoint.

## Approved read API

`rs_ranked_page(p_filter jsonb, p_cursor jsonb default null, p_limit integer default 30)` is an authenticated owner-scoped bounded read. Filter exact keys:

```
{schema_version:1, period:'today'|'week'|'month', metric:'sustained_speed'|'route_time',
 category:'scooter'|'motorcycle'|'car', class_key:'all'|<class key>, scope:'global'|'friends',
 course:null|{approval_id,config_hash,mode:'async'|'live'}}
```

Proposed envelope:

```
{owner_id, server_now, filter, period:{timezone:'Asia/Bangkok',starts_at,ends_at,as_of},
 board_revision, capabilities:{speed:boolean,route_time:boolean,publication:boolean},
 items:[RankedRow], podium:[RankedRow], self:RankedRow|null,
 self_status:'ranked'|'private'|'unclassified'|'no_record', next_cursor:null|RankedCursor}
```

`RankedRow` common sanitized fields are `record_id`, `user_id`, `rank`, `position`, `tied`, `profile:{name,handle}`, `category`, `class_key`, `class_scheme_version:1`, `metadata_authority:'self_reported'|'unknown'`, `completed_at`, `verified_at`. No arbitrary avatars/signed private URLs, route/evidence/vehicle-owner paths or client-rendered raw error messages.

Speed row discriminant: `{metric:'sustained_speed',method:'sustained_min_3s_v1',sustained_kmh,quality:'submitted_evidence_consistency'}`. Route-time discriminant: `{metric:'route_time',method:'route_time_v1',elapsed_lower_ms,elapsed_upper_ms,quality:'native_evidence_consistency',course:{approval_id,config_hash,mode}}`. Common `provenance_unknown` is true for the legacy speed table, which never retained authoritative source flags. Source audit: `verify-submission/index.ts` recomputes caller-supplied native-labelled evidence with schema/source/flags, accuracy, gap, acceleration, displacement and course-window checks; `_shared/verify-evidence.mjs` explicitly does not prove sensor authenticity. Ordinary ride/race maxima are never promoted and no new speed producer is fabricated.

Server computes ranks before pagination; podium contains only genuinely eligible positions 1–3 (at most three rows, without invented podium slots). It computes `self` independently, including when outside the loaded page. Cursor binds owner/filter/period/board revision and server-defined ordinal; no client OFFSET, timestamp cutoff or rank assignment. Any relevant result/publication/approval/privacy/friend/block/delete change invalidates the board revision and returns `RANKED_CHANGED`, triggering a fresh first page. A singleton/targeted revision is preferable to caching private full board payloads on the free pilot. Root/backend may choose an equally safe stable cursor approach.

`rs_ranked_courses(p_cursor jsonb default null,p_limit integer default 30)` returns the exact `RankedCoursePage` in `types.ts`. Only separately operator-approved public-board discovery titles may be included; no implicit private route-title discovery. Keyset `(approval_id,mode)` is ascending. It must not expose private course information because a board row exists.

Explicit result publication is proposed separately as an idempotent owner mutation with result kind/ref, expected audience revision and audience private/friends/global; receipt/outbox handling belongs to root. Publication must not enable GPS sharing or friend presence. Reporting/revocation is root/backend-owned.

### Approved explicit publication and owner selector

`rs_get_result_publication(p_metric text,p_record uuid)` returns `RankedPublication` from `types.ts`. An existing genuine own record without a publication row has revision0, audienceprivate and updated_atnull. Foreign/missing references return the same fixed `RANKED_RECORD_UNAVAILABLE` response. `rs_ranked_mutate(p_operation uuid,p_request jsonb)` accepts the exact `publication_set` or `report_record` union in `types.ts`, and returns an exact `RankedReceipt` or `RankedMutationError`. `rs_ranked_operation(p_operation uuid)` is own exact receipt/null. Persist the UUID/request before egress; replay is checked before current eligibility, quota or CAS and cannot reapply an old audience. Unknown outcomes keep the original operation. Recognized business failure retires only after receipt lookup confirmsnull. Publication needs exact expectedrevision; profile is required for a nonprivate share, while private revocation remains available to the owner. Nonprivate route-time publication additionally requires separately enabled operator board discovery for its exact config/mode. A report is visibility-bound and never automatically hides or rejects a verified record; moderation is a trusted separate operation.

`rs_ranked_own_records(p_cursor jsonb defaultnull,p_limit integer default30)` returns exact `RankedOwnPage`. Items contain the genuine own immutable metric/value/method/quality/category/class/course fields, completion/verification/provenance and current `{revision,audience,updated_at}` publication, without rank, position, tied, profile, user_id, coordinates or evidence paths. Current verification/account/operator approval is required; private course discovery is unnecessary for this owner-only read. Keyset cursor is `{completed_at,record_id,metric}` descending in that order with exact PostgreSQL microseconds. The full getter/receipt publication result includes owner/metric/record IDs; the item's nested publication intentionally omits those repeated fields. This selector supports private results that have no public board row.

Additional fixed mutation errors are `RANKED_OPERATION_CONFLICT`, `RANKED_PUBLICATION_CHANGED` and `RANKED_RECORD_UNAVAILABLE`; rate errors alone include retry_after_ms. Root approved additive010 retirement of authenticated/public `rs_leaderboard` EXECUTE to prevent the old submission-audience API from bypassing this distinct explicit publication. Trusted service/internal legacy behavior and owner-only direct record RLS remain. Matching new clients must use the bounded Ranked APIs.

## Client/presentation contract

`rs_ranked_publications(p_cursor jsonb default null,p_limit integer default 30)` returns exact `RankedPublicationPage`: `{owner_id,server_now,items:RankedPublication[],next_cursor:null|{updated_at,record_id,metric}}`. It reads retained own publication settings regardless of current record qualification or approval, including private settings. Only persisted positive revisions with nonnull UTC update times appear; implicit revision-zero private settings are absent. Keyset is descending exact microsecond update time, UUID and metric. It shares normal `ranked_read` admission and denies deleting owners. No result value, course, geometry, profile or qualification claim is included. Owners can discover and revoke every existing share after approval expires; approval returning never creates a new consent. Source/account purge removes dependent settings rather than inventing history.

Stateless `RankedScreen({port,t})`, with `RankedScreenPort` supplied by the root's future provider. The port carries captured owner/generation, current/parent guard, focus/foreground/moving/online gates, chosen filter, server envelope/rows/podium/self, first/next-page/loading/fresh/error/hasMore, paged courses and `setFilter`, `refresh`, `loadMore`, `loadMoreCourses`, optional current-result publication entry and sign-in callbacks. No UI calls old RPCs, starts a watcher or constructs fake rows.

Filter changes and list callbacks repeat parent guards with the current generation; movement disables editing/scrolling. An unread/error first page never claims no records. Offline cached rows remain labeled stale; uncertain or unsupported boards explain the capability instead of showing a fake zero ranking. Header/actual podium use M8 `ranked-{period}` and `podium-{first|second|third}` theme-resolved loops through the existing max-two playback budget; quiet text remains stable, Reduce Motion uses posters. No local animation ticker, fake progress or device FPS claim.

## Required tests before freeze

- Bangkok midnight/Monday/month/year/leap boundaries with UTC output; period eligibility uses canonical completion, including uncertain finish boundaries.
- Immutable class edge decimals, EV/unknown/legacy/car handling; changing Garage never rewrites past class.
- Speed ties and interval overlap chains spanning pages; own rank beyond page, actual 0/1/2/3 podium rows.
- Strict discriminants/keys/bounds/duplicate IDs/filter/window/class/owner/cursor response binding; private geometry/secrets never accepted.
- Failed unread page vs genuine empty; offline/stale markers; held page/filter/account/focus/movement callbacks; retired generation cannot issue transport; native View raw-text structural check.
- Backend owner tests current friend/block/delete/approval/visibility revocation, result forgery, invalid cursor and exact trusted worker method/class.

## Operational backend acceptance

Root approved read names/envelopes, server-bound revision cursor, legacy speed provenance/semantics, conservative finish-boundary and upper-first personal-best policy. `types.ts` freezes the concrete cursor/quality/discovery keys. The backend owner must implement/validate them after M5C 009 acceptance. Explicit owner publication idempotency/receipt APIs and reports remain separately root/backend-owned; the stateless Ranked port exposes an optional entry to that review rather than guessing a mutation API.
