# Protected Community media cleanup operator tool

This is a source-only, separately reviewable setup. No hosted job, Vault value,
network request or permanent cleanup was installed/invoked during preparation.
The approval for the three Edge gateway settings did not authorize this job.
Do not execute the installer until the human approves the exact protected
expired-binary cleanup and its own bounded history deletion.

The hosted read-only catalog preflight at 2026-10-01 09:27:02 UTC found Cron and
the `pg_net` extension API absent, Vault 0.3.1 installed, and effective
`service_role` access to Vault. A preloaded net worker was visible; that does not
prove the SQL extension API exists. The separate names-only preflight at
09:31:17 UTC found zero `project_url` and zero `service_role_key` entries. Neither
query read a secret value. These are unmet prerequisites, not installed jobs.

The installer creates a private `ride_operator` schema, one default-deny request
metadata table, one operator-invoker helper and the exact current-operator/current-
database job `ride-community-media-cleanup-v1`. It creates/activates a minute job
but does not call the helper during setup. Once committed, the scheduler can
permanently remove eligible binaries. Existing unknown same-name commands,
foreign owners/databases, duplicate jobs or partial operator objects fail closed;
the script does not overwrite them. Repeating the exact reviewed setup retains
the job ID and may reactivate its own inactive job. All unrelated jobs and their
histories are preserved. Existing migrations and M5B/M5C operator scripts are
unchanged, and no pilot is enabled.

## Prerequisites to review before approval

1. Deployed immutable011 plus terminal metadata012, and the reviewed canonical
   `community-media-cleanup` worker. Its legacy JWT gateway must remain off while
   the canonical handler requires the exact configured service credential. A
   prior anonymous401 is authentication evidence, not service-cleanup success.
2. A trusted login operator (normally the dashboard `postgres` role), working
   Supabase Cron, Vault and `pg_net`, the documented Cron signatures and
   `net.check_worker_is_up()`. The scheduler installer neither installs extensions
   nor restarts a worker. For the observed absent extensions, the separate
   `m7-community-extension-bootstrap.sql` is a fresh-only atomic preparation:
   it installs the available managed Cron/net extensions, checks their exact
   API, and restricts PUBLIC/browser/service access to Cron/net/Vault. It never
   schedules, invokes HTTP, reads a credential or deletes a binary. It refuses
   preexisting Cron/net extensions or namespaces. Review it separately before
   authorizing execution; an incompatible API, unavailable extension or inherited
   unsafe grant rolls the entire bootstrap back. Do not substitute an HTTP client
   or remove its guards. A missing/stopped worker remains a concrete gate.
3. Private `vault`/`net` ACLs: PUBLIC-derived or explicit schema usage, Vault
   reads/writes, queue/response access and `net.http_post` execution must be
   denied to `anon`, `authenticated` and `service_role`. Inspect actual grants
   and preserve explicitly authorized trusted automation roles before any
   ACL repair. The bootstrap preserves explicit grants to other trusted roles;
   automation relying on PUBLIC-derived privileges needs explicit review first.
   Upstream `pg_net` defaults grant PUBLIC table/schema access; do not assume
   installation is already safe. The scheduler installer refuses unsafe grants
   and does not rewrite extension ACLs or unrelated jobs.
   `ride_operator` must remain outside exposed API schemas.
4. The human enters two Vault values in the dashboard, never chat/source/SQL
   literals: `project_url` = the nonsecret reviewed origin
   `https://mzjmhvwixptrmnaalijt.supabase.co`, and `service_role_key` = the exact
   service credential selected by the canonical worker. Keep that name even if
   its value is a newer `sb_secret_…` key. Worker selection priority is
   `SUPABASE_SECRET_KEY`, then `SUPABASE_SERVICE_ROLE_KEY`, then the `default`
   member of `SUPABASE_SECRET_KEYS`; an older service JWT is not interchangeable
   with a differently selected secret. Do not use a publishable/anon key or
   weaken the handler to accept one. The user must enter/save credentials.
5. Exactly one Vault row per required name, the fixed HTTPS origin, no trailing
   slash/path/query/fragment, and the canonical nonredirecting endpoint
   `/functions/v1/community-media-cleanup`. Runtime rechecks the URL against the
   immutable reviewed origin; changing Vault cannot redirect the service token
   to another project. Only `Authorization` and JSON content type are sent,
   without an `apikey` custom header or client-controlled body. `pg_net` follows
   redirects and exposes no per-request redirect-disable option, so retain the
   previously reached canonical endpoint and review gateway/origin changes.
   Never log/print the protected request queue: it temporarily contains the
   authorization header. Setup checks only credential-name metadata; it does
   not decrypt or output `service_role_key`.

The separate authorization should name the exact cleanup: invalid/obsolete or
deleted media, uncommitted reservations after24h, and committed media in
unpublished drafts afterseven days. Published current manifests are protected
by the canonical service RPC. A call leases at most20 objects for two minutes,
uses Storage removal first and acknowledges the exact lease only afterward.
Failed Storage/ACK releases or expiry retain retryable metadata. This scheduler
does not change those rules, delete accounts, approve a course or send GPS.

## Concrete execution and observation sequence

