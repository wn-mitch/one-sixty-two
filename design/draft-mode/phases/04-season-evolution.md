# D04 — Season evolution, economy, and transactions

**Status: PROPOSED**  
**Purpose:** Add the bounded between-games decisions that make a completed D03 league evolve: nine-game payday and purchases, chapter reveals, development, fans, and legal chapter transactions.

D04 is a season-adaptation milestone layered on the already playable full draft-to-season loop. It must preserve D03's one schedule, one league ledger, shared simulation, and resumable state rather than building a second season runner.

## Dependencies

- [League-playable draft-to-season](./03-league-playable.md) is a hard dependency for the 648-game ledger, chapter boundaries, selected initial packages/decree, report, replay, and state contract.
- [Draft and rosters](../draft-and-rosters.md) owns draft, roster, salary and opening stock rules; [season and economy](../season-and-economy.md) owns payday, cash, development, chapter, fan and transaction semantics.
- [Architecture](../architecture.md) and [validation](../validation.md) own versioned state, replay, atomic mutation, and evidence contracts.
- [Shared Classic integration](../../simulation/phases/03-classic-integration.md) remains the simulation prerequisite. [Rule extensions](../../simulation/phases/04-rule-extensions.md) is referenced only for a chosen decree or rule effect that needs it; it is not a blanket D04 dependency.
- [Open decisions](../open-decisions.md) tracks economy, fan, development, market, and optional-branch decisions that this phase must not silently settle.

## Usable result

After every completed nine-game segment, the player receives a visible payday before purchases and can make a bounded development/lineup decision. At each 27-game chapter boundary, the player receives the incoming decree and venue/package information before spending or roster decisions, then can use the legal chapter transaction/acquisition surface. The player can save and resume throughout these checkpoints and complete the full 162-game run with an auditable economic and roster history.

The result includes six chapters of 27 games and eighteen nine-game segments. Chapter boundaries coincide with the relevant nine-game boundaries; they do not create a second hidden checkpoint rule.

## In scope

### Paydays, cap, and cash

- Credit each completed nine-game segment before purchases: minimum guaranteed income, attendance/ticket revenue, and a performance bonus based only on wins in that segment.
- Apply Royal Flush's earned home-win development-cash reward and preserve other selected franchise payout triggers without creating a merchandise-management system.
- Maintain separate payroll allowance/cap and spendable banked development cash. Cash carries through the run and does not automatically expand payroll allowance; salaries remain the roster cost.
- Apply a gentle, disclosed cap progression and franchise constraints while preserving a legal-roster policy. Budget expiry/deductions require explicit legality handling and cannot invalidate the opening-roster guarantee without a defined recovery path.
- Keep payday components, cap, cash, and rewards visible in reports and replay state.

### Development and checkpoint decisions

- Offer reliable basic hitting, pitching, fielding and baserunning training at each shop alongside rotating specials. Special-offer pool, count and effects remain decisions to resolve before accepting the shop, not permission to omit specials.
- Basic prices are fixed by training family for every recipient before declared franchise modifiers; gains diminish with the current trained skill/headroom, not whole-card rarity or purchase count alone.
- Permit any rostered player, including an unused reserve, to receive applicable paid training without a playing-time gate. Enforce one purchase per player per shop visit across basics and specials.
- Preserve original tier, starting salary, purchased upgrades, source/provenance, per-visit purchase history, and franchise-funded records. Upgrades persist through trades and waiver ownership changes; no salary repricing is implied.
- At nine-game checkpoints allow batting-order, rotation, and active/reserve changes among already rostered cards. Do not make chapter trading/acquisition available at every nine-game visit.
- At chapter checkpoints reveal the incoming decree and any new venue before spending or roster decisions. The future decree calendar remains hidden unless a separately approved information rule says otherwise.

### Fans, attendance, and visible pressure

- Add baseline attendance, expectations, ordinary sentiment, and bounded home/visitor crowd effects to the D03 environment input.
- Expectations respond to roster strength and performance relative to expectations, not raw winning percentage alone; packed crowds may create bounded directional bias and separately bounded variance.
- Implement the selected initial fan package slice, with event-driven updates affecting subsequent play rather than retroactively changing the triggering event. Preserve special-hype reset rules where selected; ordinary sentiment persists between games.
- Use attendance in the payday ticket component and show enough explanation for a player to distinguish expectations, attendance, directional bias, and volatility. Do not let hidden fan effects overwhelm card/simulation differences.
- Keep unselected franchise fan premises in the catalog rather than making all fan branches a D04 blocker.

### Chapter transactions and supplemental acquisition

