# Proposed phase 04 — Rule extensions

**Status:** PROPOSED plan; rule semantics and numerical effects remain open until gated.

## Purpose and usable result

Add the prerequisite rule abstractions needed for later Commissioner decrees without turning every unusual rule into a prerequisite for the initial Draft-first playable milestone. The usable result is a versioned, disclosed subset of altered baseball rules whose event semantics, workload, scoring, game-ending logic, and win expectancy agree. Unselected or dependent decrees remain unavailable rather than silently approximated.

The initial draft does **not** wait for the entire unusual-rule catalog. A selected initial decree may depend on the relevant subset only. For example, an inning-length rule can be promoted when regulation-length/workload semantics are accepted; it must not be blocked by an unrelated checked-swing rule. Conversely, a selected decree that changes pitch counts cannot ship on season totals alone.

## Dependencies

- Phase 03 shared engine proven in Classic.
- Phase 01 profile and phase 02 flight/fielding semantics.
- Rule-consumer boundaries in [`../model.md`](../model.md) and evidence in [`../validation.md`](../validation.md).
- Draft orchestration's opening-decree disclosure and ruleset selection, owned outside this directory.

## In scope

1. Define a versioned game-rules object with declared priority/rejection for conflicting absolute rules.
2. Add the smallest coherent pitch/count abstraction needed by an approved decree; preserve provenance and disclose when it is a calibrated abstraction rather than reconstructed historical pitches.
3. Define checked-swing semantics and batting-position/contact link only when a decree selects them; box geometry cannot claim an effect without that link.
4. Define selected unusual-rule subsets for altered regulation innings/outs, base routes, advancement limits, steals, force chains, bunt awards, reverse routes, designated runner, or ring rulings as applicable.
5. Update game ending, scoring, pitcher workload, closer-entry timing, win expectancy, and reports together for each accepted rule.
6. Make rule effects typed and narrow, composed before event physics, deterministic, bounded, and visible to the player/AI through the disclosed ruleset.
7. Permit initial Draft integration with a selected subset while leaving other catalog items gated independently.

## Required open decisions before each selected rule is accepted

- Exact legal event semantics: counts, fouls, check swings, batting-position effects, outs, force chains, runner identities, base routes, advancement units, HR/extra-base treatment, bunt/sacrifice awards, and extra-inning behavior.
- Whether the rule uses a pitch/count model or an explicit calibrated abstraction, and its calibration metrics/tolerances.
- Priority/rejection behavior when two rules alter the same absolute field.
- Workload, closer-entry, expectancy, scoring, and game-ending consequences.
- Interaction with flight/fielding, crowd state, and any park ruling.
- Scope and timing: Classic, initial Draft, or later season-adaptation milestone.

The catalog remains a separate authority. This phase defines gates, not a promise that every candidate is implemented.

## Evidence required

- For each promoted rule, executable semantic fixtures cover ordinary and boundary cases, including bases, outs, runners, scoring, and game end.
- Altered-length/outs fixtures demonstrate consistent workload and win expectancy, not only a truncated outer loop.
- Pitch/count/check-swing/position fixtures show the chosen abstraction is disclosed, deterministic, and calibrated against its intended observables; no claim of historical pitch reconstruction is made without data.
- Flight/fielding interaction fixtures show rule changes alter legal consequences without bypassing the shared event physics.
- Conflicting-rule fixtures reject or apply the declared priority; no accidental last-write-wins behavior.
- Stream/replay fixtures reproduce events under pinned ruleset/model versions.
- A selected initial Draft decree can run without requiring unrelated unselected rule families.
- Phone runtime evidence covers the promoted subset and reports any hot-loop cost.

## Deferred requirements

The full twenty-item decree catalog, decree accumulation, dynamic lineup, every unusual rule's semantics, reactive decree selection, and all future season-adaptation content. A rule may remain a catalog candidate while its prerequisite subset is unresolved. Weather generation is phase 05, not a hidden rule effect.

## Exit gate

Promote rule-by-rule. A selected decree is usable only when its relevant semantics and dependent consumers have evidence. The initial Draft milestone may proceed with a smaller accepted subset; it must not globally block on unrelated rule extensions, and it must not silently run an unsupported rule.
