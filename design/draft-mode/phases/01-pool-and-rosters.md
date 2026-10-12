# D01 — Pool, salary, and roster feasibility

**Status: HARNESS AVAILABLE — table shape settled, salary values provisional**  
**Purpose:** Prove that the finite shared player pool, salary model, opening recovery, and roster legality can support a real eight-seat draft before any season presentation is built.

This phase is a contract-and-headless-proof phase, not a playable Draft Mode milestone. It should produce a runnable deterministic harness that exercises the real pool, pricing, cleanup, and roster validators. It must not introduce fictional replacement players or a second Classic engine.

## Current harness

`just draft-feasibility` runs the proof against the compiled pool. The code lives in `src/lib/draft/`, with the harness in `scripts/draft-feasibility*`.

**Contracts.** The versions are `draft-d01-v2` (rules), `salary-runs-v1` (the salary table in `draft-cards.json`, pinned by `dataVersion`) and `pool-v2` (ownership buckets, legality failure codes and report shape). D02 consumes these and does not define parallel validators.

**Identity and ownership.**
- A `DraftCard` is immutable per data and salary version.
- A run-owned `CardInstance` fixes its starting salary and original tier when created, and carries provenance and a trade deadline through every transfer.
- One ledger records each card's single owner: a dealt pile, unowned, released, or a seat roster. Cleanup cards stay unowned until a club takes one.
- Uniqueness is per player-season, so one pool may hold several seasons of the same athlete.
- A pool never holds a team-season bullpen together with one of its member player-seasons.

**Salary.**
- A card's salary comes from its modeled season runs above the replacement level of its best role:
  - shared-engine linear weights against a league-average opponent in the neutral park;
  - plus fielding runs at the position;
  - over the role's workload: about 706 PA for a hitter, 54 starts × the starter budget, a closer capped at 195 outs, and a 1,263-out bullpen remainder.
- Replacement is the 20th percentile per role.
- The minimum salary is 5 units and the price is 4 units per run, where one unit is $0.1M.
- Baserunning, park fit and platoon effects are not priced.
- Finish and pack tier come from WAR and never enter the price.