1. Review source hashes, the worker hash and current organization usage. Execute
   only `m7-community-cron-preflight.sql` before installation: it is catalog/ACL/
   worker presence only, safe with absent extensions and no secret access.
   `null` ACL values mean absent objects, not safe grants. The separate
   `m7-community-vault-preflight.sql` returns only the two required name counts
   and is safe once Vault exists. Resolve prerequisites and obtain the separate
   human authorization. If needed, execute the reviewed fresh-only bootstrap,
   then repeat the catalog preflight. No manual positive cleanup call or
   synthetic production upload is routine readiness QA.
2. After approved prerequisite preparation and user-entered Vault credentials,
   run the exact reviewed
   `m7-community-cron.sql` in the trusted operator's database. It returns only
   the owned job's metadata and command hash. Any fixed `COMMUNITY_CRON_*` guard
   means stop and resolve that condition; do not replace an unknown job or put
   credentials into its command. Setup is atomic. It never calls HTTP before
   commit and never claims a successful future job.
3. Let the real schedule execute. Run read-only `m7-community-cron-status.sql`
   after installer objects exist, plus existing `m7-community-readiness.sql`
   for aggregate Storage budgets/pending counts. Status contains only counters,
   times, job command hash and transport statuses. It omits IDs, Vault values,
   commands, URLs, headers, raw response/error text and binary paths.
4. Distinguish three observations: Cron `succeeded` proves the SQL enqueue/guard
   completed; HTTP200 proves an HTTP response; `worker_acknowledged` requires a
   strict canonical `{removed,failed}` count response with zero failures. A
   successful empty `{removed:0,failed:0}` proves authenticated worker completion
   but not a real binary deletion. Positive `removed` counts represent the
   canonical Storage→exact-ACK sequence; observe genuinely eligible media when
   it exists rather than fabricate a production fixture. HTTP401 usually means
   the entered Vault credential does not match the handler's selected key.
5. `pg_net` normally retains responses for six hours. Older dispatches whose
   response expired are explicitly `response_missing_or_expired`; they must
   not be relabelled successes. Retain external aggregate review evidence when
   observing runs. Successful ticks remove at most1000 old own ledger rows and
   at most1000 own Cron history rows older than seven days. A guard/dispatch
   failure rolls its transaction back, including history cleanup, so failed-job
   history can accumulate until the operator resolves the failure. Still-queued
   ledger entries are retained rather than hidden. No unrelated Cron history or
   `pg_net` rows are removed by this tool.

## Bounds, failure handling and pausing

The job wakes once per minute, HTTP timeout is55s, and SQL has a5s statement
timeout. At mostone new dispatch per60s and1440 per rolling24h are admitted.
Any tracked request still in `pg_net`'s queue blocks new work, including a stale
queue. A consumed request with no response waits180s from the first observation
that it has left the queue before another request, including delayed backlogs;
transport timeouts/errors or noncanonical gateway responses remain unknown,
even when a `pg_net` response row exists; only strict worker completion counts
can release that grace early. A55s client timeout does not stop a server worker
that may continue for the free-tier150s wall limit. Unknown completion is not an
ACK. The ledger caps at11000 rows and fails closed
on capacity. Each real handler invocation claims≤20 binaries. These are app
bounds, not an organization-wide billing guarantee or exact execution latency.

At1440 daily calls, a30-day always-on schedule can make43200 Edge invocations;
combine this with race and other jobs/functions and inspect actual usage. The
Community256MiB and aggregate768MiB reservation/actual limits stay enforced by
the existing server functions. A stalled worker/queue,401/503s, an unknown
response, quota pressure or missing Vault data must remain visible. The source
tests do not certify managed Cron/pg_net, hosted Storage behavior, real secret
selection, Edge CPU/memory, native installation or privacy revocation on devices.

To pause, after operator review, deactivate only the exact own job in the Cron
dashboard. Do not delete ledger/queues or unrelated jobs to hide failure. Apply
the exact installer again only if its original command/owner/database still
match and renewed operation is authorized. No pause/resume SQL is run during
source QA.

## Local verification and official references

Run `node --test tests/m7-community-ops.test.mjs tests/m7-community-bootstrap.test.mjs`
from `backend/`. Tests execute
actual operator SQL after all immutable migrations in isolated PGlite, with
Cron/Vault/pg_net facades and a plainly synthetic credential. They prove installer
guards, exact repeat identity, role denial, HTTP arguments, throttles, bounded own
retention and secret-free aggregate decoding. The HTTP facade only records local
arguments; it makes no network request or permanent production deletion.
Bootstrap tests replace only the two literal `CREATE EXTENSION` commands with
local API facades; every surrounding guard and ACL mutation runs in the real
PostgreSQL engine. They test atomic refusal, effective inherited permissions and
preservation of explicit trusted grants. This proves the source boundary, not
managed extension installation/version behavior.

Primary references checked1October2026: [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions),
[Vault and decrypted-view access](https://supabase.com/docs/guides/database/vault),
[Cron jobs/history](https://supabase.com/docs/guides/cron/quickstart),
[pg_net asynchronous requests and response retention](https://supabase.com/docs/guides/database/extensions/pg_net),
[pg_net upstream default grants](https://github.com/supabase/pg_net/blob/master/sql/pg_net.sql),
[pg_net redirect implementation](https://github.com/supabase/pg_net/blob/master/src/core.c),
[Edge limits](https://supabase.com/docs/guides/functions/limits).
The official public scheduling example uses a publishable key for its chosen
function; this worker's service-only contract requires the protected exact key.
