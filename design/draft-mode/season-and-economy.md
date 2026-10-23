# Season and economy

Authoritative league, checkpoint, economy, transaction, development and general fan rules. [Draft and rosters](draft-and-rosters.md) owns opening stock, salary valuation and legality. [Catalog](catalog.md) owns franchise-specific effects and decree lifecycles.

## Separate payroll and cash

**Salary cap and cash are separate resources.** The cap is a payroll allowance: roster salaries occupy that allowance without spending development cash. Use available cap space to improve the roster; unused room is capacity under the current ceiling, not a cash balance. Spendable revenue pays for development purchases, and **unspent cash carries throughout the run**. Revenue does not automatically expand payroll allowance. Starting player salaries remain the roster cost after development; any repricing exceptions require a separate decision.

**Payday is every nine games, before purchases.** Each completed segment provides minimum guaranteed income, ticket revenue affected by attendance, and a performance bonus based **only on wins in that segment**. Expectations do not change the win-bonus criterion. Royal Flush adds its earned home-win development-cash reward; other declared franchise payouts retain their own triggers. Keep these components visible without a merchandise-store management system. The income floor, ticket formula, per-win amount and reward bounds remain balancing inputs.

## A genuine eight-team season

Each team plays the other seven drafted teams, **not** the current fixed 2025 MLB opponents. A coherent league calendar determines all games, standings, home venues, and opponent workloads. A proposed 162-game construction gives each team 23 games against every rival (161 games), plus a 24th against one designated rival; the extra rival pairings form a perfect matching. Home/away allocation must be balanced to **81/81** for every club.

The extra-game schedule pairing is distinct from the cultural rivalry network. The league does not have to consist of four exclusive rivalry pairs.

Simulate all four games on each of 162 matchdays (648 games league-wide), not eight disconnected personal schedules. Randomize round ordering and game sequence using an auditable seed while keeping both sides' calendars and results consistent. This is inspired by baseball's seasonal rhythm rather than a literal MLB schedule.

For presentation and decisions, divide the season into **six chapters of 27 games**. Standings, records, player statistics, injuries, fan mood, and active decrees persist between chapters. The default run plays all 162 games even after elimination from a perfect-season goal.

## Checkpoints and transactions

The run has a **small checkpoint every nine games during the season** and a **major chapter checkpoint every 27 games**. At small checkpoints, credit the completed segment's cash before purchases, offer development, and allow batting-order, rotation and active/reserve changes among already rostered cards. Trades and new acquisitions remain chapter-boundary systems, apart from opening-roster recovery. At chapter boundaries, show standings, streaks, expectations, the incoming decree, major budget/venue changes and roster needs. Reveal the decree and any new venue before spending or roster decisions. Season completion does not automatically create another shop or decree.

The **opening decree is revealed before the initial draft**, along with franchise and park information. Later decrees are discovered at chapter checkpoints; the full season's decree calendar stays hidden. The upcoming schedule is the planning horizon. Exactly how much of the later schedule and opening venue detail is visible remains open.

**Trading:** a post-draft trading window precedes final roster submission and includes cuts and common-only cleanup. Chapter checkpoints allow trades of eligible players; all clubs share basic market access. A traded player cannot be traded again for **two chapters**. For example, a player traded after game 27 becomes eligible again after game 81. This is a per-player restriction, not a closure of the market. **An existing cooldown survives release and waiver claims with its original deadline**; changing ownership through waivers neither clears nor restarts it. AI GMs can exploit visible bargaining leverage, including an over-cap club's need to unload gems or fill roles, while obeying public information and normal rules.

**Cuts and waivers:** released players enter a waiver pool and can be claimed by rivals if legal and affordable. Cutting frees cap space without paying cash. **Supplemental acquisition:** small chapter drafts or packs draw from the remaining unowned player pool. Every card still has one owner at a time, and trades, claims and acquisitions must preserve role and salary legality. No lengthy reliever microdraft is requested.

**Trade shape (decided):** a trade moves up to three cards each way, uneven counts allowed. The player proposes to any AI club, and AI clubs send the player offers, such as an over-cap club trying to move a gem. AI clubs do not trade with each other. An AI club accepts an offer that improves it by its own roster needs and cap room, rejects it, or makes one counteroffer; each club takes a limited number of offers per window. Because cleanup can always repair a roster, a trade checks only ownership and cooldowns; legality is enforced at submission. In the opening window, cut cards go to a waiver pool that clubs may claim from until submission; unclaimed cards return to the unowned pool and never resurface as cleanup.

**Confirmed details:** three offers per AI club per window; at most one unsolicited AI offer per club per window; waiver claim priority to the club with the lowest drafted value; an opening trade's cooldown runs two chapters from game 0, so the card is tradeable again after game 54.

Open transaction details include transaction ordering within the window and chapter-checkpoint waiver timing. Release and claim operations must preserve the player's existing protection deadline.

| Moment | Agreed purpose | Open details |
|---|---|---|
| Before initial draft | Franchise/park information and opening decree | Schedule disclosure and opening venue details |
| After draft | Trading, cuts, waivers, common-only cleanup and legal roster submission | Pack allocation, ordering and repeated cut/claim cycles |
| Every nine games | Minimum income, ticket revenue and segment-win bonuses before purchases; basics/specials; one purchase per player; lineup/rotation/reserve changes | Amounts, special offers and exact within-visit ordering |
| Every 27 games | Incoming decree/venue revealed before spending; major budget changes, supplemental acquisition and eligible trades | Exact order, acquisition format, shop contents and budget curves |
| After game 162 | Season completion and reporting | Whether a final shop has any purpose; none is assumed |

