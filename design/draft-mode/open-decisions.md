# Open decisions and calibration

Agreed premises are requirements; these entries describe the work needed to make them executable. Do not reopen settled ownership, income, reserve-training or cooldown rules. Gates identify the earliest dependent phase; a catalog-specific decision can wait until that package is selected. Mixed entries such as salary/revenue and opening/chapter trades span multiple phases.

No interview is required to use this scaffold. Resolve an entry when preparing the phase it actually blocks, using repository evidence for facts and explicit design decisions for tradeoffs.

## 1. Draft size

Owner: [Draft size](draft-and-rosters.md). First relevant gate: [phase](phases/01-pool-and-rosters.md).

Decided: two eight-card packs per seat, cracked into one pile and passed left for 16 picks; the pool grows each 27-game chapter. Open: whether the natural role mix needs pack guidance. Do not rely on cleanup as routine high-value acquisition or add bullpen granularity.

## 2. Salary and revenue

Owner: [Salary and revenue](season-and-economy.md). First relevant gate: [phase](phases/01-pool-and-rosters.md).

Calibrate all-card salaries, franchise constraints, cap ramp, minimum income, attendance revenue, segment-win bonuses and family prices. The D01 harness uses provisional values: `salary-runs-v1`, a minimum of 5 units, 4 units per run above the 20th-percentile replacement level, each run's prices scaled by a seeded factor within ±10% (never below 5 units; cleanup commons stay at most 15), and a cap of 85% of the dealt table's average salary per club. These are not decisions. Price from public reputation is the proposed direction; its measured gap from modeled value by role is recorded in [prices and market conditions](season-and-economy.md#prices-and-market-conditions). Open: the reputation signal (WAR alone or with tier and awards), a signal for team-season bullpens, whether the gaps are readable from visible stats, table-scaled cap level, hard cap versus luxury tax, and when market conditions reprice new acquisitions. Cash banks independently of payroll; each nine-game payday credits it and it carries through the run, so extra stops add no separate budget. Starting salaries persist through upgrades; repricing exceptions remain open. Decided: payday is ticket revenue only (box-seat floor plus attendance-driven gate), an average payday funds about two basic trainings, and the cap rises 3% per chapter; numbers are set from measurement and recorded as provisional. Define final-segment payout presentation without assuming a post-season shop.

## 3. Cleanup delivery

Owner: [Cleanup delivery](draft-and-rosters.md). First relevant gate: [phase](phases/01-pool-and-rosters.md).

Decided: cleanup cards are commons (base finish, at most 15 units) from each club's own unlimited per-role stack, with only the top card visible. Surplus and overpriced cards are cut to the unowned pool and never resurface. Waiver placement remains open. Ensure every club can submit an affordable legal roster without duplicated cards or fictional free call-ups.

## 4. Information and selection

Owner: [Information and selection](season-and-economy.md). First relevant gate: [phase](phases/03-league-playable.md).

The opening decree precedes drafting; later decrees precede chapter decisions. Decided: decrees are seeded-random without repeats; the whole season's schedule is visible.

## 5. Fan influence

Owner: [Fan influence](season-and-economy.md). First relevant gate: [phase](phases/04-season-evolution.md).

Calibrate roster-strength expectations, attendance, packed-stadium hype, directional bias and volatility. Define expectation refresh after training/trades, event persistence and bounds while preserving runaway streaks and the franchise-specific triggers.

## 6. Pitcher abstraction

Owner: [Pitcher abstraction](draft-and-rosters.md). First relevant gate: [phase](phases/03-league-playable.md).

Decided: named bullpens replace the composite BP in both modes, a closer plus three named relievers in Classic and five in Draft, with a fixed remainder arm; every named arm holds a primary and a backup relief role with no season workload cap, and Classic opponents get their top three real relievers by name with default roles (see the [model](../simulation/model.md#7-pitcher-calibration-workload-and-expectancy)). Open until playtesting: the remainder arm's level (it now mostly prices a short rotation), how opponents' named relievers are chosen, reliever pricing under uncapped workloads, and the re-tuned cap for 18 active Draft roles. Revisit the three-starter/54-start schedule only when it materially affects strategic variety.

## 7. Identity and satire

Owner: [Identity and satire](catalog.md). First relevant gate: [phase](phases/05-catalog-and-metagame.md).

Decided: the commissioner is Mad Fred. All thirty franchises now have premises; normal fields with fan/economic identities remain valid. Include brief sourced baseball history when discussing real references behind the satire.

## 8. Contact model

Owner: [Contact model](../simulation/model.md). First relevant gate: [phase](../simulation/phases/01-contact-profiles.md).

Define and calibrate estimated speed/angle/spray profiles, matchup contributions, flight and collision resolution, and integration with fielding. Keep measured and estimated provenance explicit.

## 9. Royal Flush accounting

Owner: [Royal Flush accounting](catalog.md). First relevant gate: [phase](phases/04-season-evolution.md).

Home-win development cash is credited every nine games before purchases. Calibrate payout size and ceiling. Payroll follows the general cap ramp; rewards do not add a separate cap-growth rule.

## 10. Decree semantics

Owner: [Decree semantics](catalog.md). First relevant gate: [phase](../simulation/phases/04-rule-extensions.md).

Define Singles Appreciation Night's advancement unit and HR/forced-runner behavior; designated-runner multiplicity; pitch/count and check-swing rules; batting-position effects; bunt awards; reverse routes and altered outs. Keep both batter's-box candidates in the selected twenty-item catalog. The Great Wall is deferred; Dynamic Lineup and decree accumulation remain outside default rules.

## 11. Development details

Owner: [Development details](season-and-economy.md). First relevant gate: [phase](phases/04-season-evolution.md).

Basic prices are recipient-independent by family before franchise modifiers; diminishing returns follow current trained skill. Any rostered card, including unused reserves, may buy appropriate training without a playing-time gate, once per visit. Define gain curves/ceilings, special offers, cross-club purchase accounting within the same checkpoint, and coincident chapter/shop ordering. Nine-game lineup, rotation and reserve changes are settled; trades/acquisition remain at chapters.

## 12. Trading and waivers

Owner: [Trading and waivers](season-and-economy.md). First relevant gate: [phase](phases/02-draft-table.md).

Decided: up to 3-for-3, player and AI offers, no AI-to-AI trades, accept/reject/one counter with offer limits, opening waivers until submission, legality at submission. See [trading](season-and-economy.md). Also decided: three offers per AI club per window, at most one unsolicited AI offer per club per window, claim priority to the lowest drafted value, and an opening cooldown that ends after game 54. Decided: trades and cuts, then one waiver round, then cleanup and submission; chapter stops run the same single waiver round. The two-chapter trade deadline already survives release/claim unchanged; do not reopen it as an unchosen rule.

## 13. Pittsburgh and Detroit

Owner: [Pittsburgh and Detroit](catalog.md). First relevant gate: [phase](phases/04-season-evolution.md).

Calibrate Pittsburgh-funded, once-per-player sale bonuses and the retained-core/sale balance. Paid reserve development is permitted generally; decide whether Pittsburgh's special payout requires active playing history. Define payout identity across different seasons of the same athlete. Detroit benefits every eligible recipient; middle-tier treatment, scaling and snapshot timing remain open.

## 14. Angels venues and payroll

Owner: [Angels venues and payroll](catalog.md). First relevant gate: [phase](phases/04-season-evolution.md).

Design the small fictional park pool; define venue selection/repetition, starting park, return-visit attachment, and payroll timing alongside the cap ramp. Physical perks affect both clubs; local attachment resets on relocation.

## 15. Other franchise branches

Owner: [Other franchise branches](catalog.md). First relevant gate: [phase](phases/05-catalog-and-metagame.md).

Define Washington funding votes and groundskeeping, optional Arizona fatigue, Houston's automatic information/adaptation effect, Minnesota's visible seasonal strength, and Milwaukee's shortened-game interaction.

## 16. Franchise and rivalry details

Owner: [Franchise and rivalry details](catalog.md). First relevant gate: [phase](phases/03-league-playable.md).

Curate genuine rivalry shortlists and calibrate their shared hype response. The player alone guarantees a seeded rival, revealed before drafting; player Mets always include Yankees. Resolve AI Mets seeding explicitly. Define Mets transfer timing/ties, Dodgers departure curves, Toronto state selection, Reds terrain and the specialized training/closer triggers. Do not reopen these agreed premises as empty catalog slots.

## 17. Delivery scope

Owner: [Delivery scope](README.md). First relevant gate: [phase](phases/03-league-playable.md).

Shared contact/flight/fielding simulation is a prerequisite, first proven in Classic. Draft-first is the first playable Draft milestone; season adaptation follows. Define smaller implementation phases without making every decree or franchise package a prerequisite. Preserve accepted requirements when staging their implementation.

## 18. Injuries and depth

Owner: [Injuries and risk choices](season-and-economy.md#injuries-and-risk-choices). First relevant gate: [phase](phases/04-season-evolution.md).

Decided: injuries are a formal system built on disclosed push-your-luck offers, bounded consequences and emergency call-ups from the club's own cleanup stack. Open: degraded performance versus absence (or both), absence lengths, probabilities and escalation, which pushes exist, call-up salary and retention rules, reserve count (two today; three to four covering a fourth starter, a utility infielder and a backup catcher is the candidate), and whether roster turnover is required.

## 19. Season moments

Owner: [Season moments](season-and-economy.md#season-moments). First relevant gate: [phase](phases/04-season-evolution.md).

Proposed: one optional situation per light stop with a conservative response available. Open: frequency, the event pool, history-triggered versus independent events, and whether players pick a category before seeing the dilemma.

## Decision boundary

[Shared model](../simulation/model.md) owns inference, contact, physics and fielding choices. [Ballparks](../simulation/ballparks.md) owns Classic stadium cards, fixed initial conditions and later weather. Draft does not need to settle every pitch/count or unusual-rule candidate before its first playable; a selected decree does require its own complete semantics and shared-engine support.
