# Additive M7 terminal draft compatibility repair

The original post deletion API left an unpublished legacy post in
`moderation_state='draft'` and set `deleted_at`. Migration011 assigned every draft
revision0, but owner settings list terminal rows and require positive revisions.
That genuine historical sequence made the whole owner settings page fail strict
decoding. This is a metadata compatibility issue; it does not expose deleted
content or permit publishing a deleted post.

Deployed011 stays immutable at SHA256
`ADCFA97FB0B81F7727B7068310062873D19A1C77AFEA38768AA2E539861EEBAC`.
Root reported its one-time hosted deployment and aggregate readiness at
2026-10-01 07:35 UTC with zero posts, media and operations. No affected genuine
rows were reported in that project. Do not rerun011.

Apply only `migrations/202610010012_community_terminal_drafts.sql` after review.
Its frozen SHA256 is
`D68F84930EDF17F6BAE544F7E6529BACD4F34D28E88B3DBDC7E9EFC71D532F09`.
It advances only genuine legacy deleted revision0 metadata to terminal revision1,
using the existing deletion/update timestamp. The private legacy projection
trigger retains its exact body except that all draft decisions also require
`deleted_at is null`. Its ABI, grants, definer and empty search path stay intact.
Future trusted terminal inserts and updates therefore produce positive metadata
while undeleted legacy and canonical drafts remain revision0 and read-only.
No client draft mutation, new table, new grant, worker deployment, cleanup job,
policy enablement or cloud fixture is required.

`ops/m7-terminal-drafts-readiness.sql` is an aggregate read-only check, safe after
011. Before012, expect `projection.guard_count=0`; after012, expect3 and
`repairable_count=0`. All anon/app/service direct execution flags for this private
trigger must remain false. Any unexpected guard count before deployment requires
inspection rather than replay. Its SHA256 is
`E5C5B11B082C3DA6ED9069496AD3BF8747E2E55881738B0A53C2275E42D579A0`.

`ops/m7-community-preflight.sql` remains safe even before011 because it only reads
catalogs and never queries a new table or invokes a new helper. A deployed011
returns all eight new tables and nineteen new public functions as present. It is
not an absent-schema go-ahead to replay011. Its SHA256 is
`0175276D83397D7919815652327D8E552D3295A9DC2EA1F9BC2C56ECAFDA1D61`.

Validation: `node --test tests/m7-terminal-drafts.test.mjs` reproduced both actual
decoder failures before the repair, then passed three cases: original pre011
create/delete upgrade with exact owner getter/list decoders, future trusted
terminal projection with exact predecessor body/ABI/grant comparison, and
catalog preflight before/after011. Deleted content remains unavailable,
cross-owner settings remain unavailable, and draft deletion at revision0 remains
invalid. The repaired readiness query is exercised before/after012.
Full `npm test` passed277/277 with zero skips, including all existing real
PostgreSQL concurrency cases. Actual app provider/owner metadata tests passed
38/38. These local checks are not hosted mutation or native performance claims.

As of this document,012 is source-reviewed and locally verified; hosted012
execution remains the root agent's separate deployment step. Existing Community
worker sources and their reviewed bundles are unaffected.
