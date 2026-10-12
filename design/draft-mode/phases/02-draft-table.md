# D02 — Draft table and opening roster

**Status: PROPOSED**  
**Purpose:** Turn the D01 feasibility contracts into a genuine eight-seat pass-the-pack draft with deterministic AI, then make the opening transaction and cleanup window produce legal submitted rosters.

This is the first interactive Draft milestone. It ends at a legal eight-team opening league state; it does not yet promise the evolving six-chapter economy or the complete franchise/decree catalog.

## Dependencies

- [Pool, salary, and roster feasibility](./01-pool-and-rosters.md) supplies the finite-card, salary, cleanup, ownership, and legality contracts.
- [Draft and rosters](../draft-and-rosters.md), [season and economy](../season-and-economy.md), and [architecture](../architecture.md) are authoritative system documents.
- [Shared Classic integration](../../simulation/phases/03-classic-integration.md) must have established the common player/profile contract. D02 uses the shared simulation interface; it must not fork a Draft-only game engine.
- [Validation](../validation.md) defines deterministic replay and evidence expectations.
- [Open decisions](../open-decisions.md) is the register for unresolved draft, transaction, package, and content-selection questions.

## Usable result

A player can choose a supported home franchise and its disclosed guaranteed rival, see the opening park/package information and opening Commissioner decree, enter an eight-seat table, make real picks, and finish an opening league with eight unique legal rosters. Seven deterministic AI GMs take cards from the actual passed packs; they do not inspect unrevealed packs, duplicate cards, or silently repair illegal decisions.

The opening flow is seeded and replayable:

1. select franchise and reveal the player's guaranteed rival;
2. reveal the opening decree and the supported initial venue/package information before drafting;
3. deal each seat two eight-card packs from the finite shared pool;
4. each seat cracks both packs into one pile, takes one card and passes the pile left, for sixteen picks;
5. run the opening transaction window, including trades, cuts/releases, waiver claims, and common-only cleanup under the chosen atomic ordering;
6. validate sixteen active roles plus two reserves against the effective cap for every club;
7. persist the table and opening-league state for later D03 season play.

## In scope

### Real pass-the-pack draft

- Eight seats, one shared finite pool, exclusive card ownership, pass-left piles, auditable pick/pass events, and deterministic seat order. The player picks their franchise; the other seven clubs are drawn at random.
- The player picks at the player's seat; seven AI GMs make actual picks from the pack they receive.
- Preserve temporary over-cap drafting while requiring a legal submitted roster.
- Keep finish, tier, salary, position, workload, and estimated contribution distinct in table information.
- Use seeded personality tie-breaks and explainable scoring: role need, replacement scarcity, salary efficiency including reserves, development value, park/decree fit, and visible draft history. AI archetypes influence choices but never grant free simulation buffs.

### Opening information and transactions

- Reveal the opening decree before the first pick. Do not expose the entire future decree calendar.
- Reveal the home franchise, guaranteed rival, supported package facts, and the agreed amount of opening venue information before the first pick.
- Opening transactions include a post-draft trading window, cuts/releases, waiver claims, common-only cleanup and final legal submission. The first playable preserves opening trades and the opening decree rather than presenting a simpler draft-only demo as complete.
- Enforce exclusive ownership and the selected intermediate-state policy through trades, cuts, claims and cleanup. Opening recovery may begin over cap or missing roles; final submission must be legal for every club. Do not accidentally require an already-legal roster before allowing its repair.
- Preserve a player's existing two-chapter protection deadline through release and waiver claim; a claim cannot clear or restart it. The complete market policy remains an open decision rather than an accidental omission.
- Make the opening transaction state resumable at any interaction boundary. Save/resume is a first-interactive-draft contract, not work postponed to D04.

### Initial content slice