Nine-game and chapter boundaries coincide at games 27, 54, 81, 108 and 135. Combining their presentation is a candidate; it does not introduce another checkpoint rule.

**Budget across stops (decided):** each nine-game payday credits cash, and unspent cash carries through the run. Extra stops do not add separate budgets; development at any stop draws on banked cash. A light stop after games 9 and 18 and a full chapter transition after game 27 is the candidate presentation. The smallest useful light stop is the payday result, one development purchase per player, at most one event or risk offer, and lineup, rotation and reserve changes. An empty event slot is skipped rather than filled with a choice that does not matter.

## Prices and market conditions

**Decided: salary is a public reputation price.** Each card is priced from its public WAR/162 on its role's market line (hitter, starter or closer): a least-squares fit of modeled runs on WAR over that role's cards, so a role is neither cheap nor expensive as a whole. A card without WAR prices at its role's zero-WAR level. Modeled runs stay off every player-facing surface, including AI pick explanations, which name the slot, park fit, bias, scarcity and cap pressure but no run figures. Finish never enters the price.

The gap between reputation and modeled value is the scouting game. Measured on data `1541f124a6ca`, among cards worth at least 10 modeled runs:

| Role | Cards | Gap sd (runs) | Off by more than 10 runs | Gap explained by visible stats (cross-validated R²) | Off by more than 10 runs after reading the stats |
|---|---|---|---|---|---|
| Hitter | 15,055 | 11.5 | 35.6% | 0.57 | 17.0% |
| Starter | 6,586 | 15.3 | 48.3% | 0.57 | 29.3% |
| Closer | 1,572 | 2.1 | 0% | — | — |

At 4 salary units per run, a 10-run gap is 40 units. More than half of the gap can be read from the stats printed on the card, so bargains reward reading rather than luck. One readable angle: WAR rewards innings, but the engine caps every starter's workload, so starters with 60–120 innings average 4.7 runs underpriced (a quarter of them by more than 20) and starters with 240 or more innings average 10.9 runs overpriced. Hitters show no playing-time skew, and closers price close to value.

In a 120-table buyer comparison (any 18 of the 128 dealt cards under the table cap, positions ignored, no competition, so an upper bound), a buyer who sees modeled value assembles 546 runs, a buyer who reads visible stats 473, and a buyer who follows reputation 253. Different legal strategies stay competitive: spending on a few stars and filling with commons reaches 354, and refusing any card over 120 units reaches 496. Under the earlier runs-proportional price the same buyers were within 22 runs of each other.

**Decided: a hard cap scaled to the table.** The cap is 85% of the dealt table's average salary per club. With reputation prices, `just draft-feasibility` (data `2ae60bb8a55e`) reports table caps of 1,276–1,711 units (median 1,491); every seat recovers to a legal roster.

**Decided: the price sheet is frozen through the opening draft.** At chapter boundaries only unowned cards reprice, driven by a stated market condition (for example a premium on power hitting) shown before any acquisition decision. A signed salary never changes, including through development. Development creates surplus value from fixed salaries even when the starting price is accurate; reputation pricing adds a separate scouting opportunity.

## Injuries and risk choices

**Injuries are a formal system (decided)**, owned by season evolution. The direction is push-your-luck: the player knowingly takes an optional benefit and accepts a disclosed risk. A disruption should never remove an interesting moment without offering an interesting decision.

- **Offers explain the cost in roster terms:** what the player gains and when; the total probability of the downside, including any increase from earlier pushes; the possible consequence and its duration; how recovery works; and which actual backup and upcoming opponents it affects. Rules such as an absence length can be exact; lost wins are estimates. None of this requires showing modeled value.
- **Candidate pushes:** intensive training for faster growth with a chance of a short absence; riding a starter deeper into games; skipping rest for a closer or setup reliever through a key series. Rosters carry three starters on a fixed rotation, so "short rest" has no meaning without a longer rotation.
- **Consequences are bounded.** The larger downside resolves after the series or training it was taken for. Two severities are to be compared: degraded performance (available, temporarily weaker, cleared by rest) and temporary absence (misses a bounded stretch; nine games is the candidate unit). Whole-chapter absences are rare and tied to signposted, high-stakes choices. Purchased development is not destroyed by default. Season-ending storylines stay out of the ordinary event pool.
- **Who can be hurt:** every card, including the closer and each named reliever. The remainder arm is not a card and is never injured; an absent reliever's innings pass to the next available reliever or the remainder.
- **Emergency call-ups:** when no rostered card can legally fill an absent player's slot, the club calls up the top common from its own cleanup stack for that role. The call-up counts at common salary while the absent card's salary is suspended, is visible at its current ability, and returns to the pool when the original player is back unless kept under normal roster and cap rules. It must never outperform planned depth or become an acquisition route.
- **Engine representation:** at segment granularity once the league runner plays to a stop and resumes. A degraded player is a modified profile for the segment; an absence or replacement closer is a different card in the slot for the segment. No team-wide penalty is needed.

Mandatory roster turnover is not a requirement unless decided: a cautious player may decline every push if declining costs real growth or wins. If forced turnover is wanted, predictable fatigue is the tool, not random injuries.

## Season moments

**Proposed:** situations at nine-game stops where randomness sets up the situation and the player's response chooses the tradeoff, such as a controversial post (spend preparation to repair fan support, or keep preparing and absorb the pressure), a sponsor appearance (cash for a lost development opportunity), a tired veteran asking for rest, or a successful call-up (pay to keep them, or return to plan). Consequences follow the action taken, never an arbitrary permanent stat change. Some moments follow from run history, such as heavy workload or an earlier commercial decision. Fan effects use the existing sentiment, attendance, ticket revenue and crowd effect rather than a new meter.

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
