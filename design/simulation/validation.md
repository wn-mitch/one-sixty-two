# Simulation validation and evidence

**Status:** Authoritative evidence contract. Numeric tolerances are explicit decisions for the relevant phase; this document does not invent approvals.

Validation must test causal behavior, calibration, provenance, determinism, downstream valuation, and runtime. A green aggregate batting line is not sufficient: the model must show that the intended hitter, pitcher, defender, park, and rule distinctions survive the pipeline.

## 1. Evidence packet

Every accepted model/fixture version records:

- model, data, ruleset, geometry, and environment versions;
- seed and named random-stream derivation;
- source/provenance classification for each estimated or measured field;
- controlled fixture inputs and expected direction of change;
- observed output distributions and uncertainty summary;
- the chosen tolerance, if one has been approved for that phase, or an explicit unresolved decision;
- device/build/configuration and runtime/memory measurements;
- known limitations and deferred interactions.

“Estimated” means inferred from historical totals or another proxy. “Measured” means sourced from a verified measurement. Neither label may be omitted from replay or diagnostic output.

## 2. Calibration evidence

### Neutral batting and pitching

Run neutral-park controlled seasons or plate-appearance samples with park effects, crowd effects, and Draft modifiers disabled. Compare the normalized profile outputs with intended historical/reference rates for BB, HBP, SO, 1B, 2B, 3B, HR, and OUT, plus steals/advancement where relevant. Preserve meaningful differences among hitter profiles and pitcher profiles; matching league aggregate alone is a failure of evidence.

For contact profiles, report distributions and derived outputs for estimated exit velocity, launch angle, and spray. Do not claim they are measured historical distributions. Show that profile provenance and model version flow into the output/replay record. Pitcher calibration must be rerun after contact/flight changes, not assumed to remain valid.

Numerical acceptance bands remain an open phase decision. Each phase must choose and document its metric, sample size, tolerance, and rationale before claiming acceptance.

### Defense and valuation

Use controlled defender profiles and starting positions to demonstrate differences in reach, catch/error, and throw/force results. Ground-ball travel/interception must be measured separately from airborne flight. Compare downstream defensive contribution and Draft valuation/win-expectancy inputs before and after a contact-model change; no consumer may continue using stale categorical hit assumptions while the game uses flight.

Valuation evidence should include replacement-context outputs, not only raw player rates. If an approximation is used for Draft decisions, report its model version and error against the shared resolver.

## 3. Flight and park evidence

Fixtures must exercise the initial Classic park contract:

- ordinary fence geometry;
- tall/directional fence geometry;
- directional wind;
- general air/carry suppression;
- roof/overhead collision and legal ruling;
- terrain/ground-ball travel;
- home and away teams under the same active venue.

For each fixture, report the causal path from sampled contact to trajectory/intersection to fielding/legal result. A test that only compares final HR counts cannot distinguish a physical effect from a hidden multiplier. Prove that flight can change the final result after contact has been sampled.

Effects with distinct causes must remain distinguishable: directional wind is not generic carry suppression; fence geometry is not a HR-rate multiplier; roof collisions are not ordinary outs. Exact tolerances and collision-rate targets remain phase decisions.

## 4. Composition and double-counting evidence

Create isolated and combined tests for profile normalization, park geometry, wind/air, league rules, crowd, and any team-owned effect. Assert the declared resolution order: normalization, park, rules, crowd/team state, probability normalization/safety, event physics. Event-driven state changes must begin on the subsequent play.

For each physical park cause, demonstrate one application point. Compare a geometry-only path with any legacy/categorical factor source and remove or disable duplicate application. Conflicting absolute rules must fail with an explicit diagnostic or use a declared priority; silent last-write-wins is not acceptable.

## 5. Rules, workload, and expectancy evidence

A selected rule fixture must update all dependent state consistently: inning/outs, game-ending logic, scoring, pitcher workload, and win expectancy. Test altered regulation lengths, outs, base routes, forced advancement, steals, sacrifices, ring rulings, and scoring awards only once their semantics are approved in the rule-extension phase. A seven-inning result that merely truncates the outer inning loop is invalid.

Pitch/count, check-swing, and batting-position candidates require a disclosed sequence model or calibrated abstraction before dependent decrees can be accepted. Season totals alone are not evidence that pitch sequences were reconstructed.

## 6. Determinism and provenance evidence

Given identical pinned inputs and supported versions, rerun the same game/season and compare event logs, final state, statistics, standings, and report values. Exercise independent random streams by inserting diagnostics or a later independent check; unrelated streams must remain unchanged according to the stream contract. Test malformed/unsupported versions and missing provenance: reject explicitly rather than silently substituting defaults.

A replay record must be sufficient with its action log and pinned data/model versions; a seed by itself is not considered sufficient for player-dependent choices. Cross-release compatibility is not required under the pre-release product contract.

## 7. Classic integration evidence

Before the draft-first playable depends on the shared model, exercise choosing a home stadium from the whole reference deck before the first draft roll, then complete a seeded Classic season with the current roster/opponent structure. Verify deterministic results, calibration, meaningful defense, home/away venue routing, workload, win expectancy, and reporting. Historical seeded results need not match prior releases.

This gate requires the full ordinary reference stadium deck, not the complete fictional Draft franchise catalog, salary system, Commissioner catalog, or season adaptation. The shared engine must work end to end without a separate Classic implementation.

## 8. Runtime/phone evidence

Measure representative game and full-season workloads on ordinary phone hardware. Include Classic's full season and the future Draft eight-team/648-game league workload when the relevant runner exists. Record device/build/configuration, wall time, allocations or high-water memory when measurable, and whether reruns are bit-for-bit reproducible.

The hot path must avoid per-event avoidable allocation, repeated immutable matchup-table construction, and replaying completed games at checkpoints. Runtime targets are decisions to be made with the phase owner; this file requires measurement and named acceptance bounds rather than guessing them.

## 9. Evidence matrix

| Capability | Minimum evidence | Gate |
|---|---|---|
| Contact profiles | provenance-labeled distributions; neutral hitter/pitcher calibration; deterministic samples | Phase 01 |
| Flight/fielding | controlled trajectory and interception fixtures; geometry/collision distinctions; defender differences | Phase 02 |
| Classic adoption | complete season, fixed park, workload/expectancy consistency, replay reproduction | Phase 03 |
| Rule extensions | approved subset semantics plus dependent workload/scoring/expectancy evidence | Phase 04 |
| Weather inputs | explicit later weather contract and isolated interaction evidence | Phase 05 |
| Phone runtime | device/build/workload report for each promoted capability | Every phase |

A phase may leave a numerical tolerance unresolved only by naming that decision as open and keeping the capability out of the accepted implementation gate. It must not imply a passing result without measured evidence.