- Select a small, explicitly documented set of franchise packages and one opening-decree slice for the first playable table. The selection itself is an unresolved gate; D02 must not imply that unselected catalog entries are rejected.
- Initial package effects must use declared shared inputs and remain bounded/inspectable. Flavor-only packages are acceptable when clearly disclosed.
- Do not add Draft economics or perks to Classic. Classic remains its own roster/schedule mode using the shared simulation.

## Observable acceptance gates

1. **Real pack proof:** instrumented runs show every AI pick came from the received pack and every picked card is removed from future ownership; no AI receives unrevealed information.
2. **Deterministic table proof:** same seed, pinned pool/rules/data versions, and same human action log reproduce seat order, pack passing, AI picks, cleanup stock, transactions, and legal opening rosters.
3. **Choice proof:** on a controlled pack, at least two defensible player choices on the same seed lead to different legal rosters and later-visible strategic differences; a highest-tier card is not unconditionally forced.
4. **AI legality proof:** across bounded seeds and adversarial salary/role states, every AI finishes legal or reports a visible, recoverable transaction choice. No bot bypasses cap, role, ownership, or cooldown rules.
5. **Opening recovery proof:** each club can use reserved real commons to repair missing roles/affordability without duplicated cards or fictional call-ups. Cleanup is a repair path, not an infinite premium draft.
6. **Transaction proof:** opening trades, cuts and waiver claims preserve unique ownership and development/protection metadata, reject invalid operations atomically, and reach legal final rosters without blocking the explicitly permitted over-cap recovery state.
7. **Save/resume proof:** suspend and resume at draft picks, pack passes, opening transaction choices, cleanup choices, and final submission yields the same continuation under the pinned versions.
8. **Human-facing proof:** a player can understand why a card, transaction, or cleanup choice is legal/illegal from disclosed salary, role, ownership, and deadline information.

D02 is complete only when this is a real pass-the-pack table and opening recovery loop, not a scripted list of cards or a compile-only shell.

## Decided for D02

- The player picks their franchise; the other seven clubs are drawn at random. All 30 franchises are pickable. In the first playable, a franchise brings its home park and guaranteed rival; package perks and decrees are labelled as later content.
- Every AI pick appears live in a pick ticker, and any club's roster and payroll can be opened during the draft.
- A club may hold two seasons of the same player: each season is a distinct card. Classic keeps one season per player. Revisit only if the pack structure changes.
- Legality is shown as a live roster checklist and cap bar: each slot reads filled or missing, payroll is drawn against the effective cap, and Submit stays disabled with a one-line reason per blocking item. The checklist reads the `pool-v2` legality failure codes.
- Opening trades follow the decided trade shape in [season and economy](../season-and-economy.md): up to 3-for-3, player and AI offers, no AI-to-AI trades, accept/reject/one counter, and a waiver pool for cards cut during the window.

## Implemented so far

