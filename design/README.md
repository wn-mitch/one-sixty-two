# Game design

Status: decisions consolidated through Q59. These documents specify intended behavior, not completed implementation. The phase breakdown is a proposed implementation plan; unresolved mechanics and numerical values remain explicit gates.

## Start here

- [Shared simulation](simulation/README.md): contact profiles, flight, fielding, ordinary ballparks and Classic adoption.
- [Draft Mode](draft-mode/README.md): shared cube, rosters, eight-team league, economy, development, franchise/decree catalog and metagame.
- [Product policy](../PRODUCT.md): pre-release compatibility and product constraints.
- [Interface design](../DESIGN.md): existing visual and interaction conventions, not a second gameplay specification.

System documents are authoritative for rules. Phase documents reference those rules and define usable results, dependencies, decisions needed before implementation, acceptance evidence and explicit deferrals. Later-phase requirements are not abandoned requirements. Retired premises remain identified in the catalog so they are not accidentally revived.

## Proposed delivery order

| Phase | Usable result | Dependency |
| --- | --- | --- |
| [S01: Contact profiles](simulation/phases/01-contact-profiles.md) | Reproducible, provenance-labelled batter/pitcher contact inputs and calibration targets | Resolve inference and matchup contracts |
| [S02: Flight and fielding](simulation/phases/02-flight-and-fielding.md) | Contact resolves through physical environment and time-based fielding | S01 |
| [S03: Classic integration](simulation/phases/03-classic-integration.md) | Select a stadium card and complete a calibrated Classic season on the new engine | S02 |
| [D01: Pool and rosters](draft-mode/phases/01-pool-and-rosters.md) | Finite unique pool, prices and demonstrated legal-roster recovery | Shared simulation/valuation established |
| [D02: Draft table](draft-mode/phases/02-draft-table.md) | Human and AI draft with complete opening recovery | D01 |
| [D03: Draft-first playable](draft-mode/phases/03-league-playable.md) | Full draft-to-results coherent league | D02 and S03; any selected rule support |
| [D04: Season evolution](draft-mode/phases/04-season-evolution.md) | Paydays, development, chapter changes and transactions affect later play | D03 and supported selected content |
| [D05: Catalog and metagame](draft-mode/phases/05-catalog-and-metagame.md) | Remaining packages/decrees and accepted metagame work | Relevant D04 systems and simulation capabilities |
| [S04: Rule extensions](simulation/phases/04-rule-extensions.md) | Coherent pitch/count and unusual baseball-rule support | S03; implement each subset before its dependent content |
| [S05: Weather](simulation/phases/05-weather.md) | Later variable weather on the shared environment model | S03 and an explicit weather design |

S04 is not a requirement to complete every decree before D03. A selected opening decree needs its own supported semantics. S05 does not block the initial Classic or Draft playable. A numbered phase is a dependency/evidence boundary, not a release commitment or effort estimate.

## Settled decisions through Q59

| Decision | Authoritative home |
| --- | --- |
| Q51: System-owned designs plus linked implementation phases | This index and each system index |
| Q52: Shared simulation first, then draft-first, then season adaptation | [Simulation](simulation/README.md), [Draft phases](draft-mode/README.md) |
| Q53: Break pre-release compatibility; no legacy maintenance unless requested | [Product policy](../PRODUCT.md#release-and-compatibility-policy) |
| Q54: Contact/flight/fielding first; pitch/count and unusual rules later | [Simulation model](simulation/model.md) |
| Q55: Real parks in Classic; neutral calibration before applying the venue once | [Ballparks](simulation/ballparks.md) |
| Q56: Positional probabilistic interception, not continuous fielder movement | [Simulation model](simulation/model.md) |
| Q57: Choose home park before first roll; fixed reference configuration per franchise, opponents' venues away | [Ballparks](simulation/ballparks.md) |
| Q58: Fixed conditions initially; weather later | [Ballparks](simulation/ballparks.md), [weather phase](simulation/phases/05-weather.md) |
| Q59: Choose from the whole stadium-card deck, not a random hand | [Ballparks](simulation/ballparks.md) |

Stadium cards do not consume player slots or give extra bonuses on top of their physical properties. Detailed card artwork and comparison layout are not approved by this scaffold.

## Readiness and next implementation preparation

Begin with [S01](simulation/phases/01-contact-profiles.md): inventory available evidence, define inferred-profile and matchup contracts, and set calibration criteria before treating any inferred values as ready. Physics equations, distribution fitting, defender reach curves and numeric tolerances are still decisions, not secretly chosen defaults.

The [Draft open-decision register](draft-mode/open-decisions.md) assigns downstream questions to their owning systems and earliest dependent phases. Do not require answers to the entire catalog before working on the shared simulation.

## Source coverage

The former root Draft specification is replaced, not retained as a second source of truth.

| Former subject | Current owner |
| --- | --- |
| Concept, mode relationship, pillars | [Draft index](draft-mode/README.md), [simulation index](simulation/README.md) |
| Franchise selection, cube, salary and AI | [Draft and rosters](draft-mode/draft-and-rosters.md) |
| Schedule, checkpoints, income, training, general fans | [Season and economy](draft-mode/season-and-economy.md) |
| Full franchise/decree premises, rivalries and superseded ideas | [Catalog](draft-mode/catalog.md) |
| Modifier definitions, run instances, orchestration, replay, binder and sharing | [Architecture](draft-mode/architecture.md) |
| Shared contact/flight and environment execution | [Simulation model](simulation/model.md), [ballparks](simulation/ballparks.md) |
| Delivery stages | Both phase tracks above |
| Tests and balance | [Simulation validation](simulation/validation.md), [Draft validation](draft-mode/validation.md) |
| Open mechanics and continuation context | [Open decisions](draft-mode/open-decisions.md), this decision index |
