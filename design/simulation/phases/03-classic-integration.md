# Proposed phase 03 — Classic integration

**Status:** PROPOSED plan; this is the shared-model promotion gate, not an approval of a new Classic ruleset.

## Purpose and usable result

Prove the shared simulation end to end in Classic before the draft-first playable depends on it. A player can choose a stadium card from the whole ordinary reference deck before the first draft roll, build the existing Classic roster, and complete a calibrated season against fixed opponents using the new engine. Each franchise has one reference configuration; home and away games use the correct venue. Pre-release seeded results may change; no legacy engine or compatibility shim is required.

## Dependencies

- Phase 01 accepted contact profiles.
- Phase 02 accepted flight/fielding path.
- Classic's current data compiler, roster/opponent construction, season/game/inning/workload/win-expectancy boundaries.
- Park selection contract in [`../ballparks.md`](../ballparks.md) and evidence contract in [`../validation.md`](../validation.md).

## In scope

1. Route Classic through the shared engine with explicit game rules and effective environment inputs; remove the need for a separate legacy simulation path.
2. Provide the full thirty-franchise stadium-card deck, pin the player's home choice before the first franchise-and-decade roll, and route every game through its home venue for both clubs. The venue consumes no player slot and grants no additional perk beyond its physical properties.
3. Preserve Classic's existing 14-selection roster structure, fixed 2025 opponents, 162-game structure, and supported game rules while replacing categorical contact/fielding resolution.
4. Integrate contact/flight results with advancement, scoring, pitcher usage/workload, defense valuation, and win expectancy.
5. Pin model/data/rules/park/environment versions and named random streams in replay/action history.
6. Measure complete-season runtime on ordinary phone hardware and avoid recomputing finished games at checkpoints or rebuilding immutable matchup data unnecessarily.
7. Make unsupported later features explicit: no salary, Draft economy, Commissioner decree catalog, or Draft franchise package is introduced by this phase.

## Required open decisions before acceptance

- Source and simplify the reference geometry/conditions for each franchise; define provenance and acceptable geometry error.
- Stadium-card artwork, comparison information and selection interaction, following the existing interface conventions without inventing gameplay bonuses.
- Integration adapter boundaries and state serialization schema for the current Classic runner.
- Full-season calibration sample, acceptable season-level rate drift, and numerical tolerances.
- Workload/expectancy comparison methodology after shared contact and fielding changes.
- Runtime, memory, and deterministic replay acceptance bounds on target phone hardware.
- Policy for any current Classic event that phase 01/02 intentionally rejects as unsupported.

These decisions are gates. They must not be solved by retaining an invisible old engine or silently substituting categorical outcomes.

## Evidence required

- A complete seeded Classic season produces valid game/season state, standings/statistics, legal winners, and report output.
- Neutral and reference-park calibration evidence meets the approved metrics while preserving hitter, pitcher, and defender distinctions.
- A player selects from the whole reference deck before any franchise-and-decade roll; selection survives current-version resume/replay, consumes no player slot, and home/away routing uses the correct venue symmetrically.
- Controlled ordinary-fence, directional-wind, and roof/collision fixtures execute in the same engine path used by the season.
- Workload, game ending, scoring, and win expectancy agree with the Classic rules supplied to the engine.
- Replay reruns reproduce event log/final state under pinned versions; unsupported versions are rejected.
- Defense and downstream valuation reflect flight/fielding changes rather than stale categorical hit assumptions.
- Phone full-season measurement reports wall time, memory/allocation behavior where measurable, configuration, seed, and reproducibility.

## Deferred requirements

Draft cube/orchestration, salaries/cash, eight-team league schedule, cleanup, fictional franchise catalog/packages, fan economy, season adaptation, variable weather, and later unusual rules. The ordinary reference stadium deck is required here. Pitch/count, checked-swing, and batting-position rules remain in phase 04; unrelated Draft decrees do not block Classic integration.

## Exit gate

Classic is promoted only after one complete season passes the validation evidence matrix with shared code-path proof, deterministic replay, calibration, park routing, defense/expectancy consistency, and phone runtime evidence. Draft-first work may then consume the engine; it may not fork a second contact/flight implementation.
