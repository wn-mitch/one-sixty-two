# Draft validation and balance

These are required observable behaviors, not reports of passing tests. Phase documents select the relevant gates; completion requires every applicable invariant, not only compilation or unit coverage. Shared contact calibration and physical venue checks belong to [simulation validation](../simulation/validation.md).

- **Integrity:** no duplicate card ownership across rosters, packs or waivers; legal submitted lineups; active-plus-reserve salaries within cap; all 648 scheduled games coherent; each club plays 162 games with 81 home and 81 away; each game has a winner; shared replays reproduce results under the same pinned versions.
- **Meaningful modifiers:** isolated tests demonstrate that each effect moves *the intended observed rate* (steals, errors, HR, strikeouts, workload, game length) in the expected direction. Interactions remain finite and normalized.
- **AI behavior:** bots visibly react to position scarcity, salary, franchise conditions, and known decrees. They do not require perfect play; their decisions must not be random nonsense or hidden cheating.
- **Competitive balance:** across many seeds with common bot policies, franchises have comparable win distributions and none wins predominantly because its stadium/cap package is unconditionally superior. Do not force equality on individual seeds.
- **Strategic depth:** on a controlled pack, at least two plausible picks lead to defensible but different plans. An elite-looking Gem is not automatically correct at every seat and cap state.
- **Narrative quality:** streaks and fan responses produce explainable stories, including disastrous ones, while players retain periodic opportunities to alter their approach.
- **Economy and development:** segment income respects the minimum, attendance revenue and win-only performance bonus; Royal Flush adds home-win cash. Paid reserve training works without game appearances; no automatic reserve growth is assumed. Basic prices match across recipients before declared franchise modifiers; gains diminish with the trained skill, not whole-card rarity. Enforce one purchase per player per visit. Cash, fixed salaries, original-tier identity and funding history remain distinct; Pittsburgh's special bonus cannot repeat for one player.
- **Opening recovery and transfers:** cleanup can repair missing roles and budget failures with unique historical commons for every club. Cuts free cap without cash. Upgrades, provenance and original protection deadlines survive release/claim cycles. Define and test allocation, transaction ordering and legality before shipping those systems.
- **Distinct identities:** Minnesota's endurance effect remains distinct from Seattle's carry suppression; Arizona's fast grounders differ from Miami's slow terrain; Cleveland's special hype resets each game while ordinary sentiment persists; Detroit gains purchased-development efficiency rather than direct free ratings.
- **Completed catalog:** White Sox reward non-homer scoring; Reds reward outfield range; Dodgers combine traffic and score-dependent crowd departures; Mets gain buy-in through the standings race with the Yankees; Padres reward closer-led finishes; Cardinals improve purchased fundamentals; Rangers improve purchased strikeout training; Toronto couples development prices to whole-crowd attendance. Verify intended directions rather than treating these as unexplained overall-rating buffs.
- **Rule consistency:** inning length, outs, pitch counts, base routes, runners, bunts, force chains and scoring awards update the corresponding workload, expectancy and ending logic. Seven-inning games and late-inning fermentation need an explicit interaction policy.
- **Performance:** the extra 648-game league computation and modifier resolution must be measured on ordinary phones; avoid hot-loop allocations and unnecessarily repeated matchup-table construction.

## Playable milestone evidence

For [draft-first](phases/03-league-playable.md), exercise a real human draft through opening recovery, run the whole coherent league, inspect results and resume the supported run state. Compare different human choices under the same initial seed without forcing identical outcomes.

For [season evolution](phases/04-season-evolution.md), cross coincident nine-game/chapter boundaries, reveal new conditions before spending, make a purchase and transaction, and observe their consequences in subsequent games. Test budget failures, ownership collisions and release/claim protection independently of the happy path.

Numerical balance tolerances and representative phone runtime limits remain explicit decisions to set before acceptance, not fabricated passing claims.