- `src/lib/draft/run.ts` seats the table (`franchises.ts` holds the provisional rival shortlists), deals the pool, applies the player's picks with every AI seat picking from the pile it holds, and rebuilds a run from its setup and action log.
- `src/lib/draft/ai.ts` scores a held pile from the seat's own view: the pile, its cards, its budget and the undrafted cards it held earlier. A card is worth its change to the seat's best roster arrangement (reserves at a quarter). Filling an open slot adds up to six runs when few seen cards could fill it, and projected payroll over the cap costs runs at a seeded thrift of 1–1.8. A seeded archetype (lineup, rotation, bullpen, balanced) adds 15% in its roles, and sub-run jitter breaks near-ties. Each AI pick keeps its score parts, and `explainPick` turns them into a ticker line such as "fills C · +10.0 runs · few C options left". Each card's value includes its fit for the seat's home park from `draft-park-{franchise}.json`, and the ticker line names it when it moves the score by half a run or more. Decree fit is not scored.
- AI clubs are deliberately imperfect. The player picks Rookie, Pro (default) or Ace with the franchise; it is saved in the run setup. Each AI club misjudges every card by its own seeded error, fixed for the run (standard deviation 40%, 22% or 8% of the card's value plus five runs), and may carry one visible bias: gem chaser (golds and gems), homer (its own franchise), nostalgic (one decade) or big spender (thrift cut to 30%, 50% or 80%). Biases add 35%, 20% or 8%, and the ticker names a bias when it moved a pick. Against picks made on true values, Rookie clubs choose differently on 47% of picks and give up 4.5 runs per pick, Pro 39% and 2.7 runs, Ace 25% and 0.9 runs (24 seeded tables).
- Each run reprices every card by a seeded factor within ±10% of its stored salary (never below 5 units; cleanup commons stay at most 15), so prices differ from modeled value by run. The cap is 85% of the dealt table's average salary per club, so it binds by the same share at every table. Both are provisional balancing inputs.
- In `just draft-feasibility`, AI clubs take the pile's highest finish in about 31% of piles that mix finishes, so the top tier is not an automatic pick. Home park fit decides about 7% of AI picks: most cards' fit is within ±2 runs over the home half-season, while values in a pile differ by tens of runs, so park fit settles close calls rather than overturning a clearly stronger card.
- `src/lib/draft/saves.ts` keeps runs in the device database (`draft_runs`, migration 3) and refuses runs from other versions.
- In `just draft-feasibility` table caps run 1,269–1,686 units (median 1,528) and 537 of 576 AI clubs leave the draft over the cap. The perfect drafter has the best submitted roster at 20.3% of tables (mean rank 4.13 of 8).
- When the last pick is made each AI club recovers its opening roster by the stand-in recovery policy: cut surplus and the most overpriced cards, then take the most valuable top cleanup card for each open place. The player then has the opening window: cut any owned card, take the top card of any cleanup stack while the roster has fewer than 20 cards, Auto-fix (the same recovery applied to the player's cards), and submit once the roster is legal and every owned card has a place. These are run actions, so the window replays and resumes like the draft. Opening trades and waiver claims are not built yet.
- `/draft` is the playable route: franchise and difficulty, the draft table (the held pile as card fronts with salary, roles, finish and historical line; the pick ticker with AI reasons; any club's roster and payroll; the cap bar), then the opening window (roster with Cut, the top card of each cleanup stack, the checklist of blocking items, Auto-fix and Submit).

## Required open decisions before D02 acceptance

- Which initial franchise packages and opening decree content make the first full-season slice, including the exact content-selection gate and its evidence.
- Deal/pass presentation, tie-break rules, and whether reserve targets receive explicit table guidance. Pack contents and pass order are decided in [D01](./01-pool-and-rosters.md).
- Settle transaction ordering within the window.
- How much schedule, rival, and venue information is visible before and during the opening draft.
- The supported initial package/decree effect semantics and calibration bounds; any selected pitch/count, checked-swing, batting-position, or unusual-rule content must first satisfy the corresponding simulation-rule phase.
- Whether the opening table may be replayed with alternate human choices while preserving the same seed and public information.

## Deferred requirements

- Nine-game paydays, shops, development purchases, cap progression, attendance/fans, chapter venue changes, and chapter acquisitions belong to D04.
- Complete 30-franchise package activation, the full twenty-item decree catalog, richer markets, binder, sharing, and daily candidates belong to D05 or later content phases.
- AI-to-AI negotiation is not required for the D02 playable gate unless the selected opening transaction slice explicitly chooses it; deterministic public-rule behavior must remain documented.
- Decree accumulation is optional, not default. Dynamic Lineup is an optional expert variant, not a D02 dependency. The Great Wall remains deferred.
- Weather generation is not a dependency. Fixed reference park conditions and explicit wind/air inputs are sufficient where the selected package needs them.

## Evidence carried forward

D02 publishes a replayable opening-table state and an explicit list of supported versus retained-for-expansion packages/decrees. D03 consumes this state and the same ownership/salary/transaction contracts; it must not replace the draft with independent random teams or drop the opening trades/decree from the end-to-end flow.
