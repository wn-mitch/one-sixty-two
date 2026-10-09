# Season and economy

Authoritative league, checkpoint, economy, transaction, development and general fan rules. [Draft and rosters](draft-and-rosters.md) owns opening stock, salary valuation and legality. [Catalog](catalog.md) owns franchise-specific effects and decree lifecycles.

## Separate payroll and cash

**Salary cap and cash are separate resources.** The cap is a payroll allowance: roster salaries occupy that allowance without spending development cash. Use available cap space to improve the roster; unused room is capacity under the current ceiling, not a cash balance. Spendable revenue pays for development purchases, and **unspent cash carries throughout the run**. Revenue does not automatically expand payroll allowance. Starting player salaries remain the roster cost after development; any repricing exceptions require a separate decision.

**Payday is every nine games, before purchases.** Each completed segment provides minimum guaranteed income, ticket revenue affected by attendance, and a performance bonus based **only on wins in that segment**. Expectations do not change the win-bonus criterion. Royal Flush adds its earned home-win development-cash reward; other declared franchise payouts retain their own triggers. Keep these components visible without a merchandise-store management system. The income floor, ticket formula, per-win amount and reward bounds remain balancing inputs.

## A genuine eight-team season

Each team plays the other seven drafted teams, **not** the current fixed 2025 MLB opponents. A coherent league calendar determines all games, standings, home venues, and opponent workloads. A proposed 162-game construction gives each team 23 games against every rival (161 games), plus a 24th against one designated rival; the extra rival pairings form a perfect matching. Home/away allocation must be balanced to **81/81** for every club.

The extra-game schedule pairing is distinct from the cultural rivalry network. The league does not have to consist of four exclusive rivalry pairs.

Simulate all four games on each of 162 matchdays (648 games league-wide), not eight disconnected personal schedules. Randomize round ordering and game sequence using an auditable seed while keeping both sides' calendars and results consistent. This is inspired by baseball's seasonal rhythm rather than a literal MLB schedule.

For presentation and decisions, divide the season into **six chapters of 27 games**. Standings, records, player statistics, injuries only if later implemented, fan mood, and active decrees persist between chapters. The default run plays all 162 games even after elimination from a perfect-season goal.

## Checkpoints and transactions

The run has a **small checkpoint every nine games during the season** and a **major chapter checkpoint every 27 games**. At small checkpoints, credit the completed segment's cash before purchases, offer development, and allow batting-order, rotation and active/reserve changes among already rostered cards. Trades and new acquisitions remain chapter-boundary systems, apart from opening-roster recovery. At chapter boundaries, show standings, streaks, expectations, the incoming decree, major budget/venue changes and roster needs. Reveal the decree and any new venue before spending or roster decisions. Season completion does not automatically create another shop or decree.

The **opening decree is revealed before the initial draft**, along with franchise and park information. Later decrees are discovered at chapter checkpoints; the full season's decree calendar stays hidden. The upcoming schedule is the planning horizon. Exactly how much of the later schedule and opening venue detail is visible remains open.

**Trading:** a post-draft trading window precedes final roster submission and includes cuts and common-only cleanup. Chapter checkpoints allow trades of eligible players; all clubs share basic market access. A traded player cannot be traded again for **two chapters**. For example, a player traded after game 27 becomes eligible again after game 81. This is a per-player restriction, not a closure of the market. **An existing cooldown survives release and waiver claims with its original deadline**; changing ownership through waivers neither clears nor restarts it. AI GMs can exploit visible bargaining leverage, including an over-cap club's need to unload gems or fill roles, while obeying public information and normal rules.

**Cuts and waivers:** released players enter a waiver pool and can be claimed by rivals if legal and affordable. Cutting frees cap space without paying cash. **Supplemental acquisition:** small chapter drafts or packs draw from the remaining unowned player pool. Every card still has one owner at a time, and trades, claims and acquisitions must preserve role and salary legality. No lengthy reliever microdraft is requested.

Open transaction details include multi-player versus one-for-one trades, offer limits, AI-to-AI negotiation, preseason cooldown semantics, release windows, waiver priority/timing, transaction ordering and atomic legality. Release and claim operations must preserve the player's existing protection deadline.

