# D05 — Catalog expansion and metagame

**Status: PROPOSED**  
**Purpose:** Expand the proven D03/D04 loop across the retained franchise and Commissioner catalogs, then add the cosmetic binder and sharing without changing run power or forking core rules. Daily challenges and other explicitly optional branches remain candidates.

D05 is a content-and-market phase, not permission to make every candidate mechanic default. Each package/decree enters only after its own contract, simulation prerequisite, calibration evidence, and player-facing explanation are complete.

## Dependencies

- [Season evolution, economy, and transactions](./04-season-evolution.md) must provide the stable six-chapter/eighteen-segment state, development, fans, chapter market, cooldown, waiver, save/resume, and replay contracts.
- [League-playable draft-to-season](./03-league-playable.md) provides the one 648-game schedule and shared simulation ledger.
- [Catalog](../catalog.md) is authoritative for all thirty franchise packages and the twenty selected decree candidates; [draft and rosters](../draft-and-rosters.md), [season and economy](../season-and-economy.md), [architecture](../architecture.md), and [validation](../validation.md) remain authoritative for their systems.
- [Shared Classic integration](../../simulation/phases/03-classic-integration.md) remains the shared simulation baseline. Consult [rule extensions](../../simulation/phases/04-rule-extensions.md) only when a selected catalog item requires pitch/count, checked-swing, batting-position, altered-out, route, force-chain, bunt, scoring, or other unusual-rule support.
- [Open decisions](../open-decisions.md) records catalog activation, prerequisite, market, and optional metagame decisions; catalog completeness does not close them automatically.

## Usable result

A supported build activates the remaining franchise packages and selected decrees over the playable loop, with clear availability/versioning and no duplicate rule definitions. Players can use the completed supported catalog, retain cosmetic/historical run artifacts in the binder, and share a final report. Incremental delivery is permitted; an inventory of unimplemented entries is not completion.

The phase has two independently shippable tracks:

1. **Catalog track:** complete the remaining 30-franchise and 20-decree support as content contracts and validated packages, without requiring every package to block the core build at once.
2. **Metagame track:** add cosmetic binder/history and final sharing. A daily-challenge pipeline remains optional and needs its own product/infrastructure decisions. No metagame surface injects previously collected cards or permanent simulated power into a new cube.

## In scope

### Full franchise package support

- Implement the remaining package behaviors in the catalog while preserving the accepted distinction among physical park effects (symmetric), franchise-owned economics/strategy, and fan behavior.
- Ordinary venue bases use the reference configurations; declared Draft exaggerations and relocation venues are explicit separate configurations. Do not introduce hitter-season historical variants or a second engine.
- Validate package effects against the actual simulation inputs they claim to change. A package may be flavor-only when that is explicitly disclosed, but it may not display a fake unexplained rating buff.
- Preserve specific accepted directions when activated: park geometry and directional wind/roof interactions, Atlanta cap/crowd trade-off, Orioles ceiling, Royals home-win cash, Athletics purchase discount, Pittsburgh sale bonus, Detroit purchased-training efficiency, Houston disclosed information/adaptation, Cardinals/Rangers training effects, Toronto price/attendance trade-off, Angels relocation, and the selected fan/rivalry packages.
- Keep weather generation later. Fixed reference park conditions and explicit wind/air inputs remain sufficient for catalog completion unless a future package explicitly requires another approved prerequisite.

### Commissioner decree catalog

- Add support for the twenty selected decree candidates as individually versioned, inspectable packages, including the two batter's-box candidates. Each item must state its timing, duration, affected rules/effects, display explanation, calibration evidence, and required simulation prerequisite.
- Ensure a selected decree updates every dependent consumer together: game length/ending, outs, pitcher workload, win expectancy, advancement, force chains, scoring, and reports as applicable. A decree cannot be a name over a disconnected multiplier.
- Preserve the opening-decree-before-draft contract and chapter reveal timing. The full future calendar remains hidden unless an explicit information decision later changes it.
- Decree accumulation remains optional and outside default behavior. If explored, it requires a separate player-facing rule and isolated balance/evidence gate; it is not silently enabled by catalog completion.
- Keep The Great Wall outside the selected twenty and deferred. Boston's permanent tall-wall package remains separate.

### Richer markets and AI behavior

- Expand the D04 chapter market where playtests demonstrate useful choices: richer public offer/bargaining information, multi-player trades, visible leverage, and bounded AI responses using the same ownership, salary, cooldown, waiver, and upgrade-provenance rules.
- AI-to-AI negotiation is a candidate/optional extension, not a newly approved requirement. If shipped, it must use public information, deterministic seeded policy, atomic legality, and explainable decisions; it must not secretly optimize through hidden future knowledge.
- Preserve transaction deadlines through release and waiver claims, and preserve developed upgrades/provenance through transfer. No market expansion may turn the finite cube into duplicate ownership or a paid collection system.
- Keep Dynamic Lineup an optional expert variant. If experimented with, isolate its control, substitution semantics, season involvement, and AI policy; it must not become a hidden default or a D05 catalog prerequisite.

