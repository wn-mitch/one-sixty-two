# Ballparks and the initial Classic contract

**Status:** Authoritative selection and environment contract. Numerical geometry, distributions, and full catalog tuning remain open decisions.

## 1. What a park means

A park is a versioned home-game environment, not a player card, roster slot, or cosmetic finish. A park may provide ordinary real geometry or a declared physical condition. Its physical conditions are local to that venue and normally apply symmetrically to both clubs on the field. A team-owned economy, fan, or strategic package is a separate input and must not be smuggled into the park geometry.

This file owns the ordinary Classic stadium catalog and the simulation contract every venue must satisfy. The [Draft catalog](../draft-mode/catalog.md) owns fictional park packages, franchise perks, and relocation venues; those are not prerequisites for Classic stadium selection.

## 2. Initial Classic selection contract

Before the first franchise-and-decade draft roll, the player chooses a home stadium from the **whole deck of stadium cards**. All thirty franchise reference venues are available; the choice is not a random hand, unlock, or player-roster pick. Pin the chosen stadium and its version in the run state before player drafting starts.

Use **one fixed reference configuration per franchise aligned with the 2025 opponent environment**, not a historical venue chosen from a drafted player's season. Home games use the selected stadium; away games use the opponent's reference venue. The full ordinary reference deck is required for Classic integration; a smaller set of controlled fixtures is sufficient while developing flight and fielding.

The stadium card describes the physical field rather than granting an additional stat bonus. It does not consume one of the fourteen player selections or add Draft franchise economics, crowd perks, or roster restrictions. Detailed front/back composition, artwork, and comparison controls remain interface design work, not settled requirements here.

For each scheduled game:

- the home team's selected/reference venue is the active park;
- the visiting team plays in that home park, not in its own venue;
- the active park affects both teams on the field;
- venue selection does not consume a player slot or card;
- the away club does not carry its own physical conditions into the game;
- the active park and environment version are pinned in the game/replay input.

A Draft run later selects a player's home franchise before drafting and may construct other venues under the Draft contract. Draft orchestration owns that selection and disclosure. The shared engine receives an already selected home park and does not decide franchise economics, card ownership, or catalog presentation.

## 3. Required environment fields

A park configuration must distinguish, at minimum:

- field and fence geometry by direction/height, including relevant foul/overhead boundaries;
- roof or overhead-object geometry and its legal collision/ruling category;
- explicit air inputs and explicit wind vector inputs, even when fixed for the initial fixture;
- terrain/surface and ground-ball travel/interception parameters where applicable;
- versioned coordinate conventions and units;
- provenance: real geometry source, estimated value, fictional exaggeration, or calibration transform;
- legal park rulings for special structures (for example, catwalk/ring outcomes) when selected;
- neutral/default values for fields not used by the park.

Initial Classic conditions are fixed reference conditions, not generated weather. Explicit air/wind inputs support controlled physics tests and later Draft effects without requiring a seasonal weather generator. Variable weather belongs to [the later weather phase](phases/05-weather.md).

## 4. Geometry determines outcomes

A trajectory is resolved against the active geometry. A potential home run can become a wall contact, catchable ball, roof/ring event, or another legal result based on flight and intersection. Do not choose HR/2B/OUT first and then apply park factors. Do not apply both a physical geometry effect and a final outcome multiplier for the same park cause.

Initial distinct-behavior fixtures must demonstrate:

- ordinary fence geometry versus an exaggerated directional/tall fence;
- a directional wind vector changing paths differently from general carry suppression;
- overhead/roof collisions using declared legal outcomes;
- ground-ball surface changes using ground travel/interception rather than airborne flight;
- both clubs receiving the same physical venue condition in a game.

The fixture may use the agreed Catwalk Baseball legal categories if that venue is included: fair contact with upper A/B rings can be caught for an out; fair contact with lower C/D rings is a home run; a ball lodged on an upper ring is a double; contact with an overhead object over foul territory is dead. Geometry, collision frequency, and deflection algorithm remain open and must be versioned when decided.

## 5. Reference conditions and calibration boundary

Initial Classic park conditions are fixed and explicit. They are not a generated weather system, and they are not a second copy of historical park factors. Historical player profiles are normalized to the common neutral baseline first; reference park geometry/environment is then applied. Existing conventional park-factor normalization must not be unknowingly counted again as a fantasy physical effect.

The reference fixture must identify which effects are measured geometry, estimated geometry, or fictional test geometry. An estimate is acceptable only when labeled and calibrated against observed outputs. A real venue's geometry may be simplified for runtime, but the simplification and its accepted error evidence must be named rather than implied.

## 6. Acceptance evidence for a selected park

A park configuration is ready for the Classic fixture only when evidence shows:

1. the player can choose any stadium in the whole reference deck before the first franchise-and-decade draft roll, and the choice is pinned in the run state;
2. home and away routing uses the same active venue for both clubs;
3. no player slot/card is consumed by park selection;
4. trajectory/geometry changes final outcomes in controlled fixtures;
5. directional wind, general air/carry, fence geometry, and roof collisions are distinguishable;
6. the result is reproducible under the pinned model/data/environment versions;
7. the park does not double count an equivalent categorical multiplier;
8. runtime remains measurable on an ordinary phone workload.

Exact numerical tolerances, collision frequencies, and acceptable runtime bounds are phase-gated decisions in [`validation.md`](validation.md), not approvals hidden in this contract.

## 7. Deferred boundaries

Variable weather belongs to the shared simulation's [later weather phase](phases/05-weather.md). The [Draft catalog](../draft-mode/catalog.md) owns fictional venues, relocation pools, crowd/economic packages and franchise premises. Pitch/count, checked-swing, batting-position and unusual baseball-rule semantics are later prerequisite work for the content that requires them, not blanket prerequisites for the Classic stadium deck.
