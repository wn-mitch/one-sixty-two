# Proposed phase 02 — Flight and fielding

**Status:** PROPOSED plan; physical equations, collision algorithms, and numerical tolerances remain decisions.

## Purpose and usable result

Make batted-ball flight and position-aware fielding determine outcomes rather than decorate a categorical hit. The usable result is a deterministic game-event path from phase-01 contact profile through explicit air/wind/terrain and geometry to interception, catch/error/throw, and legal advancement. It must work with a fixed reference environment before the full stadium catalog or Draft season exists.

## Dependencies

- Accepted phase-01 profile/provenance contract.
- Shared semantics in [`../model.md`](../model.md), park contract in [`../ballparks.md`](../ballparks.md), and evidence rules in [`../validation.md`](../validation.md).
- A fixed reference geometry fixture; weather generation is not a dependency.

## In scope

1. Define the coordinate/unit conventions and versioned environment input for explicit air, fixed wind vector, terrain, fences, walls, roofs, and legal overhead/ring categories.
2. Generate and integrate a trajectory from sampled speed, angle, and spray; allow geometry intersections to change final outcomes.
3. Distinguish ordinary/tall/directional fences, directional wind, general carry/air conditions, and roof collisions.
4. Resolve ground-ball travel/interception separately from airborne flight.
5. Resolve fielding from positional starting points plus interception location/time and defender range; model catch, miss/error, throw, force, and double-play consequences without continuous moving agents/pathfinding.
6. Ensure the active home park affects both teams and that away routing uses the opponent's park.
7. Feed resulting outcomes into advancement, workload, win expectancy, and defense valuation using the same event truth.
8. Maintain independent deterministic streams for flight and fielding and preserve event-level provenance/version diagnostics.

## Required open decisions before acceptance

- Flight approximation and integration step/representation suitable for phone runtime.
- How estimated profiles map to trajectory uncertainty and how uncertainty is sampled.
- Geometry resolution, wall/fence intersection, roof/ring deflection, and dead-ball categories.
- Ground-surface/travel representation and when the ground path hands off to fielding.
- Interception/reach equation, defender positioning defaults, throw model, and error/double-play semantics.
- Calibration fixtures, sample sizes, accepted numerical tolerances, and runtime bounds.

No unresolved decision may be disguised as a generic HR/OUT multiplier. A simplified path is acceptable only when it retains causal geometry and has measured error evidence.

## Evidence required

- Controlled contact fixtures where the same sampled ball changes outcome under ordinary versus tall/directional fence geometry.
- Wind vector fixtures that alter direction-dependent outcomes distinctly from general carry suppression.
- Roof/overhead collision fixtures exercising each selected legal ruling; if ring rules are not selected, reject the unsupported fixture explicitly.
- Ground-ball fixtures showing surface/travel changes through interception, not airborne flight.
- Defender fixtures showing position, interception time, range, catches, errors, throws, and double-play effects.
- Both-club symmetry fixture: the home park condition is applied to visiting and home teams without carrying the away park.
- Cross-consumer fixture showing final events update defense valuation and win expectancy; no stale categorical path remains.
- Deterministic replay and phone runtime evidence, including allocation behavior in the hot path.

## Deferred requirements

The entire thirty-park catalog, Draft package lifecycle, generated weather, crowd evolution, full pitch/count/check-swing/batting-position model, and selected unusual decrees. Fixed explicit air/wind inputs are required now; dynamic weather mechanics are not.

## Exit gate

Promote only when the final result can be traced from contact sample through flight/geometry/interception/fielding, controlled fixtures demonstrate distinct park causes, both teams receive the active venue, and calibration/determinism/runtime evidence is accepted with named tolerances. A flight renderer layered over preselected categorical outcomes does not pass.
