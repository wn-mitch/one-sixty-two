# Shared simulation model

**Status:** Authoritative semantics; numerical algorithms and tolerances remain open unless explicitly marked as a contract.

## 1. Scope and invariant

Classic and Draft Mode use one versioned simulation engine. A mode supplies a roster, ruleset, schedule context, and effective environment; the engine resolves games with the same event semantics. Classic keeps its existing roster-building and fixed-opponent structure while adopting the shared model. Draft supplies eight drafted clubs and its own orchestration, economics, and season state. No legacy engine, compatibility shim, or migration path is required for this pre-release design.

The model must preserve a legible causal chain:

`historical profile -> matchup event -> contact profile -> flight/environment -> interception/fielding -> legal advancement/scoring -> workload and expectancy updates`.

A categorical result must not be chosen first and then decorated with flight data. Non-contact events may resolve directly; batted-ball events require contact generation, flight, geometry/collision handling, and fielding before the final out/hit/base result.

## 2. Inputs and provenance

Every simulation run pins:

- shared model version;
- player/profile data version and source identifiers;
- ruleset version;
- park/environment configuration version;
- run seed and stream derivation policy;
- mode-specific configuration.

A historical player-season is an immutable source profile. Its common-league normalization, inferred contact fields, pitcher contribution, and calibration transform are separate records with provenance. Estimated exit velocity, launch angle, and spray are **estimates**, not measured historical facts, and their display/reporting must say so. If a profile is inferred from totals or handedness, retain the inference method and version. Measured data, where available, must not be silently mixed with estimates.

A runtime player instance may add explicitly modeled development changes, but it must retain the source profile, initial salary/tier outside this system, current skill values, and development provenance. Development is a counterfactual input to the profile; it must not rewrite the historical source or erase the neutral calibration record. Draft orchestration owns the instance lifecycle and funding provenance; this model consumes the resulting effective profile.

Pitchers require equivalent provenance. A hitter calibration that preserves batting rates while allowing pitcher effects to collapse into league average is insufficient. Matchup calibration must retain meaningful pitcher differences, including the composite bullpen and closer abstractions used by the current roster model.

## 3. Typed narrow effect vocabulary

Effects are immutable definitions with an ID, display description, source/version, scope, supported timing, duration, typed fields, and expected observables. Runtime activation records the start context and duration. Effects are data, not executable callbacks, arbitrary property bags, or hidden AI information.

The shared consumers are:

| Effect family | Narrow fields (examples) | Consumer |
|---|---|---|
| Plate appearance | named BB, HBP, SO, 1B, 2B, 3B, HR, OUT weights or an explicit redistribution | matchup/event resolver |
| Contact/environment | estimated speed, launch angle, spray distribution; air, wind vector, terrain, fence, roof geometry | contact/flight/fielding |
| Baserunning | speed, attempt, success, advancement deltas | advancement/rules |
| Fielding | position-aware reach/error and double-play parameters | interception/fielding |
| Game rules | regulation innings, outs, extra innings, closer-entry window, advancement, routes, steals, forces, bunts, ring rulings | inning/game/workload/expectancy |
| Pitch/count/position | count thresholds, foul/check-swing rules, legal batting position and its contact link | pitch/count/position model |
| Crowd | attendance, home/visitor directional bias, volatility, expectations, event hype and score/inning response | environment and subsequent play |

Economy, roster, transactions, and development lifecycle are Draft-owned effects. They affect selection, legality, or profile inputs, not plate appearances through an unexplained global multiplier. A package that cannot name its consumer and observed output is flavor until specified.

## 4. Composition and resolution order

Composition precedes event physics. The engine constructs an effective environment for a game/half-inning/plate appearance from pinned inputs in this order:

1. **Historical normalization:** resolve immutable player profiles into the supported neutral common-league baseline.
2. **Effective park:** load the game's home venue with explicit geometry, air/wind/terrain and roof fields. Classic's player chooses a home park before the first draft roll; scheduling selects the venue for each game. Draft may change venues at declared chapter boundaries. Physical conditions affect both teams at the active venue.
3. **League rules/decree:** apply applicable rule geometry and legal event semantics. Conflicting absolute rules (for example, two regulation lengths) require declared priority or rejection, never accidental last-write-wins.
4. **Team-owned and crowd state:** apply declared team-owned strategic effects and current crowd state to their typed consumers. Crowd changes caused by an event affect subsequent play, not that triggering event.
5. **Normalization and safety:** normalize probabilities, enforce bounds, and reject unsupported combinations with an explicit diagnostic.
6. **Event physics:** resolve the event using the effective environment, then update legal game state, workload, expectancy, and event-driven state.

