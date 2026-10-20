# Complete NHL season statistics and both ratings

The reviewed cleanup replaces the incomplete NHL stat-line population with one
canonical player-season for every official positive-GP NHL player. Production has
13,915 rows across 14 played seasons, 2013-14 through the dated 2026-27 snapshot,
including 756 current-season rows. This is an October 19, 2026 snapshot with no
automatic refresh. The two future seasons remain empty.

Production application and independent all-row readback passed on October 19, 2026. All 13,915 stored rows exactly match the reviewed official statistics and
both rating outputs. A fresh local replay proposes no inserts, deletes, link
changes or category-score changes. The final backend repeat-run dry run checked
all 13,915 rows in 145 batches and found zero changes. A separate paginated scan
of the entire production stat table matched every full row and found no missing,
extra, duplicate or orphan references.

The operation inserted 759 missing player-seasons and removed 146 explicitly reviewed
rows: 125 zero-GP placeholders and 21 duplicates. It repairs retained statistics
and canonical links rather than continuing temporary rating-source exceptions.
Nine existing player records received narrowly verified identity/birthday fixes,
and seven distinct people were added. Existing ownership, financial fields and
multi-season fantasy talent remain outside this repair. New people do not gain
signing or re-signing eligibility through their creation.

## Identity and source evidence

Both goalies' official NHL display names are **Matt Murray**. [NHL ID `8476899`](https://api-web.nhle.com/v1/player/8476899/landing)
identifies the goalie born **1994-05-25**, from Thunder Bay, Ontario. [NHL ID
`8483575`](https://api-web.nhle.com/v1/player/8483575/landing) identifies the goalie born **1998-02-02**, from St. Albert, Alberta.
Their canonical NHL IDs remain distinct; their incorrectly attached season stats
are corrected. In particular, the younger Murray's 2022-23 Dallas season has
three games, while the older Murray's Toronto season has 26. The younger goalie
also owns the one-game 2023-24 Dallas shutout; the older goalie has no NHL
appearance that season. Official landing responses establish these identities
without inventing different legal first names.

Kent Simpson's NHL identity is corrected from the unrelated stored ID. The
missing older Erik Gustafsson and forward Daniil Tarasov remain separate from
the younger same-name defenseman and goalie. Five other missing NHL players are
added. Dangling legacy references, duplicated Murashov/Murray rows, Bachman's
incorrect games played and the Boedker team conflict are resolved against
verified source identities and statistics.

Historical summary and total-TOI inputs retain the exact SHA-bound native
snapshots used by the published hockey model. Fresh official NHL realtime
reports supply hits and blocked shots; official bios provide birth dates for
all 2,728 people in the positive-GP population. Joins require official NHL ID,
season and matching games played. Traded players retain a single season total
and all official team abbreviations. Counts and rates retain official values;
time on ice retains exact seconds converted to minutes. Inapplicable fields
remain null. Two goalies with no shots faced retain undefined, null season save
percentages; neither becomes a fabricated zero or perfect rate.

## Goalie starts and ratings

Quality starts and really bad starts are derived from the original cached
official per-game goalie reports, using their explicit `gamesStarted` field.
For every one of the 1,339 goalie-seasons, game-level GP, GS, saves, shots against
and goals against sum exactly to the native season report. All scheduled source
games are covered and establish two starting goalies.

A quality start requires a save percentage at least the season's exact pooled
league save percentage, or at least .885 on 20 or fewer shots. A really bad start
requires a save percentage below .850. The league baseline is total official
saves divided by total official shots against. The low-shot rule follows the
[Sports Reference methodology](https://www.sports-reference.com/blog/2014/12/games-started-quality-starts-on-hockey-reference-com/).
Six starts with zero shots count toward GS but establish no save percentage and
count toward neither QS nor RBS. These cases remain explicit in the evidence.

The new derivation differs from the previously imported counts on 71 comparable
goalie rows. These are disclosed source/method differences, not a claim of exact
Hockey Reference parity. Official season fields are preserved even where saves
plus goals against differs from shots against; no inferred arithmetic correction
is substituted for those published counts.

Every desired row receives a fresh GSHL category `seasonRating` from the existing
PlayerNHL engine, using the complete corrected season comparison pool. Its
`hockeyRating` uses the unchanged reviewed model's signed goals above the
same-position replacement reference. Production contains 10,029 qualified
hockey contributions, 3,861 provisional assessments and 25 assessments with an
insufficient replacement reference. The latter two groups total 3,886 null
unsupported scores. These are qualified model ranks across positions, not official NHL
rankings. The hockey model is not refitted and its contribution values do not
change through this stat cleanup; only explicitly reviewed canonical links may
change on authoritative model records.

## Operator and verification

`repair-nhl-season-stats.ts` owns this explicit repair in separate identity and
season phases. It defaults to dry-run, binds reviewed source/code/operation
hashes and an independently stored before snapshot, compares the complete live
inventory, and preflights every batch before writes. Deletes require exact
before rows and explicit batch authorization. It does not schedule refreshes.
Independent production readback verified all 13,915 rows and all 40,233
authoritative model records. Model records differ only in 14 explicitly reviewed
canonical player links. All 2,893 player records exactly match the snapshot after
the identity phase; the season phase preserved their financial and ownership
fields. The backend repeat-run check passed with zero changes. The final backend
overlay dry run also found no changed modules, preserving all 164 live modules.

The independent plan review compared all 13,915 official rows and independently
replayed every category score. Verification records 78 passing tests, scoped
strict TypeScript, lint on changed lintable files, formatting and focused diff
checks. The shared ranking-engine contract had also passed its 31 tests; no
numerical engine changes were needed for this cleanup. Audit inputs and plans are retained under
`.local-data/nhl-rating/season-cleanup-20261019/`; the before backup is outside the
workspace and OneDrive under
`C:/Users/choug/gshl-backups/nhl-season-cleanup-20261019/`. Source manifests preserve
native, realtime, bios and per-game start proofs separately. The
[earlier dual-rating rollout](nhl-dual-season-ratings.md) records the preceding
association-only operation; its old population counts are historical.

The completion evidence is `final-proof.json`, binding the applied snapshot,
independent all-row proof, global table scan, zero-change replay and zero-drift
backend overlay by SHA-256. The independent `after/manifest.json` backup covers
these artifacts, source evidence and the exact repair code with verified file
readback. Before snapshots remain preserved separately.