- Allow chapter-boundary trades of eligible players, supplemental acquisition from the remaining unowned player pool, releases, and waiver claims under the defined market ordering.
- Enforce the two-chapter per-player trade cooldown. A deadline survives release and waiver claims with its original deadline; ownership changes do not clear/restart it.
- Preserve unique ownership, cap/role legality, atomic mutations, and upgrade/provenance transfer through trades, releases, claims, and acquisitions.
- Implement a bounded, explainable market policy for the human club and deterministic public-information responses for AI clubs. AI-to-AI negotiation may remain a candidate if not needed for the first D04 market slice; do not silently claim it is complete.
- Keep the small composite team-season bullpen and two-reserve structure; do not turn chapter acquisition into a lengthy reliever microdraft.

### Save/resume and reporting

- Extend the D02/D03 state contract with segment income lines, cash/cap revisions, purchases, upgrade deltas, fan/attendance transitions, decree/venue chronology, transactions, waiver deadlines, and RNG/replay streams.
- Resume before/after payday, before/after a purchase, at lineup changes, at chapter reveal, and during chapter transaction decisions without recomputing completed games or double-crediting income.
- Report per-segment and per-chapter economic and roster changes alongside standings and simulation results.

## Observable acceptance gates

1. **Payday accounting:** every completed nine-game segment credits the minimum, attendance/tickets, and wins-only bonus exactly once before purchases; Royal Flush home-win rewards follow its declared trigger; cash and cap remain separate.
2. **Development proof:** basic prices match across recipients before franchise modifiers; current-skill diminishing returns are observable; a reserve can be trained without playing; one player cannot buy twice in one visit; paid upgrades persist through a legal transfer.
3. **Chapter timing:** incoming decree and venue/package are revealed before chapter spending and roster decisions; nine-game lineup changes are allowed; chapter trades/acquisitions are not accidentally available at every segment.
4. **Fan proof:** controlled scenarios demonstrate expectation-relative sentiment, attendance revenue, directional home/visitor contribution, and separate bounded volatility; event hype affects subsequent play and reset/persistence rules match the selected package.
5. **Transaction proof:** chapter trades, cuts, waivers, and acquisitions preserve unique ownership, role/cap legality, cooldown deadlines, upgrade provenance, and atomic rejection behavior.
6. **Full-run proof:** the D03 648-game schedule remains one shared ledger while all six chapters and eighteen segments can be completed with state/replay evidence.
7. **Resume proof:** interruption at each payday/shop/chapter/transaction boundary resumes without duplicate payout, purchase, decree reveal, or transaction.
8. **Balance/legibility proof:** a player can choose to spend or bank cash for a disclosed reason; franchises gain meaningful differences without an unconditional package winning every seed.
9. **Performance proof:** checkpoint mutations and fan/economy resolution do not rebuild full-season state or create avoidable hot-loop allocations.

## Required open decisions before D04 acceptance

- Exact income floor, ticket/attendance formula, per-win bonus, Royal Flush reward bounds, cap ramp, deduction timing, and final-segment presentation.
- Basic training gains, ceilings, diminishing-return curves, special-offer pool/counts, price modifiers, and whether same-checkpoint purchases have a fixed cross-player ordering.
- Fan expectation refresh after drafting/training/trades, attendance saturation, hype persistence, volatility/bias bounds, and selected event-trigger semantics.
- Chapter market format, supplemental pack/offer size, trade limits, multi-player offer handling, release windows, waiver priority/timing, AI market policy, and whether AI-to-AI negotiation remains deferred.
- Angels relocation pool/selection/repetition and attachment reset details if that package is selected; Washington, Houston, Minnesota, Milwaukee, Pittsburgh, and Detroit branch details remain content decisions unless selected.
- Whether decree accumulation remains optional and, if tested, what explicit player-facing rule controls it. It must not become an undocumented D04 default.

## Deferred requirements

- Full 30-franchise package activation and all selected twenty-decree semantics are D05/content work; each unusual rule still requires the relevant simulation prerequisite.
- Richer AI-to-AI trade negotiation is a candidate, not an implied D04 guarantee. Dynamic Lineup remains an optional expert variant.
- Binder permanence, final sharing, daily challenge candidates, and daily candidate publishing are D05 or later. Sharing is not required to prove save/resume.
- The Great Wall remains deferred. Weather generation remains later and is not needed for chapter venue changes.

## Evidence carried forward

D04 publishes an auditable checkpoint ledger and state/replay schema extension. D05 consumes the same economy, development, fan, and transaction contracts while widening content and metagame surfaces; no later catalog feature may fork these systems or alter D03 schedule consistency.
