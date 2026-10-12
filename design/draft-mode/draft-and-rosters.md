# Draft and rosters

Authoritative opening-draft and roster rules. [Season transactions](season-and-economy.md) own release/claim/trade timing and protection deadlines; [catalog](catalog.md) owns franchise traits and rivalry rules. Shared simulation and valuation must be established before prices and AI fit scores are balanced.

## Franchise selection (before drafting)

The player chooses a home franchise first. Each franchise specifies a package of (a) stadium conditions affecting both clubs at that venue, (b) franchise-specific economic or transaction advantages, and (c) fanbase behavior and expectations. Seven distinct opposing franchises are seeded for the other seats. All eight franchises participate under the same cap and scheduling rules, subject to their declared franchise-specific adjustments.

Franchise selection is analogous to choosing a starting deck: it makes some strategies attractive without making any choice universally best. A disadvantage should generally be compensated elsewhere, but the trade-offs need not cancel out in every game.

The catalog covers **all thirty MLB franchises**; an individual run still contains eight teams. Satire is optional. An ordinary field can derive its identity entirely from fans and economics. Develop the established premises and new catalog ideas together, while keeping agreed directions separate from open candidates.

Only the **player's franchise** gets a guaranteed credible rival in the league. Seed that rival from a curated shortlist and reveal it before drafting. Other clubs activate rivalry effects when a genuine rival happens to be selected. **Mets exception:** a player choosing the Mets always gets the Yankees, so the New York bandwagon mechanic is available. Teams without a convincing rivalry need no invented one. See [rivalries](catalog.md#rivalries-a-shared-franchise-layer).

## Shared cube and pack passing

**Decided format:** eight seats, each dealt two eight-card packs. A seat cracks both into one 16-card pile, takes one card and passes the pile to the left; sixteen picks clear the table, so every pile visits every seat twice. This creates **16 drafted cards per club** from **128 unique player-seasons**. The pool grows at each 27-game chapter. The player picks their own franchise; the other seven clubs are drawn at random. The player chooses at their seat; seven deterministic AI GMs make their own picks. The draft does not generate duplicate copies of the same historical player-season.

The opening roster has 16 active roles (9 hitters, 3 SP, CL, two setup relievers SU1 and SU2, and the team-season BP) plus two reserve cards. Any card eligible to close can fill a setup slot. SU1 takes the 8th inning and SU2 the 7th when the club leads by 0–3 runs, under the closer's availability rules: no third consecutive day, and a season cap of the pitcher's own relief outs scaled to 162 games. The team-season bullpen covers every other relief inning. This makes the table's many relievers draftable without a full bullpen microdraft; the reserve cards still give limited adaptation. Classic keeps its 14 roles. Position and pitcher-role eligibility still come from the historical dataset. The Classic rule requiring fourteen *different franchises* should not carry into Draft Mode; a shared cube and salary cap provide different scarcity constraints.

Packs should feel collectible: each pack has one gold-or-gem slot, two silver-or-better slots and five common-or-better slots, with upgrades at the pool's natural finish rates. **Finishes do not grant simulated bonuses.** The existing card-finish system reflects historical WAR-based tiers; Draft Mode may tune the visual/pack tiers without confusing finish, simulated value, and salary. Test whether the high-tier card is too automatic a first pick. Salary, positional scarcity, and stadium fit should sometimes make a less spectacular card correct.

**Opening-roster guarantee:** the initial packs include affordable commons for role coverage and development. After the shared draft, a **common-only cleanup draft** lets every club repair missing roles or an unaffordable roster before submission. Cleanup cards are cheap, real historical player-seasons from the unowned run pool, not fictional call-ups or duplicate copies. Cut or replace surplus cards, keep the fourteen active roles and two reserve slots legal, and count all retained cards against the cap. Bad drafting can produce a weaker team, but the opening process must provide a playable, affordable roster.

Cleanup cards are always commons. Each club has its own unlimited face-down stack per role and sees only the top card; taking it reveals the next. Stacks draw from the unowned run pool, so a cleanup card is still a unique real player-season, and a card that has been in the run never resurfaces. Integration with preseason trades and waivers and minimum salaries remain open.

## Salary and lineup submission

Each player-season has a Draft Mode salary valuation independent of its cosmetic finish. A baseline team has a nominal salary cap; franchise traits can raise or lower it. **All sixteen active selections and both reserves count against the cap.** Enforce legality at roster submission and after permitted roster changes, rather than automatically blocking expensive draft picks. A post-draft trading/cut window allows the GM to correct an over-cap or imbalanced draft before final submission. Baseline cap amount and player prices are balancing inputs, not fixed historical salaries.

Pricing should approximate a card's *marginal contribution in this simulation*, with positional replacement scarcity and workload included. Historical WAR can inform pricing and display, but cannot be the sole valuation: the engine's modeled results, especially team-season bullpens, do not perfectly track historical WAR. The cap makes the premium pick a choice rather than an automatic upgrade.

Franchise constraints change usable team cap space, not a card's price. Declared payroll obligations can consume part of a nominal cap; a spending ceiling can directly reduce the cap. Fixed deductions and lower ceilings create the same roster constraint unless their timing or another franchise trait differs. A gentle general cap increase over the season is an agreed direction; its curve and ceiling remain open. Every budget state must permit an affordable legal roster. Budget expiry or deductions need an explicit legality policy consistent with the opening-roster guarantee and common-only cleanup draft.

## AI general managers

The seven GMs must make **real cube picks** from the packs passed to them. They cannot duplicate cards, inspect unrevealed packs, submit illegal or over-cap rosters, or secretly alter simulation results. Expensive picks can temporarily exceed the prospective roster budget during drafting; bots must account for the post-draft recovery window and final role/salary guarantee. They should be deterministic given the run seed and visible draft history, with small seeded differences in personality.

Start with an explainable scoring heuristic: marginal modeled contribution relative to available replacement; required position or pitching role; scarcity of remaining legal players; salary efficiency including reserves; development value; expected home-park fit; known Commissioner decree; and modest archetype preferences. Prefer cheap precomputed estimates or sample-matchup evaluations over running a complete season for every choice. The selection policy must preserve feasible roster completion and account for bench depth. Transaction policies can price visible role gaps, cap pressure, upgrades and cooldowns as bargaining leverage, while using the same public rules as the human club.

An AI's archetype (contact, power, rotation, defense, running, bullpen value) should influence decisions, **not give its roster free statistical buffs**. Franchise circumstances create another source of preference. Human and AI clubs use the same simulation and public modifier rules.

## Implementation gates

[Pool and roster feasibility](phases/01-pool-and-rosters.md) must demonstrate that all eight clubs can complete affordable legal rosters from finite unique stock, not merely that aggregate position counts look sufficient. [Draft table](phases/02-draft-table.md) must integrate real AI picks and opening transactions under that guarantee. Minimum salaries, cleanup allocation, waiver order and trade formats remain open in the linked phase gates.
