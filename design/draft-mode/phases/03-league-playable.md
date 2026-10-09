# D03 — League-playable draft-to-season

**Status: PROPOSED**  
**Purpose:** Connect the real D02 table to the first complete, mutually consistent eight-team season: one schedule, one league ledger, opening package/decree effects, and an inspectable full run from first pick through game 162.

D03 is the first full draft-to-season playable milestone. It is intentionally a narrow content slice over a complete league loop. Later economy, fan, transaction, and catalog systems must not be made D03 blockers merely because the data model retains them.

## Dependencies

- [Draft table and opening roster](./02-draft-table.md) and [pool, salary, and roster feasibility](./01-pool-and-rosters.md) provide the interactive draft, opening trades/cuts/waivers/cleanup, legal rosters, save/resume, and unique ownership.
- [Shared Classic integration](../../simulation/phases/03-classic-integration.md) is a hard prerequisite. D03 uses one shared simulation engine for Classic and Draft and must carry forward its neutral calibration, ball-flight, fence/directional-wind/roof-collision evidence, fielding, and deterministic versioning.
- [Rule extensions](../../simulation/phases/04-rule-extensions.md) is referenced only if the selected opening decree needs a pitch/count, checked-swing, batting-position, altered-outs, route, or other unusual-rule extension. D03 must not make the entire later rule catalog a prerequisite.
- [Draft and rosters](../draft-and-rosters.md), [season and economy](../season-and-economy.md), [catalog](../catalog.md), [architecture](../architecture.md), and [validation](../validation.md) are authoritative system documents.
- [Open decisions](../open-decisions.md) records schedule, content-selection, and report questions that remain proposed rather than silently resolved here.

## Usable result

A player can complete the D02 draft and opening recovery flow, then run a complete seeded season against the other seven drafted teams and receive one coherent final league report. The season runner owns eight teams and one calendar, not eight independently simulated personal schedules.

The first playable result includes:

- a shared 648-game league schedule: each club plays 162 games, 81 home and 81 away, with every scheduled game appearing once for both opponents;
- the proposed 23-games-per-rival construction plus one extra game against the designated matching rival, subject to the schedule contract and its accepted balancing proof;
- four games per matchday, with auditable seeded ordering and independent randomness streams where needed;
- standings, wins/losses, game results, cumulative player/team statistics, and reportable chapter/checkpoint indices;
- the D02 opening decree and selected initial franchise/park packages applied through explicit shared simulation inputs;
- fixed reference park conditions and explicit wind/air/geometry inputs where required, without weather generation;
- a full run from opening decree and opening transactions through game 162, with no requirement for the later season shop/evolution loop.

The schedule and ledger must remain coherent even when the player is eliminated from a perfect-season objective. Completion is a report, not an implicit extra shop or decree.

## In scope

### One league, one schedule, one simulation

- Construct `LeagueSeasonState` for eight drafted rosters, selected franchises, guaranteed rival relationship, schedule, standings, cumulative stats, workloads, active decree, venue/package inputs, chapter index, checkpoint index, and pinned RNG/replay versions.
- Generate the full league calendar before play or use a contract-equivalent schedule state that can prove all pairings before simulation. Every game has one home team, one away team, one result, and one shared game identity.
- Simulate all 648 games exactly once. Both clubs observe the same result and update shared standings/stats/workload state.
- Preserve the six 27-game chapter boundaries as reporting partitions. The proposed intermediate D03 proof holds the selected opening decree and reference venue/package fixed while D04 implements chapter evolution. This is an explicitly incomplete season-adaptation slice, not a change to the canonical 27-game decree lifetime or relocation rules.
- Use the shared model's ball-flight stage so estimated exit velocity/launch angle/spray are explicitly labeled estimates, and flight determines outcomes rather than decorating selected hits. Initial physics must distinguish ordinary fences, directional wind, and roof collisions when selected by the package. Ground-ball travel/interception and positional fielding use the shared prerequisite; do not introduce continuous moving-agent/pathfinding fielders.

### Opening content and boundaries

