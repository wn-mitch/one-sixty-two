# 162-0 — Draft Mode

**Design specification, v0.4**  
**Status:** Concept approved for exploration; mechanics and numerical values provisional  
**Implementation target:** After Classic mode reaches a stable, playable baseline  
**Repository:** [wn-mitch/one-sixty-two](https://github.com/wn-mitch/one-sixty-two), initially reviewed on `initial-game` (`pa-v2`)

## 1. High concept

An eight-team, single-player baseball roguelike built around a genuine **shared-pool, pass-the-pack cube draft**. The player chooses a franchise, drafts historical MLB player-seasons alongside seven AI general managers, builds a salary-constrained roster, and attempts a 162-game season against the *other seven drafted teams*. Franchises come from a complete MLB stadium catalog with physical conditions, financial trade-offs, and fan expectations. During the season, an increasingly deranged Commissioner's Office imposes temporary rule changes that force teams to adapt. **Mad Fred meddling** is the working label for this system; the commissioner's final identity remains open.

The appeal is not merely assembling the highest-rated all-time roster. It is adapting to a finite player pool, other drafters' choices, a stadium's incentives, the league schedule, and shifting rules of baseball. Good runs create dynasties; bad decisions and hostile circumstances can create catastrophic spirals. Both are legitimate outcomes if the player still has meaningful decisions to make.

The tone is a deliberately ridiculous baseball roguelike. Mad Fred can change fundamental rules of baseball. Development and transactions should support that game rather than turn a season into a detailed management simulation.

**Player fantasy:** “I drafted a ridiculous baseball team in an even more ridiculous league, and here is the season that happened.”

## 2. Relationship to Classic

**Classic remains its own game mode.** Its existing franchise-and-decade rolls, fourteen permanent selections, no-salary roster, fixed 2025 opponents, and full 162-game results should remain understandable and replay-compatible. Draft Mode reuses the statistical profiles and underlying plate-appearance engine, but owns its own draft rules, league structure, economic rules, modifier configuration, and save schema.

Current Classic implementation to preserve:

- Historical player-seasons from 1950–2025, converted to a common 2025 batting environment.
- Eight core plate-appearance categories (BB, HBP, SO, 1B, 2B, 3B, HR, OUT), plus modeled steals, base advancement, errors, double plays, sacrifice flies, and pitcher usage.
- A nine-hitter, three-starter, one-closer, one-team-season-bullpen active roster (14 selections); Classic's three starters currently make 54 starts each.
- Seeded, deterministic game results and versioned action-history replay.

New Draft Mode features must not silently change results for previously shared Classic seeds. Introduce a separate ruleset/model version and explicit compatibility tests.

## 3. Design pillars

1. **A real cube, not eight independent random teams.** All eight drafters receive packs from one finite cube. A historical player-season taken by one GM cannot be taken by another in that run.
2. **Context determines card value.** Position, simulated contribution, cap cost, home stadium, fanbase, known decrees, and remaining roster needs matter more than a single overall rating.
3. **The league plays by its own absurd rules.** Ballpark conditions affect everyone visiting; Commissioner decrees apply to all teams; fans can help, hurt, or destabilize the home club.
4. **Emergent stories outrank perfect balance.** Franchises should be roughly competitive over many seeded runs, not identically powerful. Streaks, win-more builds, and lose-more spirals are allowed.
5. **No predatory collection mechanics.** Random packs are fun because they create decisions. There are no paid packs, timegated attempts, stamina, login streaks, or purchases that alter gameplay.
6. **Keep the baseball simulation legible.** Prefer a few calibrated, visible levers to an encyclopedic but untestable physics or chemistry model.

## 4. Run structure

### 4.1 Franchise selection (before drafting)

The player chooses a home franchise first. Each franchise specifies a package of (a) stadium conditions affecting both clubs at that venue, (b) franchise-specific economic or transaction advantages, and (c) fanbase behavior and expectations. Seven distinct opposing franchises are seeded for the other seats. All eight franchises participate under the same cap and scheduling rules, subject to their declared franchise-specific adjustments.

Franchise selection is analogous to choosing a starting deck: it makes some strategies attractive without making any choice universally best. A disadvantage should generally be compensated elsewhere, but the trade-offs need not cancel out in every game.

The catalog covers **all thirty MLB franchises**; an individual run still contains eight teams. Satire is optional. An ordinary field can derive its identity entirely from fans and economics. Develop the established premises and new catalog ideas together, while keeping agreed directions separate from open candidates.

Only the **player's franchise** gets a guaranteed credible rival in the league. Seed that rival from a curated shortlist and reveal it before drafting. Other clubs activate rivalry effects when a genuine rival happens to be selected. **Mets exception:** a player choosing the Mets always gets the Yankees, so the New York bandwagon mechanic is available. Teams without a convincing rivalry need no invented one. See §5.6.

### 4.2 Shared cube and pack passing

**Proposed first-playtest format, not a locked rule:** eight seats, two waves, one eight-card pack opened at each seat per wave. Players take one card and pass the rest, reversing direction for the second wave. This creates **16 drafted cards per club** from **128 unique player-seasons**. The player chooses at their seat; seven deterministic AI GMs make their own picks. The draft does not generate duplicate copies of the same historical player-season.

The opening roster uses the current 14-role structure (9 hitters, 3 SP, CL, team-season BP) with two reserve cards. The reserve cards enable limited adaptation without requiring players to draft an entire modern bullpen. Position and pitcher-role eligibility still come from the historical dataset. The Classic rule requiring fourteen *different franchises* should not carry into Cube Mode; a shared cube and salary cap provide different scarcity constraints.

Packs should feel collectible: a proposed collation goal is one high-tier Gem/Foil card, two attractive middle-tier cards, and the remainder Base. **Finishes do not grant simulated bonuses.** The existing card-finish system reflects historical WAR-based tiers; Draft Mode may tune the visual/pack tiers without confusing finish, simulated value, and salary. Test whether the high-tier card is too automatic a first pick. Salary, positional scarcity, and stadium fit should sometimes make a less spectacular card correct.

**Legality guarantee — agreed requirement, unresolved mechanism:** the initial draft must supply enough cards for a guaranteed affordable legal roster. Replacement-level players should be commons inside the packs. Commons provide real role coverage and development opportunities, rather than merely padding packs beneath gems. Coverage of the whole cube alone does not guarantee coverage for each seat when clubs compete for the same cards. Define the per-club role and budget guarantee without a tedious sequence of forced picks. A free fictional replacement-player pool is not the selected solution; any emergency fallback needs a separate decision.

### 4.3 Salary and lineup submission

Each player-season has a Draft Mode salary valuation independent of its cosmetic finish. A baseline team has a nominal salary cap; franchise traits can raise or lower it. **All fourteen active selections and both reserves count against the cap.** Enforce legality at roster submission and after permitted roster changes, rather than automatically blocking expensive draft picks. A post-draft trading/cut window allows the GM to correct an over-cap or imbalanced draft before final submission. Baseline cap amount and player prices are balancing inputs, not fixed historical salaries.

Pricing should approximate a card's *marginal contribution in this simulation*, with positional replacement scarcity and workload included. Historical WAR can inform pricing and display, but cannot be the sole valuation: the engine's modeled results, especially team-season bullpens, do not perfectly track historical WAR. The cap makes the premium pick a choice rather than an automatic upgrade.

Franchise constraints change usable team cap space, not a card's price. Declared payroll obligations can consume part of a nominal cap; a spending ceiling can directly reduce the cap. Fixed deductions and lower ceilings create the same roster constraint unless their timing or another franchise trait differs. A gentle general cap increase over the season is an agreed direction; its curve and ceiling remain open. Every budget state must permit an affordable legal roster. Budget expiry or deductions need an explicit legality policy consistent with the pack-contained commons guarantee.

**Salary cap and cash are separate resources.** The cap is a payroll allowance: roster salaries occupy that allowance without spending development cash. Use available cap space to improve the roster; unused room is capacity under the current ceiling, not a cash balance. Spendable revenue pays for development purchases, and **unspent cash carries throughout the run**. Attendance, fan response, and commercial income can produce visible abstract payouts without a merchandise-store management system. Revenue does not automatically expand payroll allowance. Franchise rewards must declare their resource; Royal Flush pays development cash. Payout formulas, minimums and bounds remain open. Starting player salaries remain the roster cost after development; any repricing exceptions require a separate decision.

### 4.4 A genuine eight-team season

Each team plays the other seven drafted teams, **not** the current fixed 2025 MLB opponents. A coherent league calendar determines all games, standings, home venues, and opponent workloads. A proposed 162-game construction gives each team 23 games against every rival (161 games), plus a 24th against one designated rival; the extra rival pairings form a perfect matching. Home/away allocation must be balanced to **81/81** for every club.

The extra-game schedule pairing is distinct from the cultural rivalry network. The league does not have to consist of four exclusive rivalry pairs.

Simulate all four games on each of 162 matchdays (648 games league-wide), not eight disconnected personal schedules. Randomize round ordering and game sequence using an auditable seed while keeping both sides' calendars and results consistent. This is inspired by baseball's seasonal rhythm rather than a literal MLB schedule.

For presentation and decisions, divide the season into **six chapters of 27 games**. Standings, records, player statistics, injuries only if later implemented, fan mood, and active decrees persist between chapters. The default run plays all 162 games even after elimination from a perfect-season goal.

### 4.5 Checkpoints and transactions

The run has a **small development checkpoint every nine games during the season** and a **major chapter checkpoint every 27 games**. At chapter boundaries, show standings, streaks, fan expectations, the incoming decree, major budget or venue changes, and roster needs. Reveal the decree and any new venue before spending or roster decisions. Allow validated lineup, rotation, reserve and acquisition decisions. Exact permissions at the smaller checkpoints remain open. Season completion does not automatically create another shop or decree.

The **opening decree is revealed before the initial draft**, along with franchise and park information. Later decrees are discovered at chapter checkpoints; the full season's decree calendar stays hidden. The upcoming schedule is the planning horizon. Exactly how much of the later schedule and opening venue detail is visible remains open.

**Trading:** a post-draft trading window precedes final roster submission and cuts. Chapter checkpoints allow trades of eligible players; all clubs share basic market access. A traded player cannot be traded again for **two chapters**. For example, a player traded after game 27 becomes eligible again after game 81. This is a per-player restriction, not a closure of the market. AI GMs can exploit visible bargaining leverage, including an over-cap club's need to unload gems or fill roles, while obeying public information and normal rules.

**Cuts and waivers:** released players enter a waiver pool and can be claimed by rivals if legal and affordable. Cutting frees cap space without paying cash. **Supplemental acquisition:** small chapter drafts or packs draw from the remaining unowned player pool. Every card still has one owner at a time, and trades, claims and acquisitions must preserve role and salary legality. No lengthy reliever microdraft is requested.

Open transaction details include multi-player versus one-for-one trades, offer limits, AI-to-AI negotiation, preseason cooldown semantics, waiver priority/timing, transaction ordering and atomic legality. Releases and reclaims must not silently bypass trade protection; define their cooldown treatment.

| Moment | Agreed purpose | Open details |
|---|---|---|
| Before initial draft | Franchise/park information and opening decree | Schedule disclosure and opening venue details |
| After draft | Trading, cuts, waivers and legal roster submission | Ordering and repeated cut/claim cycles |
| Every nine games | Small, predictable development shop; usage-based eligibility | Payout timing, offers, purchase limits, call-up and lineup permissions |
| Every 27 games | Incoming decree/venue revealed before spending; major budget changes, supplemental acquisition and eligible trades | Exact order, acquisition format, shop contents and budget curves |
| After game 162 | Season completion and reporting | Whether a final shop has any purpose; none is assumed |

Nine-game and chapter boundaries coincide at games 27, 54, 81, 108 and 135. Combining their presentation is a candidate; it does not introduce another checkpoint rule.

### 4.6 Purchased development

Spend revenue on deliberate upgrades, flavored as coaches, training camps, pitching labs and similar purchases. **Any player can receive upgrades.** Basic development should generally have more leverage on weaker players; specialist investment can still suit stars. A card's starting salary remains its roster cost as development uses cash.

Playing time feeds a usage threshold for upgrade eligibility. Unused reserves do not develop automatically. Purchased upgrades persist when players are traded, and their source must be tracked for franchise-specific incentives. Original card tier remains available for effects such as Detroit's commons-based training bonus. Cosmetic finish alone does not change simulated strength; purchased development is a separate, explicit system.

Upgrade families, magnitude, limits, role-specific usage thresholds, persistence rules, purchase timing and any salary exceptions remain open. Base profiles retain historical neutral-environment calibration; development applies disclosed counterfactual changes rather than having its gains calibrated away.

## 5. Interacting modifier systems

Modifiers must change parameters that the simulation actually uses, rather than display unexplained overall-rating buffs. Their wording can be absurd; their effects should be deterministic, inspectable, bounded, and testable.

### 5.1 Stadium conditions: local, persistent, and symmetrical

Each exaggerated stadium has one prominent physical or environmental identity, normally active at all its home games and affecting **both** teams on the field. Ordinary fields do not require a special physical modifier. A park may influence ball flight, collisions, runner advancement, stealing, or fielding. The existing conventional park factors already contribute to baseline historical normalization; fantasy park effects must be layered explicitly, without unintentional double counting.

Examples:

| Franchise | Satirical park condition | Intended simulation consequences |
|---|---|---|
| Miami — **The Everglades** | Sea levels have turned the infield into a marsh. | Weaker baserunning and stealing; slowed ground balls are easier to field. Terrain and runner effects apply to both clubs. |
| Colorado — **Mile High-er** | An earthquake raised the stadium another 3,000 feet. | Higher home-run and extra-base-hit probability for both clubs. |
| Boston — **The Greenest Monster** | The left-field wall has grown to absurd proportions. | Resolve trajectories against the taller wall; some potential homers become wall hits or catchable balls. |
| New York Yankees — **The Shortest Porch** | Right field keeps getting closer to home plate. | Shorter right-field geometry favors trajectories hit that way; handedness and spray estimates inform the effect. |
| Seattle — **Marine Layer** | Exaggerated coastal air kills carry. | More airborne balls fall near the warning track. Exact air parameters and resulting hit/out distributions remain provisional. |
| San Francisco — **Splash Zone** | A strong, consistent wind blows toward McCovey Cove. | Directional wind changes trajectories and rewards particular spray angles, distinct from Seattle's general carry suppression. |
| Tampa Bay — **Catwalk Baseball** | Hurricanes destroy the roof; insurers demand an absurdly lower replacement. | More trajectories collide with roof infrastructure. Preserve the actual catwalk rulings below. |
| Arizona — **The Hot Corner** | A hard, hot infield becomes an unforgiving surface. | Ground balls move faster and are harder to field for both clubs. Heat-driven pitcher fatigue is an optional unresolved addition. |
| Milwaukee — **Seventh-Inning Fermentation** | Late-game fermentation changes the playing environment. | From inning seven onward, both teams gain power and lose fielding reliability. Strength and interaction with shortened games remain open. |
| Minnesota — **The Deep Freeze** | Seasonal cold changes the pitching environment. | Cold chiefly reduces pitcher endurance; carry suppression is secondary. Disclose the six-chapter pattern: cold → thaw → warm → warm → cool → cold. Home attendance is dependable. |
| Washington — **Government Shutdown** | Funding votes switch groundskeeping between funded and shutdown states. | Ground-ball behavior changes for both clubs at 27-game boundaries. Exact grass effects, vote policy and a proposed shutdown fan boost remain provisional. |
| Cincinnati — **The Crosley Cliff** | Restore the old terrace as a ridiculously steep outfield hillside. | Athletic outfielders handle the terrain better; awkward rolls and rebounds reward placement hitting and alert running. Geometry and strength remain open; both teams face it. |

**Catwalk Baseball ground rules:** fair contact with the upper A/B rings remains live and can be caught for an out; fair contact with the lower C/D rings is a home run; a ball lodged on an upper ring is a double; contact with an overhead object over foul territory is dead. Ring geometry, collision frequency, and deflection modeling remain provisional. These rules are grounded in the [Rays' published ground rules](https://www.mlb.com/rays/ballpark/information/ground-rules). Satire changes the geometry, rather than inventing different rulings.

### 5.2 Franchise economics and strategic perks: owned by the team

Financial and strategic perks belong to a franchise and do **not** change its opponent's payroll. Physical conditions remain symmetrical; a declared team-owned information advantage is a separate strategic effect. Pair substantial constraints with compensating benefits and calibrate them across a complete season.

**Atlanta — The Cherokee Commute:** In the game's openly fictional political timeline, President Marjorie Taylor Greene arranges a sweetheart stadium deal deep in Cherokee County. The resulting public subsidy grants a substantially higher salary cap; the distant stadium attracts fewer fans, weakening home-crowd support and limiting crowd-driven upside. This is an economic trade-off, not a claim about real events.

Other possible compensation levers include cap space, scouting visibility, permitted roster changes, or small transaction advantages. Do not add all of these in the first milestone.

**Los Angeles Angels — Locked Payroll / Relocation:** Ownership relocates the club **every chapter** among a small dedicated pool of fictional temporary parks. Each park offers positive perks with different strategic fits; physical effects apply to both clubs. Reveal the next venue before chapter spending and roster decisions. Crowds vary by location, have low attachment, and can become enthusiastic as the club wins within a chapter. Relocation resets local attachment; loyalty does not simply carry forward. Low initial expectations and payroll commitments remain part of the package. Park designs, selection/repeat policy, initial venue, attachment on return visits, and payroll amounts/timing alongside the general cap ramp remain open.

**Baltimore Orioles — Tight Spending Ceiling:** An ordinary field, low initial fan expectations, and a restrictive spending ceiling. The challenge comes from limited resources; low expectations provide patience and room to surprise the crowd. The cap amount remains a balancing input.

**Kansas City Royals — Royal Flush:** Kauffman becomes a giant casino. The club starts with a lean cap; home wins generate bounded **development cash** rewards credited at checkpoints. That cash joins the banked balance; payroll follows the general cap ramp. Payout size, ceiling and credit cadence remain open. The field is ordinary; the identity is an economic snowball rather than fountain overflow.

**Athletics — The House Always Wins:** Use a fictional Vegas identity with a low cap and discounted development purchases. Developing cheap players into bargains is the intended loop. The discount is agreed; a separate revenue-earning mechanic is not. Exact prices, discount scope and limits remain open.

**Pittsburgh Pirates — The Farm Team:** A restrictive cap encourages a retained developed core plus rotating **active-roster** sale candidates. Trading a player developed with Pittsburgh-funded purchases earns a cash bonus, **once per player per run**. Upgrades follow the traded player; only Pittsburgh's own investment qualifies for its special payout. All clubs share basic trade access and the same two-chapter player cooldown. Two reserves remain tactical depth, not an expanded farm. Payout functions, qualifying upgrades, retained-core incentives, replacement acquisition and upgrade scheduling remain open.

**Detroit Tigers — The Assembly Line:** More **original-tier commons in the active roster** increase gains from purchased training, up to a ceiling. This improves development efficiency rather than granting an unexplained on-field ratings bonus. A developed common preserves its original-tier eligibility. Mixed rosters with a few gems and developing commons should remain viable. Whether the gains benefit all training recipients or commons only, middle-tier treatment, snapshot timing and the scaling curve remain open.

**Houston Astros — Trash Can Confidential:** A publicly disclosed home-side pitch-information advantage carries an opposing adaptation cost. The premise is agreed; its automatic simulation mechanism, duration and calibration remain open. It must be a declared franchise rule, without hidden AI information or manual pitch selection becoming necessary.

**St. Louis Cardinals — The Cardinal Way:** An ordinary field with stronger gains from purchased **fielding and baserunning** training. Develop talented hitters' rough gloves or running habits through targeted fundamentals. This is a fictional training perk inspired by the organization's [teaching handbook](https://www.mlb.com/news/the-cardinal-way/c-32262436), not a claim that real coaching grants a fixed bonus. Gain strength and eligible upgrade definitions remain open.

**Texas Rangers — The Ryan Express:** An ordinary field where purchased power-pitching training produces larger **strikeout gains**. Draft promising arms and invest in their development. The name invokes the [Rangers' connection to Nolan Ryan](https://baseballhall.org/hall-of-famers/ryan-nolan); the training advantage is fictional. Exact upgrade parameters, costs and bounds remain open.

**Toronto Blue Jays — The Exchange Rate:** An ordinary field with a simple, bounded chapter modifier. Cheaper development accompanies more expensive tickets and thinner attendance; expensive development accompanies cheaper tickets and fuller stands. **The whole crowd participates**, with no local/tourist split or household-finance model. Reveal the current state at the chapter checkpoint; cash banking permits saving for favorable development prices. Price/attendance strength, state selection and future visibility remain open.

### 5.3 The Commissioner's Office: league-wide, temporary chaos

A fictional commissioner issues deadpan official memoranda between chapters. Decrees apply to **every** team for a **27-game chapter**, then the next decree replaces the previous one. One decree is active at a time, alongside stadium conditions and fan effects. Accumulating decrees is a separate candidate, not a default rule. The viewership-driven premise supports increasingly absurd changes to identifiable rules of baseball, rather than unexplained behavior buffs.

Examples:

- **Mound Everest:** The mound rises ten inches; reweight strikeouts, walks, and contact outcomes in favor of pitching. This is a deliberately exaggerated rule effect, not a physical prediction.
- **Last Call:** Beer sales have become intolerable; regulation games now last seven innings. Change the game-ending logic, closer-entry timing, seasonal pitching usage, and win-expectancy calculation together.
- **Honey, I Shrunk the Diamond:** Bases are closer together; modify steal success, advancement, and possibly double-play rates.
- **Singles Appreciation Night** (also called **Singles Awareness Week**): runners may advance only one base at a time; steals are banned. “No one likes a stolen heart.” The direction is agreed; advancement units, home-run classification, forced advances, errors, sacrifice flies and extra-inning interactions remain open.

Further candidates: **lowering the mound**; **legalized steroids**; **random starting baserunners**, with starting configurations and runner identities unresolved; and **Ticky Tocky Bases**, a lopsided diamond distorted to suit vertical video. Its geometry and baseball consequences remain open. Rule changes should produce distinct adaptations, not merely different names for the same multiplier.

The opening decree is **revealed before drafting**. Later decrees are **announced at chapter checkpoints before spending and roster decisions**. The full future decree calendar is hidden. Seeded-random versus reactive selection and future schedule disclosure remain open. Opposing GMs only respond to information they could legitimately know.

The selected twenty-item catalog below is **accepted for continued design**, not a set of twenty completely specified rules. Both batter's-box candidates remain in scope.

| # | Decree | Candidate rule / unresolved semantics |
|---|---|---|
| 1 | Last Call | Seven-inning regulation, with extras for ties; ending logic, closer entry, workload and win expectancy change together. |
| 2 | Ticky Tocky Bases | Lopsided diamond for vertical video; legs have different distances. Geometry remains open. |
| 3 | Singles Appreciation Night | One-base advancement and no steals; define advancement units, HRs, forced runners, errors, sacrifices and extras. |
| 4 | Mound Everest | Dramatically higher mound changes pitching; the exaggerated effect still needs calibration. |
| 5 | Honey, I Shrunk the Diamond | Shorter basepaths; advancement, stealing and double plays need consistent treatment. |
| 6 | One Strike, You're Out | One called or swinging strike retires the batter; ordinary fouls are exempt. Needs a count/pitch abstraction. |
| 7 | Two Balls, Take Your Base | Two balls earn a walk. Decide whether independent from or paired with one-strike baseball. |
| 8 | Commit to the Bit | Every checked swing counts as a swing; contact resolves normally. Check-swing modeling is open. |
| 9 | Standing Room Only | Smaller batter's box restricts batting position; strike zone is unchanged. |
| 10 | Room to Swing | Larger batter's box permits more extreme batting positions; the positioning/contact link is open. |
| 11 | Overtime Mandate | Twelve-inning regulation, with extras if tied; pitcher endurance and ending logic change. |
| 12 | Four-Out Baseball | Four outs per half-inning. |
| 13 | Two-Out Express | Two outs per half-inning. |
| 14 | Wrong-Way Round | Run third → second → first → home; force plays and throws follow that route. |
| 15 | The Designated Runner | A nominated rostered reserve runs for batters reaching base while hitters stay in the lineup; concurrent runners need definition. |
| 16 | No Free Passes | Ball four awards second; other runners advance as forced. Define force chains and HBP treatment. |
| 17 | Foul Play | An ordinary foul with two strikes becomes strike three. |
| 18 | Double Jeopardy | A grounded double play retires two runners but counts as three outs, capped by remaining outs; scoring and identities need definition. |
| 19 | Small-Ball Subsidy | A successful sacrifice bunt retiring the batter and advancing a runner earns a bonus run; success/failure rules need support. |
| 20 | Everybody Tags | A caught fly retires the batter and automatically advances each existing runner one base; eligible catches need definition. |

Lowered mound, legalized steroids and random starting baserunners remain additional candidates. **The Great Wall**, which raises every outfield fence, is deferred outside the selected twenty-decree catalog; Boston's permanent tall-wall park remains intact. Decrees may substantially change baseball rules rather than being limited to small statistical nudges.

**Dynamic Lineup — optional expert variant:** Treat each trip through the lineup as a hand of nine hitters, selectable in any order until all have batted, then reset. A bench substitution for that game is part of the candidate. This is outside the default mode because choosing every batter across a season substantially increases involvement. Control, substitution semantics, and AI policy remain unresolved.

### 5.4 Fan sentiment: dynamic, asymmetric, and possibly vicious

Each franchise has baseline attendance, expectations, and a changing sentiment state. Sentiment responds to results **relative to expectations**, not solely raw winning percentage. A championship favorite can get booed after a mediocre stretch; an underdog can electrify its crowd with a modest run.

Roster strength raises expectations through a tunable scalar applied to the franchise baseline. Low-expectation clubs do not retain underdog expectations after drafting a stacked roster. Performance can awaken their crowds; once a stadium fills, hype can surge. Expectation formulas, attendance growth, saturation thresholds, hype persistence, and bounds remain open.

At the home stadium, an enthusiastic crowd may provide a small favorable shift to the home club and an unfavorable one to the visitor. A hostile home crowd can reverse its contribution. Crowd size scales the magnitude; Atlanta's remote stadium typically has less effect. Separately, crowd intensity may increase **variance** around those effects. Important: larger variance alone does not favor the home team, so directional bias and volatility must be distinct parameters.

Fan mood is allowed to produce win-more or lose-more spirals. The game does **not** promise rubber-band comebacks. However, effects should remain bounded, visible in game and chapter reports, and open to a strategic response through roster or transaction decisions. Avoid a hidden fan multiplier so strong that the baseball cards cease to matter.

**Philadelphia — Booing / Yips:** Performance below expectations can produce hostile home support and pressure. Exact triggers and simulated consequences remain provisional.

**Chicago Cubs — Wrigleyville / Home Run Happy Hour:** Every Cubs homer triggers neighborhood happy hour and a bounded boost to crowd hype, regardless of the score. Entertaining sluggers can keep the neighborhood partying through a losing season. The mechanical trigger is spectacle; drunkenness is flavor. This differs from Philadelphia's response to performance below expectations. Boost magnitude, duration, and interaction with ordinary sentiment remain open.

**Cleveland Guardians — Guard the Lead:** An ordinary field with fans who prize pitching and defense. Scoreless home pitching innings build bounded special crowd hype; conceding runs drains it. **Special hype resets each game; ordinary sentiment persists between games.** Effects apply to subsequent play, not retroactively to the inning that earned them. Per-run versus streak-breaking losses of hype, strength, recovery and interactions with two-out/four-out innings remain open.

**Chicago White Sox — Winning Ugly:** An ordinary field where **each run scored without a home run** builds bounded crowd hype. Plate discipline, contact, productive outs and opportunistic baserunning form the build; opponent errors can contribute without being required. The nickname comes from the [1983 White Sox](https://www.mlb.com/cut4/white-sox-will-be-winning-ugly-next-year-with-83-uniforms-and-harold-baines--as-a-racing-mascot/c-41146894); the non-homer reward is a fictional exaggeration. Strength and persistence remain open.

**Los Angeles Dodgers — Beat the Traffic:** An ordinary field with an enormous crowd that arrives gradually, peaks during the middle innings and thins early. A lead keeps more fans around; trailing accelerates departure. The score therefore changes late support around the usual traffic curve. The satire draws on the [early-departure reputation](https://www.mlb.com/news/walk-off-win-picks-up-kenta-maeda-vs-padres). Curve and score sensitivity remain open.

**Dodgers and Yankees — Fair-Weather Fans:** Both franchises have large upside in support when things look good and sharp drop-offs when they disappoint. New York retains the Shortest Porch; only LA has the traffic curve. Exact response strength remains open.

**New York Mets — Subway Spite / New York Bandwagon:** An ordinary field whose special fan buy-in follows **outperforming the Yankees in the standings**. Bandwagon fans exchange Yankees gear for Mets gear when the Mets pull ahead. Winning against any club advances that objective; the perk is not merely a larger head-to-head hype bonus. A player choosing the Mets guarantees Yankees participation. Transfer strength, timing, tie behavior and effects on Yankees support remain open. Whether the Mets exception also forces Yankees participation for an AI Mets club needs an explicit policy consistent with the player-only rivalry guarantee.

**San Diego Padres — Trevor Time:** An ordinary field where home-crowd hype surges when the **designated closer enters to protect a lead**, whoever that closer is. The team should reliably hand its chosen closer a lead to protect. The name recalls the [closer entrance ritual](https://baseballhall.org/hall-of-famers/hoffman-trevor). Trigger details, boost duration and shortened-game interactions remain open.

### 5.5 Full stadium roster and running mechanics ledger

**Agreed direction** records a chosen premise, not calibrated numbers or implemented code. **Working premise** records an established design or conversation-derived candidate still needing discussion. **Open** means no package has been selected; an ordinary field with fan/economic traits is acceptable. Reference venues follow [MLB's ballpark directory](https://www.mlb.com/fans/ballpark-guides); fictional packages do not claim real conditions or policies.

| Franchise | Reference venue | Package / status |
|---|---|---|
| Arizona Diamondbacks | Chase Field | Hot Corner — agreed core; faster ground balls and harder fielding; heat fatigue optional |
| Atlanta Braves | Truist Park | Cherokee Commute — working premise; higher cap, weaker crowd support |
| Athletics | Sutter Health Park | House Always Wins — agreed fictional Vegas identity; low cap, development discount |
| Baltimore Orioles | Oriole Park at Camden Yards | Tight Spending Ceiling — agreed direction; ordinary field, low baseline expectations |
| Boston Red Sox | Fenway Park | Greenest Monster — working premise; exaggerated left-field wall |
| Chicago Cubs | Wrigley Field | Wrigleyville / Home Run Happy Hour — agreed direction; homers drive crowd hype |
| Chicago White Sox | Rate Field | Winning Ugly — agreed direction; non-homer runs build crowd hype |
| Cincinnati Reds | Great American Ball Park | Crosley Cliff — agreed direction; steep outfield terrace rewards range and placement |
| Cleveland Guardians | Progressive Field | Guard the Lead — agreed direction; scoreless innings build special hype, reset each game |
| Colorado Rockies | Coors Field | Mile High-er — working premise; exaggerated elevation |
| Detroit Tigers | Comerica Park | Assembly Line — agreed direction; active original-tier commons boost purchased training gains |
| Houston Astros | Daikin Park | Trash Can Confidential — agreed premise; disclosed home-side information and opposing adaptation cost |
| Kansas City Royals | Kauffman Stadium | Royal Flush — agreed direction; lean initial cap, home-win development cash |
| Los Angeles Angels | Angel Stadium | Locked Payroll / Relocation — agreed direction; move every chapter among fictional perk parks; local attachment resets |
| Los Angeles Dodgers | Dodger Stadium | Beat the Traffic — agreed direction; middle-inning crowd peak, score-dependent departures, fair-weather support |
| Miami Marlins | loanDepot park | Everglades — working premise; slow runners and easier ground-ball fielding |
| Milwaukee Brewers | American Family Field | Seventh-Inning Fermentation — agreed direction; inning-seven power gain and fielding loss for both clubs |
| Minnesota Twins | Target Field | Deep Freeze — agreed direction; cold-driven pitcher endurance, secondary carry effect; visible seasonal calendar |
| New York Mets | Citi Field | Subway Spite / New York Bandwagon — agreed direction; fan buy-in for outperforming Yankees in standings |
| New York Yankees | Yankee Stadium | Shortest Porch — working physical premise; agreed fair-weather fan layer |
| Philadelphia Phillies | Citizens Bank Park | Booing / Yips — working premise; hostile pressure below expectations |
| Pittsburgh Pirates | PNC Park | Farm Team — agreed direction; restrictive cap, active development/sales, once-per-player bonus for Pittsburgh-funded upgrades |
| San Diego Padres | Petco Park | Trevor Time — agreed direction; crowd surge when designated closer protects a lead |
| San Francisco Giants | Oracle Park | Splash Zone — agreed direction; consistent wind toward the Cove |
| Seattle Mariners | T-Mobile Park | Marine Layer — working premise; general carry suppression |
| St. Louis Cardinals | Busch Stadium | Cardinal Way — agreed direction; stronger purchased fielding/baserunning gains |
| Tampa Bay Rays | Tropicana Field | Catwalk Baseball — agreed direction; lower roof, actual ring rulings |
| Texas Rangers | Globe Life Field | Ryan Express — agreed direction; stronger purchased strikeout training |
| Toronto Blue Jays | Rogers Centre | Exchange Rate — agreed direction; development prices and whole-crowd attendance move oppositely |
| Washington Nationals | Nationals Park | Government Shutdown — working premise; chapter funding votes change shared groundskeeping; exact effects open |

**Excluded or superseded directions:** Ivy League as another fielding hazard; Royal Flush as fountain overflow overlapping Miami; Splash Zone as generic carry suppression overlapping Seattle; generic Cubs loyalty as the selected Wrigley premise; Mandatory Hustle as a decree that merely increases steal attempts; literal stone guardians obstructing Cleveland's infield; Detroit's continuity/unchanged-training-program premise; Angels relocation as a league decree rather than franchise-owned movement; free fictional call-ups as the assumed roster guarantee. Royal Flush retains its name for economics, and Splash Zone retains its name for directional wind. The Great Wall remains deferred rather than selected.

Also superseded: Winning Ugly requiring opponent errors or bases-loaded walks; a tourists-only Toronto attendance response; exclusive rivalry pairs for every seeded club; and Mets identity consisting only of a stronger generic rivalry-win boost.

### 5.6 Rivalries: a shared franchise layer

Give franchises their genuine rivalry lists, allowing multiple rivalries and exceptions where none is convincing. Rivalry effects sit alongside existing park, economic and fan packages. **Only the player's club guarantees a rival's participation**: select from its credible shortlist with the run seed and reveal the rival before drafting. Other real rivalries among the selected clubs are recognized naturally. **Player Mets exception:** always include the Yankees for the New York bandwagon package.

Beating a recognized rival gives a bounded crowd-hype payoff that can fuel later support. This is shared by franchises, not an exclusive Mets perk. Rivalry list curation, bonus strength, persistence, loss response and interaction with ordinary fan expectations remain open. Braves–Phillies is a desired rivalry alongside Mets–Yankees; do not manufacture weak pairings merely to fill a schedule. The full network need not be a set of mutually exclusive pairs.

## 6. Modifier schema and resolution

Model a run as a versioned collection of **franchise packages**, **park traits**, **decrees**, and **fan states**. Effects should use a typed, narrow vocabulary rather than executable scripts or unrestricted arbitrary stat keys.

Suggested effect families:

| Family | Example configurable fields | Consumer |
|---|---|---|
| Plate appearance | BB/SO/1B/2B/3B/HR/OUT weights, optional explicit event redistribution | `matchup.ts` / `rates.ts` |
| Contact and environment | estimated exit-velocity, launch-angle and spray distributions; wind vector, air conditions, fence and roof geometry, terrain | Draft contact/flight resolution and fielding |
| Baserunning | speed multiplier, steal-attempt multiplier, steal-success delta, advancement delta | `advancement.ts` / `inning.ts` |
| Fielding | position-aware error-rate multiplier, double-play modifier | `inning.ts` |
| Game rules | regulation innings, outs per half-inning, extra-inning rules, closer-entry window, advancement limits, base route, steal permission, force chains, bunt awards, ring rulings | game/inning rules, workload and win expectancy |
| Pitch and batting position | count thresholds, foul/check-swing rules, legal batting positions and their contact effects | a disclosed pitch/count and positioning model or calibrated abstraction |
| Economy | full-roster salary cap, declared obligations, baseline cap progression, spendable cash, checkpoint payouts, purchase costs and discounts | draft, checkpoint, shop and roster rules |
| Development | upgrade parameters, usage eligibility, original tier, purchased gains, funding provenance and sale-bonus history | player instances, development purchases and transactions |
| Transactions | player ownership, waivers, trade eligibility and two-chapter cooldown | trade/claim state and atomic roster validation |
| Crowd | attendance scale, home/visitor bias, volatility, expectations, event hype, inning/score attendance curves, rivalry response and standings-based buy-in | pregame environment, in-game events and season state |

Each modifier definition should include an immutable ID, display name, satirical description, scope, supported timing, duration, list of typed effects, source/version, and short explanation of what a player should expect. A separate active instance records its start chapter and remaining duration. The run log preserves the IDs and activation times.

Player instances also preserve starting salary, original tier, purchased upgrades and their funding provenance, usage eligibility, trade-cooldown state, and any once-per-run franchise payout record. Upgrades and protection history must follow transfers consistently; waiver behavior remains to be defined. Runtime player instances are separate from immutable historical source profiles and cosmetic presentation.

**Environment resolution order:** (1) historical player profile normalized to the existing common league baseline; (2) home-park conditions; (3) league-wide decree geometry and rules; (4) crowd state; (5) probability normalization and safety clamps; (6) game simulation using that effective environment. Draft Mode contact is resolved through the ball-flight stage in §9.1. Event-driven crowd updates affect subsequent play, not the event that triggered them. Economy affects roster construction, not plate appearances. Do not apply both an outcome multiplier and a physical effect for the same park condition. Conflicting absolute rules, such as two different regulation lengths, need declared priority or rejection—not accidental last-write-wins behavior.

Not every comic premise warrants a simulation effect. Flavor-only stadium jokes are acceptable if the actual mechanical package is disclosed.

## 7. AI general managers

The seven GMs must make **real cube picks** from the packs passed to them. They cannot duplicate cards, inspect unrevealed packs, submit illegal or over-cap rosters, or secretly alter simulation results. Expensive picks can temporarily exceed the prospective roster budget during drafting; bots must account for the post-draft recovery window and final role/salary guarantee. They should be deterministic given the run seed and visible draft history, with small seeded differences in personality.

Start with an explainable scoring heuristic: marginal modeled contribution relative to available replacement; required position or pitching role; scarcity of remaining legal players; salary efficiency including reserves; development value; expected home-park fit; known Commissioner decree; and modest archetype preferences. Prefer cheap precomputed estimates or sample-matchup evaluations over running a complete season for every choice. The selection policy must preserve feasible roster completion and account for bench depth. Transaction policies can price visible role gaps, cap pressure, upgrades and cooldowns as bargaining leverage, while using the same public rules as the human club.

An AI's archetype (contact, power, rotation, defense, running, bullpen value) should influence decisions, **not give its roster free statistical buffs**. Franchise circumstances create another source of preference. Human and AI clubs use the same simulation and public modifier rules.

## 8. Replayability, collecting, and sharing

Every run is seeded, including cube construction, pack ordering, table seating, bot tie-breaks, season scheduling, decrees, franchise venue/funding selections, shop and acquisition offers, and game randomness. Maintain separate random streams or independently seeded games so one added rule check does not accidentally reroll the entire remaining season. Store draft/passing, revenue, development purchases, upgrades, trades, releases, waiver claims, venue changes and Commissioner chronology with exact model/data versions; a seed alone cannot reconstruct a run after player-dependent choices.

The permanent **binder** records discovered player-seasons, favorite finishes, notable performances, and completed roster snapshots. It is cosmetic and historical: previously collected cards do **not** enter a new cube or confer permanent simulated strength. Players can share a final roster, franchise, active decrees, standings, dramatic moments, and a replay seed/action log. A later **daily challenge** may publish one fixed cube and ruleset for everyone, with unlimited practice elsewhere and no attendance pressure. Do not claim tamper-resistant leaderboards without validation infrastructure.

Card imagery continues to respect the current verified-year and licensing pipeline. Missing photos receive designed fallbacks; the game must never invent an athlete likeness or imply image-reuse permission it does not have.

## 9. Simulation and code architecture

**Principle:** preserve Classic's plate-appearance engine and replay contracts. Draft Mode reuses normalized statistical profiles and compatible simulation components, with a separately versioned contact model and configurable environment and orchestration.

- **Classic runner:** keep the existing `simulateSeason` behavior, draft rules, model version, saved drafts, and replays compatible.
- **Game rules object:** supply effective park, decree, crowd, regulation-length, and pitcher-workload settings explicitly to `simulateGame`; avoid global state.
- **League runner:** add a `LeagueSeasonState` containing eight teams and their rosters, a single mutually consistent schedule, standings, rivalry relationships and the player's guaranteed rival, cumulative statistics, pitcher workloads, fans, venue/funding states, active decree, chapter and nine-game checkpoint indices, separate cap/banked-cash accounts, developed player instances, cooldowns/waivers and RNG/replay state.
- **Checkpoint API:** simulate to the next nine-game or chapter boundary, return a state snapshot, reveal incoming chapter rules/venues when applicable, apply validated purchases and transactions, then resume. Do not recompute all 162 games for each checkpoint.
- **Cube draft engine:** a separate pass-the-pack table state with the eight seats, unique card ownership, two-way pack passing, cap-aware legality, bot picks, and an auditable event log.
- **Mode versioning:** a new Draft Mode ruleset/replay schema (for example `cube-v1`) rather than an implicit migration of Classic `pa-v2` results.
- **Development and transaction services:** apply usage-gated purchases, funding records, immutable starting salary/original tier, transfer-persistent upgrades, waiver ownership and trade protection through explicit validated state changes.

Existing entry points likely to change or be wrapped: `src/lib/sim/season.ts`, `game.ts`, `inning.ts`, `matchup.ts`, `workload.ts`, `win-expectancy.ts`, `src/lib/game/draft.ts`, `session.svelte.ts`, and the replay serialization. Existing `scripts/data/opponents.ts` builds 2025 opponents; Draft Mode should instead construct opponents from the other seven cube rosters. Preserve Classic's data compiler and fixed-opponent code path.

Special caution: a seven-inning rule must update *every* nine-inning assumption, not merely stop the outer inning loop. Draft Mode's contact changes must also be reflected in defense valuation, roster pricing, and win expectancy.

Pitch/count, checked-swing and batting-position decrees need a coherent additional model or a disclosed calibrated abstraction. Season strikeout/walk totals do not uniquely recover pitch sequences. Exit velocity, launch angle and spray do not themselves model where a batter stands; box-size changes need an explicit positioning-to-contact link. Changing outs, base routes, forced advancement or scoring awards must update pitcher usage, win expectancy, scoring and game-ending logic consistently.

### 9.1 Estimated contact profiles and ball flight

**Agreed design requirement, not implemented functionality:** Draft Mode models exit velocity, launch angle, spray direction, ball flight, and interactions with venue geometry. These make low roofs, directional wind, tall walls, and carry suppression mechanically distinct.

The current engine samples categorical outcomes directly. Home runs proceed straight to scoring; other contact receives abstract defense resolution with fixed fielder weights. It does not model launch angle, exit velocity, spray, trajectories, wall geometry, or roof collisions. Current acquired inputs are historical season totals and handedness, without measured tracking fields.

For historical player-seasons, **estimated contact profiles are acceptable**. Label estimates explicitly and calibrate their neutral-park results to the existing normalized batting environment. Season totals do not uniquely determine contact distributions; inferred angles and velocities must not be presented as measured historical facts. Profile provenance and model versions belong in replay data. Pitcher contribution must remain calibrated as well.

The proposed contact path is: resolve non-contact events; generate batted-ball speed, angle and direction from the matchup; apply effective air conditions, wind, terrain and geometry; resolve collisions and fielding; determine the resulting hit/out and legal advancement. Flight must help determine the outcome, rather than decorating an already selected home run. Exact distributions, flight equations, fielder movement, collision response, and calibration criteria remain open. The model runs automatically and does not require choosing each batter or playing each plate appearance manually.

Neutral-park validation must preserve intended historical rates. Venue tests must distinguish Seattle's general carry suppression, San Francisco's directional wind, Tampa's ring contacts, and the Boston/Yankees fence geometries. Replay determinism and historical Classic compatibility remain required.

## 10. Delivery stages

**Stage A — Classic stabilization (now).** Complete card/UI work, preserve original replay contracts, lock a simulation baseline, and run existing smoke/calibration suites. No salary or Commissioner mechanics in Classic.

**Stage B — Minimum viable Draft Mode.** Franchise choice; eight-seat pass-the-pack draft; deterministic heuristic AI; a curated cube with a defined per-club role/affordability guarantee; fourteen active slots plus two salary-counted reserves; post-draft roster recovery and salary validation; eight-team 162-game schedule; initial franchise/stadium packages; an opening decree known before drafting; full standings/results. Decide the first slice of flight, development and transaction support explicitly without treating omitted prototype features as abandoned design requirements. Prove that different picks on the same seed produce meaningfully different legal teams. Do not present outcome redistribution as the completed flight model.

**Stage C — The season evolves.** Predictable nine-game development shops; six 27-game chapters with incoming replacement decrees and venue changes revealed before spending; separate cash and cap progression; usage-gated persistent upgrades; fan sentiment, attendance and event-driven hype; supplemental acquisition, eligible trades and waivers; save/resume and transparent reporting. Define a small first playable slice of the expanded design. Decree accumulation remains an optional candidate.

**Stage D — Deeper transactions and metagame.** Richer trade negotiation, AI-to-AI market behavior, deeper franchise asymmetries, permanent binder, shareable reports and seeded daily challenges. Expand complexity where playtests show useful decisions; preserve the agreed basic transaction and development loops.

## 11. Test and balance criteria

- **Integrity:** no duplicate card ownership across rosters, packs or waivers; legal submitted lineups; active-plus-reserve salaries within cap; all 648 scheduled games coherent; each club plays 162 games with 81 home and 81 away; each game has a winner; shared replays reproduce results under the same pinned versions.
- **Meaningful modifiers:** isolated tests demonstrate that each effect moves *the intended observed rate* (steals, errors, HR, strikeouts, workload, game length) in the expected direction. Interactions remain finite and normalized.
- **AI behavior:** bots visibly react to position scarcity, salary, franchise conditions, and known decrees. They do not require perfect play; their decisions must not be random nonsense or hidden cheating.
- **Competitive balance:** across many seeds with common bot policies, franchises have comparable win distributions and none wins predominantly because its stadium/cap package is unconditionally superior. Do not force equality on individual seeds.
- **Strategic depth:** on a controlled pack, at least two plausible picks lead to defensible but different plans. An elite-looking Gem is not automatically correct at every seat and cap state.
- **Narrative quality:** streaks and fan responses produce explainable stories, including disastrous ones, while players retain periodic opportunities to alter their approach.
- **Economy and development:** cash purchases do not implicitly increase cap; cuts grant cap relief without cash; unused reserves cannot develop automatically; purchased gains and provenance survive trades; original-tier eligibility survives development; Pittsburgh cannot collect its special bonus twice for one player. Define and test trade/waiver protection and affordable roster recovery before shipping those systems.
- **Distinct identities:** Minnesota's endurance effect remains distinct from Seattle's carry suppression; Arizona's fast grounders differ from Miami's slow terrain; Cleveland's special hype resets each game while ordinary sentiment persists; Detroit gains purchased-development efficiency rather than direct free ratings.
- **Completed catalog:** White Sox reward non-homer scoring; Reds reward outfield range; Dodgers combine traffic and score-dependent crowd departures; Mets gain buy-in through the standings race with the Yankees; Padres reward closer-led finishes; Cardinals improve purchased fundamentals; Rangers improve purchased strikeout training; Toronto couples development prices to whole-crowd attendance. Verify intended directions rather than treating these as unexplained overall-rating buffs.
- **Rule consistency:** inning length, outs, pitch counts, base routes, runners, bunts, force chains and scoring awards update the corresponding workload, expectancy and ending logic. Seven-inning games and late-inning fermentation need an explicit interaction policy.
- **Performance:** the extra 648-game league computation and modifier resolution must be measured on ordinary phones; avoid hot-loop allocations and unnecessarily repeated matchup-table construction.

## 12. Open decisions for playtesting

1. **Draft size:** Is two waves of eight picks enough to cover fourteen active roles plus two reserves without repetitive forced picks? Adjust the number of picks, not the bullpen granularity, if the puzzle is too constrained.
2. **Salary and revenue:** All rostered cards count toward cap. Calibrate starting prices, franchise constraints and the gentle cap ramp independently from banked spendable cash, payout formulas and development prices. Cash carries throughout the run. Starting salaries persist through upgrades; repricing exceptions remain open.
3. **Initial roster guarantee and recovery:** Guarantee role coverage and affordability through pack-contained commons in a contested cube. Specify post-draft trades/cuts/waivers, rather than assuming a free replacement pool or merely a viable path.
4. **Information and selection:** The opening decree precedes drafting; later decrees precede chapter decisions. Define future schedule disclosure and seeded-random versus reactive decree selection.
5. **Fan influence:** Calibrate roster-strength expectation scalars, attendance growth, packed-stadium hype, directional bias and volatility. Define persistence and bounds while preserving runaway streaks and Wrigleyville's spectacle-driven exception.
6. **Pitcher abstraction:** Retain one composite BP and one closer rather than drafting ten relievers. Revisit the three-starter/54-start schedule only when it materially affects strategic variety.
7. **Identity and satire:** Establish the commissioner's final name and tone. All thirty franchises now have premises; normal fields with fan/economic identities remain valid. Include brief sourced baseball history when discussing real references behind the satire.
8. **Contact model:** Define and calibrate estimated speed/angle/spray profiles, matchup contributions, flight and collision resolution, and integration with fielding. Keep measured and estimated provenance explicit.
9. **Royal Flush accounting:** Home-win rewards are banked development cash. Define payout size, credit cadence and ceiling. Payroll follows the general cap ramp; rewards do not add a separate cap-growth rule.
10. **Decree semantics:** Define Singles Appreciation Night's advancement unit and HR/forced-runner behavior; designated-runner multiplicity; pitch/count and check-swing rules; batting-position effects; bunt awards; reverse routes and altered outs. Keep both batter's-box candidates in the selected twenty-item catalog. The Great Wall is deferred; Dynamic Lineup and decree accumulation remain outside default rules.
11. **Development and nine-game shops:** Define upgrade families, size/limits, playing-time eligibility by role, persistence, offers, payouts, purchase limits, lineup/call-up permissions and coincident chapter/shop ordering. Do not assume a post-season shop.
12. **Trading and waivers:** Define multi-player trades, offers, AI-to-AI behavior, preseason cooldowns, waiver priority/timing, release/reclaim protection and atomic roster legality. Chapter trades have a two-chapter per-player cooldown.
13. **Pittsburgh and Detroit:** Calibrate Pittsburgh-funded, once-per-player sale bonuses and the retained-core/active-sale balance. Define whether Detroit's commons-count training gains affect all recipients or only commons, middle tiers and snapshot timing.
14. **Angels venues and payroll:** Design the small fictional park pool; define venue selection/repetition, starting park, return-visit attachment, and payroll timing alongside the cap ramp. Physical perks affect both clubs; local attachment resets on relocation.
15. **Other franchise branches:** Define Washington funding votes and groundskeeping, optional Arizona fatigue, Houston's automatic information/adaptation effect, Minnesota's visible seasonal strength, and Milwaukee's shortened-game interaction.
16. **Franchise and rivalry details:** Curate genuine rivalry shortlists and calibrate their shared hype response. The player alone guarantees a seeded rival, revealed before drafting; player Mets always include Yankees. Resolve AI Mets seeding explicitly. Define Mets transfer timing/ties, Dodgers departure curves, Toronto state selection, Reds terrain and the specialized training/closer triggers. Do not reopen these agreed premises as empty catalog slots.
17. **Delivery scope:** Reconcile the full economy/development/transaction design with a small first playable Draft slice after Classic stabilizes. Preserve accepted requirements when staging their implementation.

## 13. Discussion continuation

Continue in **small clusters of related, independent questions**, each with a concrete recommended answer. Settle prerequisites before asking dependent questions. Keep each entry's status explicit; agreed directions still need numerical calibration. Do not reopen accepted premises without new evidence or a requested change. Include brief, sourced real baseball history behind references when useful.

The full franchise premise catalog is filled. Latest decisions: **Rangers — Ryan Express** improves purchased strikeout training; **Royal Flush pays development cash**; **unspent cash carries throughout the run** while cap remains a separate payroll allowance. All recent fan, terrain, fundamentals and rivalry choices are recorded in §5. Rivalry is a shared layer; the Mets' own package tracks the standings battle for New York rather than only head-to-head wins.

The next cluster can resolve the development-shop menu, Detroit's training recipients and purchase limits. Those choices are still open; proposed answers are not settled rules. Then continue the remaining mechanical branches in §12, including Angels parks, fan persistence, rivalry lists and transaction details. The opening decree's pre-draft visibility is settled; resume schedule disclosure, selection policy and the twenty decree candidates when returning to Commissioner design.

This is a design discussion, not an implementation request. No Draft Mode mechanic in this document should be described as implemented solely because its premise is agreed. Update this document with settled decisions and explicit open branches as discussion continues; no periodic message monitoring is requested.

---

**North-star test:** Two people draft at the same eight-seat table under the same commissioner and stadium rules, make different defensible picks, and finish with different baseball stories. Neither story should feel predetermined by which player opened the shiniest card.