### Binder, sharing, and daily candidates

- Add a cosmetic/historical binder for discovered player-seasons, finishes, notable performances, and completed roster snapshots. Previously collected cards do not enter a future cube and confer no permanent simulated strength.
- Add final sharing of a roster, franchise, active decrees, standings, dramatic moments, and replay seed/action log, subject to the existing image/licensing pipeline and explicit version/data provenance. Infrastructure questions must be resolved before accepting this track; save/resume remains independently required in earlier phases.
- A daily challenge is a candidate feature: if pursued, publish one fixed cube/ruleset with unlimited practice elsewhere and no attendance pressure. Do not claim tamper-resistant leaderboards without validation infrastructure. A daily candidate must not become a hidden required mode or alter normal-run balance.
- Preserve designed fallbacks for missing card imagery; never invent likenesses or imply image-reuse permission.

## Observable acceptance gates

1. **Catalog completeness:** all 30 franchise packages and all 20 selected decree entries have defined semantics, supported prerequisites, versioned IDs, disclosures and passing behavioral evidence. During incremental work, unimplemented entries remain visible in the design inventory; that inventory alone does not satisfy completion.
2. **Package isolation:** each activated package changes only its declared shared input/effect family, is symmetric where physical, and passes direction/calibration tests without unconditional franchise dominance.
3. **Rule consistency:** each activated decree updates all dependent game, workload, expectancy, scoring, advancement, force-chain, and reporting consumers required by its contract; unsupported prerequisites block activation explicitly.
4. **Catalog replay:** a seeded run with an activated package/decree set reproduces its versioned selection, schedule, transaction/economy history, game results, and report. Existing runs reject incompatible content versions rather than reinterpret them.
5. **Market integrity:** richer human/AI market operations preserve unique ownership, cap/role legality, cooldown deadlines, upgrade provenance, and atomic rollback; any AI-to-AI behavior remains public, deterministic, and clearly marked optional.
6. **Binder integrity:** binder entries are cosmetic/historical and cannot change future cube construction, prices, simulation values, or legal roster state. A new run proves this by comparing with/without prior binder history.
7. **Sharing integrity:** a player can publish and inspect the intended shared artifacts, which identify model/data/ruleset versions and use only licensed or designed-fallback imagery. Unavailable infrastructure is an explicit blocker, not an optional substitute for the sharing requirement.
8. **Daily-candidate integrity:** an optional daily fixture reuses a pinned cube/ruleset and supports unlimited practice without attendance pressure; no leaderboard tamper-resistance is claimed absent validation infrastructure.
9. **Performance and scope:** catalog selection and market/binder metadata do not introduce duplicated engines, hidden full-season recomputation, or unnecessary hot-loop allocations.

## Required open decisions

- Which of the 30 packages and 20 decree candidates are activated in each content release, in what order, and what calibration/evidence threshold is sufficient for activation.
- Exact semantics and prerequisite mapping for all selected pitch/count, checked-swing, batting-position, unusual-out, route, force-chain, bunt, scoring, and altered-inning decrees.
- Rich market policy: offer formats/limits, information visibility, AI-to-AI status, waiver ordering, and how much negotiation complexity is justified by playtests.
- Whether decree accumulation is tested at all, its explicit player-facing control, and its balance/reporting implications; default remains off unless separately approved.
- Whether and when Dynamic Lineup is tested, with its interaction limits and AI policy.
- Binder scope, retention/reset rules, share artifact format, image fallback policy, daily fixture cadence, practice/leaderboard policy, and infrastructure ownership.
- Resolve distribution, privacy, licensing and validation prerequisites before accepting final sharing. Moving required sharing outside this phase requires an explicit plan revision, not silently reclassifying it as optional.

## Deferred requirements

- The Great Wall is deferred outside the selected twenty-decree catalog; it is not a D05 acceptance item.
- Weather generation is later and is not required to complete the catalog.
- AI-to-AI negotiation, decree accumulation, Dynamic Lineup and daily challenges remain candidate/optional branches until their open decisions and evidence gates close. Binder and sharing are retained requirements.
- No paid packs, time-gated attempts, stamina, login streaks, or permanent collection bonuses are introduced.

## Evidence carried forward

D05 publishes catalog manifests, per-content evidence, and metagame/version contracts. It must preserve D03's single schedule and D04's economy/transaction state. Future content can be added behind the same manifest/prerequisite gates without reopening the core draft, salary, cleanup, or season contracts.