- Carry D02's opening decree disclosure and opening franchise/park information into the league state and report them in the run log.
- Carry D02's opening trading/cuts/waivers/common-cleanup window into the end-to-end path; D03 cannot silently reduce the milestone to "draft, then press simulate."
- Choose a small initial package/decree set through a documented content-selection gate. The selection remains unresolved until evidence shows its chosen effects are implementable, legible, calibrated, and sufficiently distinct. Unselected content remains retained in the full catalog for expansion.
- Draft selects a home franchise and its supported package before drafting; the active venue is the game's home park and consumes no player slot. Classic's whole stadium-card deck is a separate selection contract, not permission to detach a Draft franchise from its park or expose unsupported packages as playable.
- Keep Classic free of Draft salary, packs, perks, decree, and league-economy behavior. Classic and Draft call the same shared simulation with mode-specific rules and environments.
- Keep initial reference conditions fixed and auditable. Explicit wind/air inputs are allowed; generated weather is later and is not a dependency.

### Reporting and replay

- Persist enough state to resume at the first interactive draft and at season boundaries/checkpoint snapshots, including the action log, selected packages/decree, schedule, game results, versions, and RNG streams. The state contract originates in D02 and D03 proves it survives the whole run.
- Produce standings and results that can be independently checked against the schedule, including home/away counts and opponent-game counts.
- Expose enough event/run data to compare two defensible human drafts on the same seed and show different legal teams and season stories.
- Measure the 648-game computation on ordinary phones; avoid rebuilding matchup tables or allocating avoidable objects in hot loops.

## Observable acceptance gates

1. **Schedule identity:** a schedule audit proves 648 unique games, 162 appearances per club, 81 home/81 away, complete pairings, and one shared identity/result per game.
2. **Calendar consistency:** standings and cumulative statistics equal the game ledger; no club's personal view diverges from the opponent's view; all four games on each matchday are represented as configured.
3. **Full-run proof:** an ordinary seeded run completes from D02 opening state through game 162 with no hidden manual substitutions, scripted wins, or disconnected opponent seasons.
4. **Simulation proof:** selected packages affect explicit shared inputs and isolated tests show intended observed direction. Venue tests retain distinct fence geometry, directional wind, and roof-collision behavior; flight/fielding determine contact outcomes.
5. **Content gate:** the initial package/decree selection is documented as a proposed slice, with evidence for calibration, player legibility, and runtime. It is not treated as approval of the entire 30-franchise/20-decree catalog.
6. **Replay/save proof:** pinned versions plus the persisted action log reproduce the draft, opening transactions, schedule, games, standings, and report. A seed alone is not claimed to reconstruct player choices.
7. **Classic isolation:** a Classic run demonstrates no Draft salary, franchise perk, opening decree, or drafted-opponent behavior leaked into its mode-specific rules.
8. **North-star proof:** on a controlled seed, two defensible human pick paths reach distinct legal rosters and measurably different season reports without either being predetermined by a cosmetic finish.
9. **Performance proof:** the complete shared league computation meets the agreed phone-class budget and does not multiply work by simulating disconnected schedules.

## Required open decisions before D03 acceptance

- Which initial package/decree slice is supported, which remains catalogued but inactive, and what evidence threshold closes the content-selection gate.
- Final schedule construction and extra-rival matching policy, round/order randomization, matchday presentation, and the amount of future schedule visible at each checkpoint.
- Which chapter reveal/decree/venue slice D04 should add first, after the fixed-content D03 proof, and what information is visible before each chapter decision.
- Exact report schema, chapter statistics, workload presentation, and final completion presentation without assuming a post-season shop.
- Which chosen decree effects require [rule extensions](../../simulation/phases/04-rule-extensions.md), and whether those prerequisites are complete before the content enters the supported slice.
- Balance targets for initial packages, cap constraints, and AI behavior when later economy/transactions are not yet active.

## Deferred requirements

- Nine-game paydays, attendance/tickets/win bonuses, shops, paid development, cap progression, banked-cash decisions, fan sentiment/event hype, and chapter venue changes are D04.
- Chapter trades/acquisitions beyond the D02 opening window, richer waiver/market behavior, and complete AI-to-AI negotiation are not D03 blockers.
- Remaining franchise packages, all 20 decree candidates, binder/sharing/daily candidates, Dynamic Lineup, and optional decree accumulation are D05 or later.
- The Great Wall remains deferred outside the selected twenty-decree catalog. Weather generation is later and not a prerequisite.

## Evidence carried forward

D03 publishes the schedule contract, full-run replay/report evidence, selected initial content slice, and retained expansion inventory. D04 consumes the same `LeagueSeasonState` and adds checkpoint/economy evolution without replacing the shared schedule or opening state. D05 consumes the same catalog/versioning contracts and may activate additional content only behind the appropriate simulation prerequisite.