| Moment | Agreed purpose | Open details |
|---|---|---|
| Before initial draft | Franchise/park information and opening decree | Schedule disclosure and opening venue details |
| After draft | Trading, cuts, waivers, common-only cleanup and legal roster submission | Pack allocation, ordering and repeated cut/claim cycles |
| Every nine games | Minimum income, ticket revenue and segment-win bonuses before purchases; basics/specials; one purchase per player; lineup/rotation/reserve changes | Amounts, special offers and exact within-visit ordering |
| Every 27 games | Incoming decree/venue revealed before spending; major budget changes, supplemental acquisition and eligible trades | Exact order, acquisition format, shop contents and budget curves |
| After game 162 | Season completion and reporting | Whether a final shop has any purpose; none is assumed |

Nine-game and chapter boundaries coincide at games 27, 54, 81, 108 and 135. Combining their presentation is a candidate; it does not introduce another checkpoint rule.

## Purchased development

Spend revenue on deliberate upgrades, flavored as coaches, training camps, pitching labs and similar purchases. **Any rostered player can receive appropriate upgrades, including an unused reserve, with no playing-time requirement.** Development uses cash; a card's starting salary remains its roster cost.

Purchased upgrades persist when players are traded, and their source must be tracked for franchise-specific incentives. Original card tier remains available for effects such as Detroit's commons-based training bonus. Cosmetic finish alone does not change simulated strength; purchased development is a separate, explicit system. Reserve status grants no automatic growth, but it does not block paid investment.

Every shop offers reliable basic **hitting, pitching, fielding and baserunning** training alongside rotating specials. Basics support a deliberate build; specials can create opportunities worth banking cash for. Special offer pools, counts and exact upgrade definitions remain open.

**One purchase per player per shop visit**, across basics and specials. Cash, applicable training categories and the per-visit purchase record govern spending. A player's development remains a season-long project; cash may be saved rather than spent on an unsuitable target.

**Basic prices are fixed by training type, the same for every recipient before declared franchise price modifiers. Gains diminish as the particular skill being trained improves.** A powerful hitter with a weak glove can still gain substantially from fielding lessons; an excellent fielder gains less from the same package. Current skill determines headroom, not overall card rarity or a single count of previous purchases. Original tier still determines Detroit's common-count eligibility. Specialist offers can be more expensive and still suit stars.

Upgrade magnitudes, skill ceilings, diminishing-return curves, persistence details, purchase ordering and any salary exceptions remain open. Base profiles retain historical neutral-environment calibration; development applies disclosed counterfactual changes rather than having its gains calibrated away.

## Fan sentiment: dynamic, asymmetric, and possibly vicious

Each franchise has baseline attendance, expectations, and a changing sentiment state. Sentiment responds to results **relative to expectations**, not solely raw winning percentage. A championship favorite can get booed after a mediocre stretch; an underdog can electrify its crowd with a modest run.

Roster strength raises expectations through a tunable scalar applied to the franchise baseline. Low-expectation clubs do not retain underdog expectations after drafting a stacked roster. Performance can awaken their crowds; once a stadium fills, hype can surge. Expectation formulas, attendance growth, saturation thresholds, hype persistence, and bounds remain open.

At the home stadium, an enthusiastic crowd may provide a small favorable shift to the home club and an unfavorable one to the visitor. A hostile home crowd can reverse its contribution. Crowd size scales the magnitude; Atlanta's remote stadium typically has less effect. Separately, crowd intensity may increase **variance** around those effects. Important: larger variance alone does not favor the home team, so directional bias and volatility must be distinct parameters.

Fan mood is allowed to produce win-more or lose-more spirals. The game does **not** promise rubber-band comebacks. However, effects should remain bounded, visible in game and chapter reports, and open to a strategic response through roster or transaction decisions. Avoid a hidden fan multiplier so strong that the baseball cards cease to matter.

## Implementation gates

The [league playable](phases/03-league-playable.md) proves one consistent season before the [season-evolution phase](phases/04-season-evolution.md) adds adaptive decisions. Exact checkpoint ordering, budget-expiry recovery, cross-club purchase accounting and atomic transactions must be settled before those transitions are implemented. See [open decisions](open-decisions.md).
