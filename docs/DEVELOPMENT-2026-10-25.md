# Published status — 2026-10-25

Sites version 24 successfully deployed from `e049d3223fe021df541e74fa4eb8626fac2ba6a4`.
The owner confirmed the production app works and authorized this GitHub synchronization.
Code and tests below match the deployed source; this status note is GitHub-only.
GitHub retains its existing project-id-free hosting manifest. Production DB binding,
secrets, schema and migration files were not changed by these corrections.
Recoverable D1 backup and applied migration-state verification remain outstanding.
The development record below describes the isolated stages before publication;
its no-publication instructions were superseded by the owner’s explicit authorization.

---

# Quinteto: isolated broker / unchanged-roster corrections

Status: revision 3 implemented and validated locally; NOT published or pushed anywhere.
Previous isolated checkpoints: r1 `4d36d2caed8d7eb5dd797dd50504e8c6d03b1416`,
r2 `a61f79897190926dcb8e03cf67584386230426ef`.

## Provenance and authorization

- Base: Sites v23, source commit `b6702f2e43513ac066bc1da0ad43298d7ddd015b`.
- Existing project: `appgprj_6ab6c437d0e4819187558046061e6859`.
- Public URL: https://quinteto-liga-supermanager.ramafoz.chatgpt.site
- Work performed in an independent cloud checkout, branch `isolated/broker-comparison`.
- Checkout has no Git remotes. GitHub and Sites source repositories were not updated.
- No production D1 access or production credentials were used for tests.
- No new Sites version was saved. No deployment, production migration, seed or import ran.
- `.openai/hosting.json`, `db/schema.ts` and `drizzle/` are unchanged from v23.

## Changes

- Shared signed broker aggregates distinguish unavailable values from verified zero,
  exclude stale/other-journey/other-season results, and expose counts and finality.
- Unchanged totals use the same team's snapshot from the immediately preceding
  league round; missing intermediate snapshots cannot silently select an older team.
  This remains independent from the current round's declared baseline.
- Existing `scores_json` remains an ARRAY. Optional `sourceResults.acb` and
  `sourceResults.rincon` keep independent observations without SQL changes.
  Existing top-level score fields remain the compatibility projection.
- Sold-player cache remains `noChangesScores`, understood at any array position;
  refreshes and roster imports preserve it. It never contributes to official totals.
- Score writers re-read current stored JSON and use a bounded compare-and-swap
  retry on JSON/roster identity, preventing concurrent source overwrites.
- Individual historical read errors are isolated in the refresh path. Global
  invalid-journey/source responses still stop the refresh without fabricating zeros.
- Verified same-round final observations survive temporary failures and retain
  their observation time. Failed provisional data stays stored but is marked old
  and excluded from current aggregates. Later successful reads clear that state.
- Final historical deltas retain an already verified opening price when available.
- ACB cannot bind a different journey over an existing Rincón journey.
- Compact labels cover initial price, partial, provisional, final, previous and pending.
  Historical deltas are shown even if the absolute price is unavailable.

## Validation (2026-10-25)

- `node --test --test-reporter=tap tests/*.test.mjs`: 145 passed, 0 failed (revision 3).
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: passed.
- `npm run build`: passed. Vinext emits its route-classification notice for routes
  it cannot classify by static analysis; this is not a build error.
- `git diff --check`: passed.
- Existing regression coverage retained: points/standings, accumulated broker,
  manual adjustments, declarations, roster change history, Galician quota,
  prior-round newcomers, postponed JOV–AND J2, polling, privacy and authentication.
- Added coverage includes partial J4/J5 examples, signed/zero/stale/other-round
  values, independent sources in both orders, real score-writer and roster-import
  integration, concurrent writes, one-player history failures, and HTML rendering.
- Database tests use SQLite `:memory:` with synthetic fixtures. Upstream ACB/Rincón
  responses are simulated or use the already tracked HTML fixtures.
- Interface validation is static server rendering; no actual iPhone/browser visual
  verification or live J4/J5 production replay was performed.

## Limits and publication gate

- Values already erased by old refreshes cannot be reconstructed from absent data.
  A later authorized historical refresh can recover results where Rincón supplies them.
- Legacy records remain readable without bulk rewriting. Strict current-journey
  aggregates exclude unidentifiable observations rather than guessing their round.
- Production migration application state and an accessible recoverable D1 backup
  remain UNVERIFIED. Production row-viewer projections can truncate JSON and cannot
  certify a complete backup or before/after content comparison.
- Do not publish until these checks are resolved AND the owner explicitly authorizes
  deployment. Any required SQL migration needs a separate explanation/authorization.
- Production D1 linked as `DB` is the only authoritative data store, including all
  records after 2026-10-10 and J5. Never replace it with local or GitHub data.
- Keep the existing project ID, DB binding and TOKEN_ENCRYPTION_KEY unchanged.
- After authorized publication and validation, GitHub may mirror the final source;
  preserve its project-id-free hosting manifest without copying it over Sites config.

## Recovery of this unpublished work

The accompanying checkpoint contains the full tracked source, a Git bundle of the
isolated branch, the patch against v23, and validation logs. It contains neither
node_modules nor production databases, secrets or local runtime state.

Restore the bundle into a NEW local/cloud directory, selecting branch
`isolated/broker-comparison`; do not push or publish it as part of restoration.
The source snapshot is also usable without the original workstation or this workspace.
Install the locked dependencies before re-running validation.