A physical park cause has one authoritative application point. For example, a tall fence changes the trajectory/fence intersection; it must not also receive a hidden HR-rate multiplier. A directional wind changes flight vector; it must not also be applied as a second spray bonus. A carry-suppression condition changes air/flight; its observed rate movement is validation evidence, not another runtime effect. Explicitly independent effects may compose when they have different consumers (e.g., a terrain change to ground-ball travel and a separate runner-speed rule).

## 5. Contact and event semantics

Resolve non-contact events (walk, HBP, strikeout, and any future pitch/count result) through the matchup model. For batted contact:

1. sample contact speed, launch angle, and spray direction from batter/pitcher matchup distributions and the declared contact context;
2. integrate explicit air, wind, and terrain inputs with the ball path;
3. intersect the path with fence, roof, wall, ring, or terrain geometry;
4. if the ball remains playable, calculate interception location and time;
5. resolve position-aware fielding, catch/error/throw, then legal runner advancement;
6. update score, outs, bases, pitcher workload, win expectancy, and crowd state in that order where each is applicable.

The initial flight model is not required to be full real-world aerodynamics. It is required to make park geometry, directional wind, roof collisions, and carry conditions causally distinct and deterministic. Estimated profiles are acceptable when provenance and neutral calibration are visible.

## 6. Defense and fielding

Fielding begins from positional starting points, not continuously simulated moving agents or pathfinding. Given a ball's interception location and time, the model estimates whether the responsible defender can reach it using position, range, reaction/arrival time, and context. It then resolves catch, miss/error, and throw/force consequences with position-aware parameters. Ground-ball travel/interception is a separate path from airborne flight; a ground ball does not become a continuous agent simulation.

The model must preserve defensive distinctions in neutral validation. A profile's defensive value cannot be inferred only from team-average outs. Contact changes must feed defense valuation and downstream player/team valuation; a park that changes reachable balls must not be valued only as a batting multiplier.

## 7. Pitcher calibration, workload, and expectancy

Pitcher effects are part of the matchup and calibration contract. The model must preserve intended differences among hitters, pitchers, and defenders under neutral conditions and after contact/flight integration. Composite bullpen and closer roles remain valid inputs; the model does not require a ten-reliever roster.

Workload consumes the actual game rules: regulation length, outs per half-inning, extra-inning policy, closer-entry windows, and any selected unusual rule. Win expectancy uses the same legal state and event probabilities as the game resolver. A seven-inning decree, altered outs, base routes, awards, or scoring cannot be a presentation-only change; workload, ending logic, scoring, and expectancy must agree. Rule changes that depend on pitch sequences require a later pitch/count abstraction rather than pretending season totals uniquely recover sequences.

## 8. Deterministic random streams and replay

Seeded determinism applies within a supported model/data/rules version. Derive independent named streams for at least game ordering, plate-appearance/matchup sampling, contact/flight, fielding, and crowd/state transitions (the exact stream registry remains an implementation decision). Stream derivation must be stable and explicit so adding a diagnostic or a later independent check does not reroll unrelated events. Persist action choices and pinned versions; a seed alone is not sufficient when player-dependent choices exist.

The same inputs and versions must reproduce the same event log, final game state, standings/statistics, and reports. Unsupported versions or malformed provenance are rejected explicitly. Breaking old saves, replay links, schemas, and seeded results is permitted under the pre-release product policy.

## 9. Valuation and downstream consumers

Neutral profile calibration is not a license to hide model changes from pricing or strategy. Draft Mode's salary/roster valuation, defense valuation, and win-expectancy tooling must consume the same effective outputs that games consume, with the relevant park/rules context named. A cheap precomputed estimate may be used for draft decisions; it must identify its approximation and model version. Rebalancing a player price from outcomes produced by an obsolete or categorical-only path is invalid.

The Draft system owns salary, economy, modifiers lifecycle, and orchestration. This model owns the simulation quantities those systems read: event distributions, expected runs/wins, workload, defensive contribution, and environment-specific outcomes. A franchise package may alter a typed simulation parameter, but its lifecycle and disclosure remain outside this directory.

## 10. Runtime and phone constraints

The target includes ordinary phones. Measure full-season and league workloads on representative phone hardware, not only development machines. Avoid per-plate-appearance allocations, repeated rebuilding of identical matchup tables, and recomputation of completed games at checkpoints. Precompute immutable normalized profiles and reusable geometry where valid; keep runtime instances small and explicit. Any approximation must be documented with its error/coverage evidence rather than silently reducing physical distinctions.

Performance evidence must report device class, build/configuration, seed/workload, wall time, memory/high-water behavior where measurable, and whether results are bit-for-bit deterministic. Numerical tolerance targets remain phase decisions; this document does not approve thresholds.
