# Design

## Direction

Broadcast across the complete game: start, draft, lineup, simulation, results, and rules. A baseball fan uses a phone in a dim room during an evening broadcast, so the surface stays dark but uses cool charcoal and slate, not warm brown. Crisp cool-white type and recognizable team identity provide contrast.

## References

ESPN broadcast scorebugs for condensed score hierarchy and clear game states; MLB The Show roster presentation for player identity, portraits, and compact comparison. Borrow composition principles, not proprietary layouts or artwork.

## Color Strategy

Restrained global palette with purposeful franchise-colour identity panels. Define OKLCH background, surface, raised surface, text, muted text, primary action, focus, error, success, and border roles. No brown or sepia. Team colours identify the current roll and opponent, not every control. Verify contrast in the rendered browser.

## Typography and Composition

System sans for labels, body, controls, and tabular stats. Compact scoreboard-style result hierarchy. Original exact-season baseball cards use cool print stock and eight decade-specific framing/name treatments, derived from the selected season rather than photograph year. A serif name is limited to the 1950s treatment. Team marks remain labelled historical or current-franchise identity. Fronts prioritize exact year, identity, qualifications, photo year, and comparison stats; backs disclose full historical facts, model limitations, source and licence. No copied manufacturer layouts, rarity tiers, fabricated faces, fake aging, metallic effects, or decorative thick side stripes.

## Imagery

Use free reusable sources first, retaining per-file source, credit, licence, and verified capture-year metadata. Prefer photos from the selected year; otherwise choose the nearest verified photo from the player's playing career and show its actual year. No current-photo-as-historical claim. No fabricated faces. Missing images receive an intentional no-photo treatment. Current franchise marks must not be presented as verified historical marks. Copyright status and trademark restrictions are distinct.

## Interaction and Responsive Behaviour

Keep permanent exact-season picks, qualification-aware search and filtering, lineup controls, local resume, worker computation, all 162 game details, sharing, and retries. Fielding/DH assignment changes use inline labelled Move/Swap controls with reciprocal qualifications and completion checks; pitching uses rotation order. Phone layout prioritizes the next pick and compact expandable roster; desktop retains the roster rail. Candidate cards use a one-column phone grid, at least 17rem per wider-grid column and at most 24rem per card. Details/Front changes the semantic face immediately, retaining disclosure focus and exact-year selection. Chosen year, legal slot radios, and Draft remain together in the persistent dock. Start/Roll/Simulate and result records stay ahead of atmosphere photography. Season highlight and lowlight cards follow sharing, remain concise on phones, and label neutral league-rate win expectancy separately from factual play and final-score copy. Tables scroll only inside labelled regions. Respect reduced motion and keyboard phase focus.

## Verification

Inspect actual start, draft with imagery, selected season, lineup, simulation, results, game details, and image credits on phone, landscape, and desktop. Exercise real drafts and identical replay scores. Image failures must not block or alter gameplay. Native image-generation probes and north-star mocks are skipped because this harness has no native image-generation capability; actual browser evidence is required.
