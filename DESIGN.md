# Design

## Direction

Broadcast across the complete game: start, draft, lineup, simulation, results, and rules. A baseball fan uses a phone in a dim room during an evening broadcast, so the surface stays dark but uses cool charcoal and slate, not warm brown. Crisp cool-white type and recognizable team identity provide contrast.

## References

ESPN broadcast scorebugs for condensed score hierarchy and clear game states; MLB The Show roster presentation for player identity, portraits, and compact comparison. Borrow composition principles, not proprietary layouts or artwork.

## Color Strategy

Restrained global palette with purposeful franchise-colour identity panels. Define OKLCH background, surface, raised surface, text, muted text, primary action, focus, error, success, and border roles. No brown or sepia in the interface palette. Team colours identify the current roll and opponent, not every control. Verify contrast in the rendered browser.

## Typography and Composition

System sans for interface labels, body, controls, and scoreboard-style results. Exact-season card artwork follows the supplied eight decade-specific fronts and backs at 5:7, using self-hosted Barlow Condensed and Roboto Serif. The selected season determines the clamped decade, never the photograph year. Card dimensions and text fitting scale with width; names may wrap but never truncate, ellipsize, or stretch horizontally. Team marks remain labelled historical or current-franchise identity. Fronts show the represented role's WAR/162, OPS/HR or ERA/SO; inspection backs disclose full historical facts, position games, model limitations, source, and licence. Counts flagged as estimated or incomplete render —, while model notes retain approximation disclosures. No copied manufacturer layouts, fabricated faces, fake aging, or decorative thick side stripes.

Card stock, kraft, masks, and printed trim retain the supplied era compositions. Team grounds use the published franchise colour; stock is the secondary colour because the runtime manifest publishes no second team colour. Normal text roles reach 4.5:1 and the 1970s headline reaches 3:1. When neither paper nor ink reaches 4.5:1 on a team ground, adjust the stronger foreground toward white or black without changing that ground. Raised photo placeholders retain their striped ground and use an ink that reaches 4.5:1 against both the ground and its light stripe.

Base, Foil, Foil + emboss, and Gem are fixed cosmetic finishes. Hitter/starter WAR/162 cut points are 2, 4, and 6; closer cut points are 0.5, 1.5, and 2.5. An individual two-way season uses the higher finite WAR across both roles independently of the front's represented role. Bullpen units and wholly unavailable WAR use Base. Finishes never alter drafting or simulation inputs. Verified-media selection and labelled failures remain authoritative; no mockup assets substitute for runtime media.

## Imagery

Use free reusable sources first, retaining per-file source, credit, licence, and verified capture-year metadata. Prefer photos from the selected year; otherwise choose the nearest verified photo from the player's playing career and show its actual year. No current-photo-as-historical claim. No fabricated faces. Missing images receive an intentional no-photo treatment. Current franchise marks must not be presented as verified historical marks. Copyright status and trademark restrictions are distinct.

## Interaction and Responsive Behaviour

Keep permanent exact-season picks, qualification-aware search and filtering, lineup controls, local resume, worker computation, all 162 game details, sharing, and retries. Fielding/DH assignment changes use inline labelled Move/Swap controls with reciprocal qualifications and completion checks; pitching uses rotation order. Phone layout prioritizes the next pick and compact expandable roster; desktop retains the roster rail. The interim roster pairs real miniature era fronts with readable names, exact years, assigned slots, and inspection controls.

Candidate cards use a one-column phone grid, at least 17rem per wider-grid column and at most 24rem per card. Exact-season selectors, qualification/availability messaging, and Choose remain outside the artwork. Artwork and the equivalent visible Inspect card control open a native modal without selecting or drafting. Focus begins at Turn over; closing or Escape returns it to the trigger. If the inspected card is removed, focus returns to the surviving roster summary or candidate results. The front retains its artwork, while the inspection back expands to readable width and type. Details reveals normal-size supplemental provenance, credit/licence/evidence links, model notes, and bullpen membership/exclusion disclosure. One shared ranking load per draft data version serves all cards, with explicit retry available after failure; unavailable enrichment never disables drafting.

Mouse and pen tilt cards under a fixed directional light; touch does not tilt. Explicit turns lift through the flip, and search/qualification filters and sort changes fade departures, reposition survivors, then reveal entrants. Ranking arrival is a reorder; exact-season changes and pagination replace content immediately. Animate only transforms and opacity, with no idle motion. Reduced motion removes tilt and transitions and swaps the semantic face instantly. Chosen year, legal slot radios, and Draft remain together in the persistent dock. Start/Roll/Simulate and result records stay ahead of atmosphere photography. Season highlight and lowlight cards follow sharing, remain concise on phones, and label neutral league-rate win expectancy separately from factual play and final-score copy. Tables scroll only inside labelled regions. Retain keyboard phase focus.

## Verification

Inspect actual start, draft with imagery, selected season, lineup, simulation, results, game details, and image credits on phone, landscape, and desktop. Exercise real drafts and identical replay scores. Image failures must not block or alter gameplay. Native image-generation probes and north-star mocks are skipped because this harness has no native image-generation capability; actual browser evidence is required.
