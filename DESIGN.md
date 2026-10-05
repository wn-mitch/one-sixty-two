# Design

## Direction

Broadcast across the complete game: start, draft, lineup, simulation, results, and rules. A baseball fan uses a phone in a dim room during an evening broadcast, so the surface stays dark but uses cool charcoal and slate, not warm brown. Crisp cool-white type and recognizable team identity provide contrast.

## References

ESPN broadcast scorebugs for condensed score hierarchy and clear game states; MLB The Show roster presentation for player identity, portraits, and compact comparison. Borrow composition principles, not proprietary layouts or artwork.

## Color Strategy

Restrained global palette with purposeful franchise-colour identity panels. Define OKLCH background, surface, raised surface, text, muted text, primary action, focus, error, success, and border roles. No brown or sepia. Team colours identify the current roll and opponent, not every control. Verify contrast in the rendered browser.

## Typography and Composition

System sans for labels, body, and stats; tabular numerals. Compact scoreboard-style result hierarchy. Team marks lead the franchise reveal. Player photos accompany season comparison rows. The completed roster reads as a collected lineup, with clear positional and batting/starting order. No nested decorative card shells.

## Imagery

Use free reusable sources first, retaining per-file source, credit, licence, and verified capture-year metadata. Prefer photos from the selected year; otherwise choose the nearest verified photo from the player's playing career and show its actual year. No current-photo-as-historical claim. No fabricated faces. Missing images receive an intentional no-photo treatment. Current franchise marks must not be presented as verified historical marks. Copyright status and trademark restrictions are distinct.

## Interaction and Responsive Behaviour

Keep all existing draft rules, permanent picks, search and filtering, lineup controls, local resume, worker computation, all 162 game details, sharing, and retry states. Phone layout prioritizes the next pick and compact expandable roster; desktop retains the roster rail. Selecting a season must never insert a full-height panel between the season list and the action that completes the pick: chosen year, legal slot radios, and the Draft button stay together in a persistent dock while the season list stays scrollable behind it. Tables scroll only inside labelled regions. Respect reduced motion and keyboard phase focus.

## Verification

Inspect actual start, draft with imagery, selected season, lineup, simulation, results, game details, and image credits on phone, landscape, and desktop. Exercise real drafts and identical replay scores. Image failures must not block or alter gameplay. Native image-generation probes and north-star mocks are skipped because this harness has no native image-generation capability; actual browser evidence is required.
