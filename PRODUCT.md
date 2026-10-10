# Product

## Register

product

## Release and Compatibility Policy

The game is pre-release. Iteration takes priority over backward compatibility. Breaking existing saves, replay links, schemas, data formats, and seeded simulation results is allowed when changing the game or simulation. Do not retain legacy engines, add compatibility shims or migrations, or delay changes to preserve obsolete contracts unless explicitly requested.

Version the current contracts and reject incompatible data explicitly rather than silently interpreting it under different rules. Determinism is required within the same supported model and data version, not across releases. Breaking compatibility does not excuse regressions in current intended behavior.

## Users

Baseball fans drafting on phones while watching a game, then inspecting and sharing the simulated season. Desktop users need the same complete flow, not a separate dashboard.

## Product Purpose

Draft fourteen exact historical selections into a legal roster and challenge a deterministic 162-game season: nine hitters, three starters, one closer, and one historical team-season bullpen remainder. Choices, real identities, and credible baseball results are the product. Original decade-styled baseball cards make exact seasons comparable and collected picks recognizable, without misrepresenting photo years or inventing ratings. Results retell the season through factual totals, every game box, role-specific ranks, participant-wide awards, app-estimated realized value, and the biggest positive and negative plays from a clearly labelled neutral league-rate win-expectancy estimate.

## Brand Personality

Competitive, recognizable, playful. Broadcast clarity rather than casino spectacle or software-dashboard polish.

## Anti-references

Brown or sepia surfaces, generic SaaS cards, copied sports artwork, fabricated player faces, misleading historical photo labels, forced portrait orientation, and truncated seasons that hide losses.

## Design Principles

- Keep the next pick obvious and the collected roster visible.
- Let real team identity and player imagery carry personality.
- Distinguish the drafted season from the photo's verified year.
- Preserve the complete game and determinism during visual changes. Simulation and schema changes follow the pre-release compatibility policy above; no specific model or replay version is frozen.
- Keep modeled probabilities distinct from observed scores and traditional baseball facts.
- Treat missing imagery as a designed state, not a reason to block play.

## Current Product Surfaces

Home leads with a real-profile card wall, an eight-era strip, and all thirty franchise marks. Field, staff, and Results-hand cards use the canonical eight compact plates at a 72px minimum; full candidate and award cards keep the complete era artwork. User-controlled ambient motion is shared by Home and Results, pauses when hidden or offscreen, and yields immediately to the operating system's reduced-motion preference.

Hitter fronts show historical WAR/162, OPS, and a position-specific pre-season `DEF est.`; assigned DH keeps HR, and pitchers keep historical WAR/162, ERA, and SO. Historical WAR/162 controls list order and cosmetic finish, while separate defensive evidence can affect play. Results inspection clearly separates the actual historical season from the simulated 162-0 season and the app's realized `sim-war-v2` estimate.

Completed seasons are saved in a device-local library (`/seasons`). Any two current-version replay links can meet in a deterministic best-of-five head-to-head series (`/h2h`) that recomputes both seasons for seeding; a series is shared as a link and never stored on the server.

Sharing publishes scorecard, diamond, and wide PNGs only after a trusted server validates the current authoritative action history, pins the current assets, and deterministically recomputes the season. A local preview is not presented as the stored publication. Links are released only when all three immutable images exist; preparation errors preserve the replay and leave an explicit retry or download/copy alternative.

## Accessibility & Inclusion

WCAG AA text and control contrast, visible keyboard focus, labelled scrolling tables, at least 44px primary touch targets, textual win/loss indicators, and reduced-motion support. A single Motion toggle persists the on/off preference when storage is available and remains usable for the session when it is not. Motion amount and speed are fixed; the operating system's reduced-motion preference always overrides the toggle. No audio or external analytics.
