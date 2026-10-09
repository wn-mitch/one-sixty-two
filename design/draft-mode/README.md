# Draft Mode

Status: design requirements consolidated through Q59. Not an implementation claim. Mechanics marked proposed or open remain unsettled; implementation phase boundaries are proposals.

The first playable milestone is draft-first, after the shared simulation is proven in Classic. Season adaptation follows. Later-phase requirements remain in scope, not silently discarded.

## Read by responsibility

| Document | Authoritative responsibility |
| --- | --- |
| [Draft and rosters](draft-and-rosters.md) | Franchise selection, cube, salary valuation, legal opening rosters, AI picks |
| [Season and economy](season-and-economy.md) | League calendar, checkpoints, transactions, cash, development, general fan model |
| [Catalog](catalog.md) | All franchise premises, park traits, decrees, rivalry effects, excluded directions |
| [Architecture](architecture.md) | Draft state, modifier lifecycle, orchestration, replay, collecting and sharing |
| [Validation](validation.md) | End-to-end invariants, balance and behavioral evidence |
| [Open decisions](open-decisions.md) | Unresolved design branches and their implementation gates |
| [Shared simulation](../simulation/README.md) | Contact, flight, fielding, ordinary stadiums, Classic integration |

## Proposed implementation phases

1. [Pool, prices and roster feasibility](phases/01-pool-and-rosters.md)
2. [Draft table and opening recovery](phases/02-draft-table.md)
3. [Coherent league and draft-first playable](phases/03-league-playable.md)
4. [Season evolution](phases/04-season-evolution.md)
5. [Catalog completion and metagame](phases/05-catalog-and-metagame.md)

Phases specify dependencies, usable behavior, required decisions, evidence, and deferred work. They reference rules rather than supersede them. A small playable slice is not the completed mode.

## High concept

An eight-team, single-player baseball roguelike built around a genuine **shared-pool, pass-the-pack cube draft**. The player chooses a franchise, drafts historical MLB player-seasons alongside seven AI general managers, builds a salary-constrained roster, and attempts a 162-game season against the *other seven drafted teams*. Franchises come from a complete MLB stadium catalog with physical conditions, financial trade-offs, and fan expectations. During the season, an increasingly deranged Commissioner's Office imposes temporary rule changes that force teams to adapt. **Mad Fred meddling** is the working label for this system; the commissioner's final identity remains open.

The appeal is not merely assembling the highest-rated all-time roster. It is adapting to a finite player pool, other drafters' choices, a stadium's incentives, the league schedule, and shifting rules of baseball. Good runs create dynasties; bad decisions and hostile circumstances can create catastrophic spirals. Both are legitimate outcomes if the player still has meaningful decisions to make.

The tone is a deliberately ridiculous baseball roguelike. Mad Fred can change fundamental rules of baseball. Development and transactions should support that game rather than turn a season into a detailed management simulation.

**Player fantasy:** “I drafted a ridiculous baseball team in an even more ridiculous league, and here is the season that happened.”

## Design pillars

1. **A real cube, not eight independent random teams.** All eight drafters receive packs from one finite cube. A historical player-season taken by one GM cannot be taken by another in that run.
2. **Context determines card value.** Position, simulated contribution, cap cost, home stadium, fanbase, known decrees, and remaining roster needs matter more than a single overall rating.
3. **The league plays by its own absurd rules.** Ballpark conditions affect everyone visiting; Commissioner decrees apply to all teams; fans can help, hurt, or destabilize the home club.
4. **Emergent stories outrank perfect balance.** Franchises should be roughly competitive over many seeded runs, not identically powerful. Streaks, win-more builds, and lose-more spirals are allowed.
5. **No predatory collection mechanics.** Random packs are fun because they create decisions. There are no paid packs, timegated attempts, stamina, login streaks, or purchases that alter gameplay.
6. **Keep the baseball simulation legible.** Prefer a few calibrated, visible levers to an encyclopedic but untestable physics or chemistry model.

## Relationship to Classic

Classic retains its franchise-and-decade rolls, fourteen permanent selections, no-salary roster and fixed-opponent season structure. Both modes use the [shared simulation](../simulation/model.md), with explicit mode-specific environments and rules. Draft has its own ownership, league, finances and run state. Classic's stadium card is a venue choice, not a Draft franchise package.

[Project compatibility policy](../../PRODUCT.md#release-and-compatibility-policy) permits breaking pre-release saves, replay links, schemas and seeded results. No legacy engine or migrations are required unless explicitly requested. Determinism is required within the supported model/data version.

## North-star test

Two people draft at the same eight-seat table under the same commissioner and stadium rules, make different defensible picks, and finish with different baseball stories. Neither story should feel predetermined by which player opened the shiniest card.