**Pool and draft.**
- Each of the eight seats is dealt two eight-card packs, so the opening pool is 128 cards and every club drafts 16.
- Each pack has one gold-or-gem slot, two silver-or-better slots and five common-or-better slots. Common, silver, gold and gem are the base, foil, emboss and gem finishes.
- Each slot draws a random free card at or above its floor, so upgrades come at the pool's natural rates. A table averages about 10 gems, 27 golds, 41 silvers and 50 commons.
- Roles are not balanced: a table averages about 60 hitters, 29 starters, 36 closers and 3 bullpens. Cleanup covers missing roles.
- The roster is 16 active roles (Classic's 14 plus setup relievers SU1 and SU2) and two reserves. Setup slots take any card eligible to close, and their cleanup comes from the closer stack.
- A seat cracks both packs into one 16-card pile, takes one card and passes the pile left. Sixteen picks clear the table, and every pile visits every seat twice.
- The pool grows at each 27-game chapter; that growth belongs to [D04](./04-season-evolution.md).

**Opening recovery.**
- The order is draft → cuts → common-only cleanup → submission.
- Surplus cards and overpriced cards are cut to the unowned pool and are not reoffered as cleanup.
- Cleanup cards are always commons: base finish and at most 15 units, so an all-common roster fits any legal budget.
- Each seat has its own unlimited stack per role (each position, DH, starter, closer and bullpen) in a seeded order, and sees only the top card. Taking it reveals the next. A reserve may come from any stack.
- A card that has been in the run, or whose bullpen or bullpen member is in the run, never appears on top. Seats share the universe, so two stacks can rarely show the same card; whichever club takes it first gets it.
- The legality predicate takes a `PayrollBudget` (nominal cap, franchise adjustment, obligations, ceiling) and no cash.

**Provisional evidence.**
- The default sweep (64 seeds × five placeholder pick policies) leaves every seat legal.
- Most placeholder drafts finish over the 1,500-unit cap or short of a role; recovery repairs all of them.
- Named negative fixtures fail as designed.
- Every run replays to the same fingerprint, at about 11 ms per run.
- Phone runtime is not measured.

**Prerequisites recorded for D03.**
- `validateTeam`/`validateSeason` in `src/lib/sim/validation.ts` reject duplicate `playerId`s and duplicate franchises. Draft rules must relax both before drafted rosters can be simulated, including two bullpens from one franchise, which share `bullpen:<franchise>`.
- Two-way cards are priced at their best role only.
- The engine has no setup relievers yet. The implemented D01 roster (16 active roles with SU1, SU2 and BP) is superseded by [named bullpens](../../simulation/model.md#7-pitcher-calibration-workload-and-expectancy): 18 active roles with RP1–RP5 and no bullpen card. Setup relievers are currently priced at their closer value.

## Dependencies

- [Shared Classic integration](../../simulation/phases/03-classic-integration.md) establishes the shared simulation and valuation baseline before D01 prices and fit estimates are accepted. Pure role/stock feasibility exploration may occur earlier against the same profile contracts, but is not completion of this phase.
- [Draft and rosters](../draft-and-rosters.md) is authoritative for seats, roles, reserves, ownership, salary, cleanup, and legality.
- [Architecture](../architecture.md) is authoritative for versioned run state and immutable player profiles versus run-owned instances.
- [Validation](../validation.md) defines evidence conventions and determinism requirements.
- [Season and economy](../season-and-economy.md) is consulted for cap/cash separation; season income is not a D01 dependency.
- [Open decisions](../open-decisions.md) records unresolved choices; this phase does not close them by choosing balancing numbers.

## Usable result

A command-line/headless fixture can construct a seeded finite run pool, price the selected player-seasons, allocate the proposed opening draft shape, generate common-only cleanup stock, and answer all of the following without hand-waving:

1. no historical player-season is owned twice;
2. all eight seats can reach sixteen active roles plus two reserves from finite, real cards;
3. every seat has a legal affordable submission after the defined recovery window;
4. cuts, releases, and cleanup never create duplicate ownership or fictional cards;
5. salaries remain payroll costs, while any future cash field is separate and does not silently buy cap space;
6. the same seed and pinned data/model versions reproduce the pool, prices, stock, and result;
7. failure is explicit when a deliberately impossible fixture is supplied, rather than silently relaxing legality.

The proof should expose a machine-readable contract report and a human-readable feasibility summary. It may use synthetic fixtures for adversarial tests, but a real compiled historical pool must pass the normal proof.

## In scope

### Finite pool and identity

- Define the immutable identity of a player-season card and its run-owned instance.
- Build one finite unowned run pool from real historical player-seasons; ownership is exclusive across initial cube, cleanup stock, remaining unowned stock, waivers, and rosters.
- Reserve common-only cleanup stock before drafting, with role coverage and affordability coverage for all eight seats. The reserve is finite and auditable; it is not an unlimited fallback.
- Keep cosmetic finish, modeled contribution, role eligibility, original tier, and salary as separate fields. Finish never grants a simulated bonus.

### Salary and legal-roster contracts

- Specify the nominal cap, franchise cap adjustments as inputs, fixed obligations/ceilings as distinct inputs, minimum salary policy, and the legality predicate.
- Count all sixteen active selections and both reserves against payroll allowance.
- Permit temporary over-cap draft states, then require a legal state at final submission after the opening recovery window.
- Define role coverage for nine hitters, three starters, one closer, and one team-season bullpen, plus two reserve slots. Do not add a ten-reliever micro-roster.
- Keep payroll allowance and banked development cash separate. D01 only proves the boundary; it does not implement payday or shops.
- Make price/cap data versioned and deterministic. Prices may be provisional calibration data, but the contract must not imply that historical WAR alone determines value.

### Opening recovery and cleanup feasibility

- Model the opening sequence as a finite set of operations: draft ownership, opening trades, cuts/releases, waiver claims where the D02 transaction surface permits them, common-only cleanup, then legal submission. D01 can exercise operations through a contract harness; D02 owns the interactive order and AI behavior.
- Define replacement eligibility and role/affordability coverage for cleanup cards.
- Ensure cuts free cap space without paying cash, and ensure any released card remains a unique owned object while in a waiver pool.
- Exercise under-cap, over-cap, missing-role, and surplus-card cases.
- Preserve the accepted guarantee that every club can submit an affordable legal roster, while allowing a weak roster when the draft was poor.

## Explicitly not required here

- No UI, card-table interaction, season calendar, game simulation, shops, fans, decrees, or full franchise catalog behavior.
- No automatic repricing after development, no payroll-as-cash conversion, and no fictional call-ups.
- No final cleanup pack presentation or complete trade/waiver negotiation policy; those are D02 decisions built on these contracts.
- No pitch/count, checked-swing, batting-position, or unusual-rule implementation. Those belong to later simulation prerequisites and only gate content that chooses them.

## Observable acceptance gates

1. **Pool integrity:** the agreed draft format plus reserved cleanup stock has no overlap across stock/ownership buckets. The current two-wave, eight-card proposal produces a 128-card cube; it remains a format decision, not an immutable acceptance number.
2. **Coverage proof:** property-style or exhaustive bounded-seed runs show every seat can reach all required roles and two reserves without exceeding its effective cap, using only real common cleanup cards.
3. **Negative proof:** intentionally remove a required role or affordable common from a fixture; the harness rejects it with a named coverage failure rather than inventing a player or allowing an illegal roster.
4. **Salary proof:** an over-cap draft can be recovered through permitted operations; an unrecoverable state is reported as such; cash fields never change the cap predicate.
5. **Transfer proof:** releasing a developed/protected instance preserves identity and any deadline/provenance fields in the contract representation, even though full development arrives later.
6. **Replay proof:** pinned seed, data version, salary version, and ruleset reproduce exact pool order, cleanup stock, pricing, and report.
7. **Runtime proof:** bounded headless runs complete on a representative phone-class budget without repeatedly rebuilding the full player valuation table.

D01 is complete only when the report is backed by real compiled player data and a reproducible harness, not merely type-checking or a fixture that bypasses the pool.

## Required open decisions before D01 acceptance

- Salary valuation formula, baseline cap, minimum salary, franchise obligations/ceilings, and the initial cap-feasibility margin. These are tuned by playtest feel.
- Whether the natural role mix (many closers, few bullpens) needs pack role guidance.
- Whether preseason waivers occur before or after cleanup, and the atomic ordering of trades, cuts, claims, and replacements.
- How a cleanup card's original tier and salary are displayed without turning cleanup into a superior acquisition path.
- The canonical legality error/report shape for UI, AI, replay, and later checkpoint services.

## Evidence carried forward

D01 should publish the contract version and evidence references consumed by D02. D02 must not create a parallel salary, identity, or cleanup validator. The result remains a proposed implementation phase: passing these gates does not approve numerical balance or freeze the card catalog.
