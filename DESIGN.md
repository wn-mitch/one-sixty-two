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

Permanent exact-season picks, qualification-aware browsing, local resume, lineup order, worker simulation, all 162 game details, sharing, and retries remain available. DraftBoard owns transient candidate selection, exact-season choices, placement previews, movement, and inspection. Selecting a candidate highlights engine-approved empty destinations; a single destination previews automatically but never commits. A field preview identifies the full player, exact season, and destination. Only explicit Draft confirms a permanent pick. Back clears the destination; Cancel selection or sheet dismissal clears transient state without changing the roll or roster. A failed session mutation retains the preview and exposes its error inside the sheet.

The persistent wide field uses the 440×488 diamond coordinate space with miniature original card fronts and a separate SP1/SP2/SP3/CL/BP row. Selecting a committed hitter suspends the candidate preview and highlights only engine-approved moves or reciprocal swaps. These assignments apply immediately, preserving the current roll and any unaffected legal candidate destination. Pitching tiles inspect rather than reassign; rotation order stays in the lineup editor. Inspection never replaces a pending candidate. After fourteen picks the existing lineup editor takes over.

Wide mode starts at 1100px, or 1024px in landscape, with a 480px right rail and 32px gap. The candidate grid has two columns below 1360px and three above. Narrow browsing has two columns below 375px, three through 767px, and five on portrait tablets. Narrow grid gaps are 10px horizontal and 14px vertical; wide gaps are 28px and 36px. Phone/tablet portrait cards retain compact year/qualification text; labelled native exact-season selects live in the field sheet. Desktop selects and qualification controls sit outside the artwork. Resizing transfers the same pending exact season and destination between the rail and native modal sheet without a mutation.

The bottom-anchored field sheet has a pinned identity/season/tab header and confirmation footer, a scrolling central panel, safe-area padding, native focus containment, and a locked background. Field and Card back tabs support arrow-key navigation. Escape, backdrop, and Close field dismiss without a pick and return focus to the activating card. Cancel move and Back to field focus the field heading; an unchanged candidate retains its Text version and Details disclosures during roster inspection. A roster-only sheet opens from the draft toolbar. The wide rail scrolls internally on short viewports so confirmation remains reachable.

Card reverses always use the selected season's original decade design at 5:7, up to 330px on phone and 410px on tablet/desktop. Desktop candidates turn in place, span two grid columns, and expose one reverse at a time. Outside pointer/focus closes only the reverse, not placement. Text version separately exposes complete historical facts, including both two-way statistical families; Details exposes source, credit, licence/evidence links, model notes, and bullpen membership/exclusion facts. Source cues in the artwork focus that details region. Lineup/results and wide roster inspection use the same designed backs and disclosures inside the native card dialog. Optional ranking/media enrichment never disables a legal pick; ranking arrival does not reset exact-season choices.

Mouse and pen tilt cards under a fixed directional light; touch does not tilt. Explicit turns lift through the flip; search/qualification filters and sorting fade departures, reposition survivors, then reveal entrants. Ranking arrival reorders without clearing selection; exact-season changes and pagination replace content directly. Animate transforms and opacity, never width or grid layout. Reduced motion removes tilt and transitions and swaps the semantic face instantly. Start and results retain atmosphere imagery; the draft uses a compact real-team-colour roll banner. Season turning points distinguish estimated neutral league-rate win expectancy from factual play and scores. Tables scroll only inside labelled regions, and route phases retain keyboard focus targets.

## Verification

Inspect actual start, draft with imagery, selected season, lineup, simulation, results, game details, and image credits on phone, landscape, and desktop. Exercise real drafts and identical replay scores. Image failures must not block or alter gameplay. Native image-generation probes and north-star mocks are skipped because this harness has no native image-generation capability; actual browser evidence is required.
