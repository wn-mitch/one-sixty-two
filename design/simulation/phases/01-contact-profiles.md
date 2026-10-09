# Proposed phase 01 — Contact profiles

**Status:** PROPOSED plan; no numerical algorithm or tolerance is approved here.

## Purpose and usable result

Establish a versioned, provenance-preserving contact/profile layer that Classic can use before flight is promoted. The usable result is a deterministic neutral matchup resolver that produces labeled estimated exit velocity, launch angle, spray direction, and non-contact event inputs while preserving meaningful hitter and pitcher differences. It is a profile fixture and calibration surface, not yet the complete park/fielding simulation.

## Dependencies

- Existing normalized historical player-season data and common 2025 batting environment.
- The shared model contract in [`../model.md`](../model.md).
- Validation evidence conventions in [`../validation.md`](../validation.md).
- No Draft economy, cube, catalog, or franchise package is required.

## In scope

1. Define immutable source-profile and derived-profile records with source/data/model versions and measured-versus-estimated labels.
2. Define the matchup inputs for hitter, pitcher, handedness, current development state where present, and neutral context.
3. Define a deterministic named stream for profile sampling, independent from later flight/fielding streams.
4. Produce contact-profile samples plus BB/HBP/SO and other non-contact event inputs using a narrow typed interface.
5. Establish neutral calibration targets and the fitting procedure, preserving meaningful hitter/pitcher differences in contact and non-contact inputs. Final hit-type calibration requires phase 02's flight/fielding resolver and is validated end to end in phase 03.
6. Record calibration transforms without rewriting source facts; expose diagnostics when provenance is missing or unsupported.
7. Specify the profile outputs consumed by defense valuation, win expectancy, and Draft valuation, while leaving their orchestration to owning systems.

## Required open decisions before acceptance

- The exact inference algorithm/distribution family for speed, launch angle, and spray from historical totals/handedness.
- Which data sources qualify as measured, and how mixed measured/estimated fields are combined.
- Calibration metrics, sample sizes, neutral reference windows, and numerical tolerances.
- How pitcher contribution is decomposed between non-contact event rates and contact distributions.
- How development changes alter a derived profile without calibrating away the counterfactual gain.
- The supported profile version schema and stream registry names.

These are named gates, not invitations to hide defaults in code. Until resolved, profiles remain estimated and the unresolved fields cannot be reported as historical measurements.

## Evidence required

- Neutral controlled samples for multiple distinct hitters and pitchers, including handedness matchups, with provenance shown in diagnostics/replay.
- Aggregate BB/HBP/SO/contact rates that meet the approved phase tolerances, plus evidence that profile distinctions survive rather than collapsing to league average.
- Distribution reports for estimated speed/angle/spray labeled as estimates.
- Determinism reruns with the same pinned versions and independent stream checks.
- Downstream fixture showing that defense valuation and win expectancy consume the new contact outputs or are explicitly blocked from promotion until they do.
- Phone measurement for profile lookup/sampling workload and memory behavior.

## Deferred requirements

Flight equations, fence/roof/terrain geometry, interception and fielding, full park effects, weather generation, Draft packages/economy, and unusual pitch/count/check-swing/batting-position rules. Phase 01 may expose interfaces for them but must not fake their behavior with final-outcome multipliers.

## Exit gate

Promote a deterministic, provenance-labelled profile sampler with accepted input-distribution and non-contact calibration evidence, plus explicit targets for flight-derived outcomes. Estimated inputs do not become measured historical facts after this gate. Final 1B/2B/3B/HR/OUT calibration remains dependent on phases 02 and 03; this phase must not fake those outcomes or require their completed implementation.