## Revision 2: source fallback and non-participation

The original isolated checkpoint had a confirmed projection defect: a fresh null
from one source could hide a valid same-round point value stored in the other.
`bestPoints` now selects finite, same-season/same-journey observations, prioritizing
non-stale data, verified finality, and observation time. Zero is a valid value.
Source-specific observations remain independent. Explicit SuperManager exclusions
take precedence. New observations without season/journey provenance are rejected;
legacy observations may inherit only their containing snapshot's context on merge.

The same selection is used by unchanged-roster points. Retained players can use
ACB points and sold players can use Rincón results; broker always uses its own
verified observation (or the explicit J2 rule). Point and broker counters stay
independent. Integration tests verify stored raw_points, manual adjustments and
classification for failures in both source orders.

### Evidence required for a non-participation zero

- A verified response for the requested season/journey, including the advertised
  row count and unique player/club identity.
- The player's own complete row explicitly shows zero minutes and all box-score
  statistics at zero, with no contrary nonzero points or broker variation.
- At least two OTHER players of the same club and match ID have verified positive
  minutes and published points, using the already downloaded live page.
- The match status is explicitly live or final.

This produces a provisional zero while live and a final zero after the match.
Subsequent actual participation replaces provisional zeros with real signed values.
Inferred zeros cannot override evidence that the player already participated.
Failed provisional observations remain stored as old data and do not count as
current. Verified final observations, including non-participation evidence,
survive transient failures. Historical explicit no-play rows continue to require
verified match completion; HTTP/format failures have a separate failed status.

### Schedule and postponement limitations

An absent player row or absent club is never evidence for a zero or postponement.
If the live response does not describe a required club's match, at most one shared
calendar request is made per refresh. The parser verifies the requested season
and round article. Future schedules are interpreted in Europe/Madrid; an overdue
schedule with no live/final status remains UNKNOWN, not postponed. Calendar failure
leaves the state pending without discarding valid independent player observations.
Pregame placeholder zeros and contradictory schedule/statistics are not counted.

Explicit postponement labels can be displayed, but no general SuperManager
exclusion is invented. JOV–AND J2 2026/27 is the only verified exclusion: zero
points/broker even if played later. It is shared by live/historical Rincón and ACB
updates. For excluded ACB players, reported upstream points/valuation are retained
separately for audit while normalized SuperManager totals remain zero.

### Additional validation and limits

The 135 tests include the previous 105 regressions plus source fallback, matching
provenance, out-of-order observations, all requested participation transitions,
technical failures, incomplete responses, postponed/scheduled/unknown matches,
sold nonparticipants, provisional/final zero counts, unchanged mixed-source
totals, raw_points/classification integration and rendered zero labels.

Two small HTML fixtures were extracted from public Rincón pages read on 2026-10-25:
the actual Howard Sant-Roos J5 zero-minute row with two participating teammates,
and the J5 calendar article. Live transitions and postponed statuses additionally
use synthetic fixtures; no real match state is fabricated for production.
No full production J4/J5 database replay or actual iPhone visual test was performed.
No Sites/GitHub/production-D1 operations were made during this revision. The
publication gate and backup/migration limitations above remain unchanged.

## Revision 3: coherent stale-point totals

Confirmed defect: `livePoints` included stale observations in its partial sum,
although unchanged-roster points excluded them. A stale cached `raw_points` could
also become a misleading fallback. This correction changes derived totals and
completeness, without deleting observations or rewriting production history.

`pointsTotal` now supplies one shared eligibility calculation to live totals,
unchanged totals, player counters, score-write completeness, and cumulative
classification eligibility. Only finite, non-stale, matching-context values count;
a valid alternative source may count instead. Signed points and real zero count,
sold metadata and players outside the current roster do not inflate live totals.
Legacy unlabelled ACB observations retain their snapshot-scoped interpretation,
without mutating their saved representation or accepting explicit context mismatches.

For automatic results:
- A partial live sum uses eligible observations only and never falls back to a
  previously complete raw_points cache. No eligible values means null, not zero.
- liveNet subtracts the existing administrator adjustment exactly once; if points
  are unavailable, the net is also unavailable (not a penalty-only negative score).
- The points counter and its partial/provisional/final state are shown in both
  the team view and round standings. Ranking uses the same live/net calculation.
- The API lineup netPoints now agrees with the displayed derived live net.
- Closed incomplete snapshots remain pending in cumulative standings; their saved
  raw_points and old score JSON are preserved, not recalculated on read.

Manual totals retain the existing explicit marker `scores_at = NULL`. Their
raw_points remains authoritative even if old player observations are stale. Manual
adjustments, final valid totals, baseline declarations and substitution history
are untouched. Manual aggregate totals do not fabricate player-level completeness;
the independent unchanged-roster comparison still reflects actual eligible players.

The 10 new regression tests (145 total) cover the reproduced 17-point failure,
45-point subtotal and 9/10 counter, all-stale null totals, cross-source fallback,
wrong season/journey, signed/zero values, sold caches, final and manual totals,
API netPoints, cumulative pending/counting, preserved stored JSON, and actual
rendered round ordering by live/net values rather than an obsolete raw cache.

No further inconsistency was found in the totals covered by these tests. This is
not an exhaustive guarantee for every production record. Real-device visual QA,
full production replay, production migration-state verification and recoverable
D1 backup access remain unverified. No production access, migration, publication,
Sites revision save or GitHub update was made for this correction.
