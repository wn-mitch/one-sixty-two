# Proposed phase 05 — Variable weather

**Status:** PROPOSED sequencing plan. Weather mechanics are intentionally not defined here.

## Purpose and usable result

Add variable weather through the existing explicit air/wind inputs after Classic integration. The usable result is a real season in which a disclosed, reproducible weather policy varies conditions and changes flight or other approved consumers. An input interface alone is not completion. Variable weather is accepted later scope; variables, generation/authorship, timing and presentation must be decided before implementation.

## Dependencies

- Phase 01 accepted provenance/calibration layer.
- Phase 02 accepted flight/fielding and explicit air/wind interface.
- Phase 03 complete Classic integration and runtime baseline.
- Phase 04 only where a selected rule changes weather-relevant legal behavior; no general rule dependency.
- Park contract in [`../ballparks.md`](../ballparks.md) and validation contract in [`../validation.md`](../validation.md).

## In scope

1. Specify and implement the chosen weather policy and its timing rather than stopping at an input boundary.
2. Keep permanent park geometry distinct from varying conditions; reuse the air/wind inputs established for fixed conditions.
3. Persist the actual weather sequence and necessary seed/version information for current-version resume and replay.
4. Show players the conditions and any approved forecast information without presenting uncertainty as measured fact.
5. Exercise the weather policy across a real season and demonstrate intended physical consequences without duplicate outcome multipliers.
6. Measure runtime and state-size costs on representative phone workloads.

## Required open decisions before acceptance

- Weather variables, sources, ranges, temporal/spatial granularity, and whether values are authored, seeded, or generated.
- How weather composes with permanent park geometry, fixed reference air conditions, terrain, roof state, and directional wind.
- Whether weather is selected before a game, at a chapter boundary, or by another disclosed schedule.
- Calibration fixtures, numerical tolerances, display language, and player-facing uncertainty.
- Stream registry, replay schema, save/resume behavior, and phone performance bounds.
- Policy for weather interactions with selected unusual rules and crowd state.

This phase MUST NOT fill the gaps with invented mechanics or a generic “weather multiplier.” Unresolved choices are explicit gates.

## Evidence required

- A complete season uses the approved varying-weather policy, produces distinct physical outcomes in controlled comparisons, and reproduces the same conditions/results on resume and replay.
- Isolated weather fixtures show only the approved environment fields change; permanent park geometry remains distinct.
- Combined fixtures demonstrate one application point for wind/air/flight and no double-counted final-outcome multiplier.
- Home/away symmetry remains correct for any weather attached to the active park/game environment.
- Calibration evidence reports intended direction and approved tolerance without claiming a numerical approval before the decision is made.
- Determinism and save/resume evidence covers weather stream inputs.
- Phone runtime/state-size report identifies cost relative to the phase-03 baseline.

## Deferred requirements

No particular weather variables, generator, forecast UI, cadence, or balance numbers are approved here. Resolve those choices before this phase starts; do not omit the usable weather behavior and call an interface complete. Initial Classic and Draft milestones proceed with fixed conditions independently of this later phase.

## Exit gate

Promote weather only after its inputs, provenance, composition, calibration, replay, and runtime bounds are explicitly decided and evidenced. Until then, use the fixed explicit environment fields from the park contract and keep weather generation out of the simulation.
