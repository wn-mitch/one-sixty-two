# Open decisions and calibration

Agreed premises are requirements; these entries describe the work needed to make them executable. Do not reopen settled ownership, income, reserve-training or cooldown rules. Gates identify the earliest dependent phase; a catalog-specific decision can wait until that package is selected. Mixed entries such as salary/revenue and opening/chapter trades span multiple phases.

No interview is required to use this scaffold. Resolve an entry when preparing the phase it actually blocks, using repository evidence for facts and explicit design decisions for tradeoffs.

## 1. Draft size

Owner: [Draft size](draft-and-rosters.md). First relevant gate: [phase](phases/01-pool-and-rosters.md).

Playtest the proposed two waves of eight picks with the selected common-only cleanup safety net. Tune the initial draft's decisions and coverage rather than relying on cleanup as routine high-value acquisition or adding bullpen granularity.

## 2. Salary and revenue

Owner: [Salary and revenue](season-and-economy.md). First relevant gate: [phase](phases/01-pool-and-rosters.md).

Calibrate all-card salaries, franchise constraints, cap ramp, minimum income, attendance revenue, segment-win bonuses and family prices. Cash banks independently of payroll. Starting salaries persist through upgrades; repricing exceptions remain open. Define final-segment payout presentation without assuming a post-season shop.

## 3. Cleanup delivery

Owner: [Cleanup delivery](draft-and-rosters.md). First relevant gate: [phase](phases/01-pool-and-rosters.md).

Common-only opening repair is selected. Define finite stock, role/budget coverage, pack allocation and trade/cut/waiver ordering. Ensure every club can submit an affordable legal roster without duplicated cards or fictional free call-ups.

## 4. Information and selection

Owner: [Information and selection](season-and-economy.md). First relevant gate: [phase](phases/03-league-playable.md).

The opening decree precedes drafting; later decrees precede chapter decisions. Define future schedule disclosure and seeded-random versus reactive decree selection.

## 5. Fan influence

Owner: [Fan influence](season-and-economy.md). First relevant gate: [phase](phases/04-season-evolution.md).

Calibrate roster-strength expectations, attendance, packed-stadium hype, directional bias and volatility. Define expectation refresh after training/trades, event persistence and bounds while preserving runaway streaks and the franchise-specific triggers.

## 6. Pitcher abstraction

Owner: [Pitcher abstraction](draft-and-rosters.md). First relevant gate: [phase](phases/03-league-playable.md).

Retain one composite BP and one closer rather than drafting ten relievers. Revisit the three-starter/54-start schedule only when it materially affects strategic variety.

## 7. Identity and satire

Owner: [Identity and satire](catalog.md). First relevant gate: [phase](phases/05-catalog-and-metagame.md).

Establish the commissioner's final name and tone. All thirty franchises now have premises; normal fields with fan/economic identities remain valid. Include brief sourced baseball history when discussing real references behind the satire.

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

Define multi-player trades, offers, AI-to-AI behavior, preseason cooldowns, release windows, waiver priority/timing and atomic legality. The two-chapter trade deadline already survives release/claim unchanged; do not reopen it as an unchosen rule.

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

## Decision boundary

[Shared model](../simulation/model.md) owns inference, contact, physics and fielding choices. [Ballparks](../simulation/ballparks.md) owns Classic stadium cards, fixed initial conditions and later weather. Draft does not need to settle every pitch/count or unusual-rule candidate before its first playable; a selected decree does require its own complete semantics and shared-engine support.
