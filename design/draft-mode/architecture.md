# Draft orchestration and state

This is a design contract, not evidence that these APIs exist. The shared simulation owns contact, flight, fielding, environment composition and baseball-rule execution. Draft supplies explicit run-specific inputs rather than forking a second engine.

## Modifier definitions and runtime instances

Model a run as a versioned collection of **franchise packages**, **park traits**, **decrees**, and **fan states**. Effects should use a typed, narrow vocabulary rather than executable scripts or unrestricted arbitrary stat keys.

Suggested effect families:

| Family | Example configurable fields | Consumer |
|---|---|---|
| Plate appearance | BB/SO/1B/2B/3B/HR/OUT weights, optional explicit event redistribution | `contact-profile.ts` (`matchup`) / `rates.ts` |
| Contact and environment | estimated exit-velocity, launch-angle and spray distributions; wind vector, air conditions, fence and roof geometry, terrain | shared contact/flight resolution and fielding |
| Baserunning | speed multiplier, steal-attempt multiplier, steal-success delta, advancement delta | `advancement.ts` / `inning.ts` |
| Fielding | position-aware error-rate multiplier, double-play modifier | `contact.ts` / `inning.ts` |
| Game rules | regulation innings, outs per half-inning, extra-inning rules, closer-entry window, advancement limits, base route, steal permission, force chains, bunt awards, ring rulings | game/inning rules, workload and win expectancy |
| Pitch and batting position | count thresholds, foul/check-swing rules, legal batting positions and their contact effects | a disclosed pitch/count and positioning model or calibrated abstraction |
| Economy | full-roster salary cap, obligations, cap progression, banked cash, nine-game minimum/ticket/win payouts, franchise rewards and price modifiers | draft, checkpoint, shop and roster rules |
| Development | applicable upgrade parameters, current skill/headroom, original tier, gains, one-purchase-per-visit record, funding provenance and sale-bonus history | player instances, purchases and transactions |
| Transactions | player ownership, waivers, trade eligibility and two-chapter cooldown | trade/claim state and atomic roster validation |
| Crowd | attendance scale, home/visitor bias, volatility, expectations, event hype, inning/score attendance curves, rivalry response and standings-based buy-in | pregame environment, in-game events and season state |

Each modifier definition should include an immutable ID, display name, satirical description, scope, supported timing, duration, list of typed effects, source/version, and short explanation of what a player should expect. A separate active instance records its start chapter and remaining duration. The run log preserves the IDs and activation times.

Player instances preserve starting salary, original tier, current developed skills, purchased upgrades and funding provenance, per-visit purchase history, trade-cooldown deadline and once-per-run franchise payout records. Upgrades and protection deadlines follow transfers, including release and waiver claims. Remaining transaction ordering and claim policy require explicit design. Runtime instances are separate from immutable historical profiles and cosmetic presentation.


[Shared model](../simulation/model.md) owns environment resolution order and physical effect composition. Event-driven crowd updates affect subsequent play, never the triggering event. Economy affects roster construction, not plate appearances. A physical park effect must not also receive an outcome multiplier for the same cause. Absolute-rule conflicts require declared priority or rejection, not accidental last-write-wins behavior.

Not every comic premise warrants a simulation effect. Flavor-only stadium jokes are acceptable if the actual mechanical package is disclosed.

## Run services

- **League runner:** add a `LeagueSeasonState` containing eight teams and their rosters, a single mutually consistent schedule, standings, rivalry relationships and the player's guaranteed rival, cumulative statistics, pitcher workloads, fans, venue/funding states, active decree, chapter and nine-game checkpoint indices, separate cap/banked-cash accounts, developed player instances, cooldowns/waivers and RNG/replay state.
- **Checkpoint API:** simulate to the next nine-game or chapter boundary, return a state snapshot, reveal incoming chapter rules/venues when applicable, apply validated purchases and transactions, then resume. Do not recompute all 162 games for each checkpoint.
- **Cube draft engine:** a separate pass-the-pack table state with the eight seats, unique card ownership, two-way pack passing, cap-aware legality, bot picks, and an auditable event log.
- **Mode versioning:** identify the shared simulation version and each mode's ruleset/replay schema explicitly. Old versions need not remain executable; incompatible data must not be silently reinterpreted.
- **Development and transaction services:** validate purchases for all rostered cards, including reserves, using cash, applicable skills and per-visit limits; apply current-skill diminishing returns, funding records, fixed starting salary/original tier, persistent upgrades, waiver ownership and unchanged protection deadlines.
- **Opening recovery:** generate finite common-only cleanup packs with role/affordability coverage and exclusive ownership, integrated with post-draft trades/cuts before legal submission.


Classic continues to use its fixed-opponent data path. Draft constructs opponents from the seven other cube rosters rather than the fixed opponent compiler. Integration candidates from the source design include `src/lib/sim/season.ts`, `game.ts`, `inning.ts`, `contact-profile.ts`, `contact.ts`, `fielding.ts`, `flight.ts`, `park.ts`, `workload.ts`, `win-expectancy.ts`, `src/lib/game/draft.ts`, `session.svelte.ts`, and replay serialization; confirm current locations before implementation.

## Replayability, collecting, and sharing

Every run is seeded, including cube construction, cleanup stock/pack ordering, table seating, guaranteed rival selection, bot tie-breaks, scheduling, decrees, venue/funding selections, shop/acquisition offers and game randomness. Maintain separate random streams or independently seeded games so one added rule check does not reroll the remaining season. Store draft/passing/cleanup, itemized segment income, purchases, upgrades, trades, releases, waiver claims, protection deadlines, venues and Commissioner chronology with exact model/data versions; a seed alone cannot reconstruct player-dependent choices.

The permanent **binder** records discovered player-seasons, favorite finishes, notable performances, and completed roster snapshots. It is cosmetic and historical: previously collected cards do **not** enter a new cube or confer permanent simulated strength. Players can share a final roster, franchise, active decrees, standings, dramatic moments, and a replay seed/action log. A later **daily challenge** may publish one fixed cube and ruleset for everyone, with unlimited practice elsewhere and no attendance pressure. Do not claim tamper-resistant leaderboards without validation infrastructure.

Card imagery continues to respect the current verified-year and licensing pipeline. Missing photos receive designed fallbacks; the game must never invent an athlete likeness or imply image-reuse permission it does not have.

## Persistence sequencing

Proposed phase requirement: define the authoritative action/state contract with the first interactive draft and make it resumable before calling that flow playable. Extend it as shops and transactions land; do not defer the entire persistence contract until season evolution. This is current-version resume and determinism, not backward compatibility. Follow the [project policy](../../PRODUCT.md#release-and-compatibility-policy).
