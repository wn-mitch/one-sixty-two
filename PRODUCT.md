# Product

## Register

product

## Release and Compatibility Policy

The game is pre-release. Iteration takes priority over backward compatibility. Breaking replay links, schemas, data formats, and seeded simulation results is allowed when changing the game or simulation. Do not retain legacy engines, add compatibility shims, or delay changes to preserve obsolete contracts unless explicitly requested.

The player's device data is the exception: the season library, head-to-head history, collection, and the draft in progress live in a versioned SQLite database on the device, and every change to its schema ships as a migration that keeps existing records. A migration preserves records, not gameplay: a season saved under an older model stays viewable as history, and a draft from older rules is still rejected.

Version the current contracts and reject incompatible data explicitly rather than silently interpreting it under different rules. Determinism is required within the same supported model and data version, not across releases. Breaking compatibility does not excuse regressions in current intended behavior.

## Users

Baseball fans drafting on phones while watching a game, then inspecting and sharing the simulated season. Desktop users need the same complete flow, not a separate dashboard.

## Product Purpose

Draft sixteen exact historical selections into a legal roster and challenge a deterministic 162-game season: nine hitters, three starters, one closer, and three named relievers. Choices, real identities, and credible baseball results are the product. Original decade-styled baseball cards make exact seasons comparable and collected picks recognizable, without misrepresenting photo years or inventing ratings. Results retell the season through factual totals, every game box, role-specific ranks, participant-wide awards, app-estimated realized value, and the biggest positive and negative plays from a clearly labelled neutral league-rate win-expectancy estimate.

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

Home leads with a compact real-profile card wall, the question Can you go 162-0?, Build my team, and How to play, then an eight-era strip and all thirty franchise marks. Field, staff, and Results-hand cards use the canonical eight compact plates at a 72px minimum; full candidate and award cards keep the complete era artwork. Full fronts drift at rest; compacts, roster miniatures, thumbnails, backs and captures do not. Ambient motion pauses when hidden or offscreen and yields immediately to the operating system's reduced-motion preference.

Hitter fronts show historical WAR/162, OPS, and a position-specific pre-season `DEF est.`; assigned DH keeps HR, and pitchers keep historical WAR/162, ERA, and SO. Historical WAR/162 controls list order and cosmetic finish, while separate defensive evidence can affect play. Results inspection clearly separates the actual historical season from the simulated 162-0 season and the app's realized `sim-war-v2` estimate.

Completed seasons are saved in a device-local library, My teams (`/seasons`), and every card the player rosters joins a device-local collection (`/collection`) where it earns cosmetic stickers that also show on that card in later drafts. Completing an own season earns a token (the device's first completed season earns one bonus token) for cosmetic finishes in the Shop (`/shop`) and per-era choices in the card factory (`/factory`); tokens cannot be bought. Draft Mode is developer-only until finished. Any two current-version replay links can meet in a deterministic best-of-five head-to-head series (`/h2h`) that recomputes both seasons for seeding; a series is shared as a link and never stored on the server.

Sharing publishes two 1080×1920 PNGs, a field layout and a four-by-four full-card layout, plus a 1200×630 Open Graph preview. The player's browser draws them from its own season. The server checks the replay's shape and versions and the images' formats and sizes, then stores them immutably; it does not recompute the season, so a published record is trusted, not verified. Recipients recompute the season from the replay. A local preview is not presented as the stored publication. Links are released only after the images are stored; preparation errors preserve the replay and leave an explicit retry or download/copy alternative.

## Accessibility & Inclusion

WCAG AA text and control contrast, visible keyboard focus, labelled scrolling tables, at least 44px primary touch targets, textual win/loss indicators, and reduced-motion support. A single Motion toggle persists the on/off preference when storage is available and remains usable for the session when it is not. Motion amount and speed are fixed; the operating system's reduced-motion preference always overrides the toggle. No audio or external analytics.
