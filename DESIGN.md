# Design

## Direction

Broadcast across the complete game: start, draft, lineup, simulation, results, and rules. A baseball fan uses a phone in a dim room during an evening broadcast, so the surface stays dark but uses cool charcoal and slate, not warm brown. Crisp cool-white type and recognizable team identity provide contrast.

This is a product interface, not a marketing dashboard. The next legal choice, the exact historical season, and the collected roster take priority over decoration. Drafting is dense; start and results have room for atmosphere. Preserve the complete game across screen sizes rather than maintaining separate mobile and desktop products.

## References

ESPN broadcast scorebugs for condensed score hierarchy and clear game states; MLB The Show roster presentation for player identity, portraits, and compact comparison. Borrow composition principles, not proprietary layouts or artwork.

The supplied draft references establish the compact desktop composition and cards-only narrow browsing. Treat their layout as reference, not their demo data or simplified eligibility logic. Production cards, engine legality, full identities, source disclosures, and keyboard behavior remain authoritative.

## Color Strategy

Restrained global palette with purposeful franchise-colour identity panels. The shared interface tokens live in `src/routes/layout.css`; card-specific colour roles live in `src/lib/cards/tokens.ts`. Reuse these roles instead of adding local approximations.

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `oklch(16% 0.009 255)` | Page and compact draft header |
| `--surface` | `oklch(21% 0.012 255)` | Field panel, input ground, secondary controls |
| `--surface-raised` | `oklch(27% 0.016 255)` | Raised controls, sheet header, loading placeholders |
| `--surface-hover` | `oklch(32% 0.018 255)` | Enabled control hover |
| `--text` | `oklch(97% 0.006 255)` | Primary copy and selected filter grounds |
| `--muted` | `oklch(76% 0.018 255)` | Secondary copy, labels, metadata |
| `--accent` | `oklch(83% 0.16 120)` | Primary actions, legal field destinations, preview rings |
| `--accent-hover` | `oklch(90% 0.13 120)` | Primary-action hover |
| `--focus` | `oklch(85% 0.12 230)` | Keyboard focus and candidate selection |
| `--error` | `oklch(80% 0.13 25)` | Errors and losses, with text |
| `--success` | `oklch(82% 0.13 155)` | Wins and successful status, with text |
| `--border` | `oklch(37% 0.016 255)` | One-pixel boundaries and unfilled progress ticks |

Team colours identify the current roll and opponent, not every control. Resolve team-ground foregrounds through the card colour-role helper; do not assume white contrasts with every franchise. The compact field alone uses a muted green ground, `oklch(22% .022 160)`, to distinguish the playing surface. Kraft and stock belong inside historical artwork, never in the application palette. Verify rendered text and control contrast; unavailable status also needs words, not opacity alone.

## Typography and Composition

System sans for interface labels, body, controls, and scoreboard-style results. Exact-season card artwork follows the supplied eight decade-specific fronts and backs at 5:7, using self-hosted Barlow Condensed and Roboto Serif. The selected season determines the clamped decade, never the photograph year. Card dimensions and text fitting scale with width; names may wrap but never truncate, ellipsize, or stretch horizontally. Team marks remain labelled historical or current-franchise identity. Fronts show the represented role's WAR/162, OPS/HR or ERA/SO; inspection backs disclose full historical facts, position games, model limitations, source, and licence. Counts flagged as estimated or incomplete render —, while model notes retain approximation disclosures. No copied manufacturer layouts, fabricated faces, fake aging, or decorative thick side stripes.

The shared type scale is 12, 14, 16, 20, 24, 32, 48, and 64px (`--text-xs` through `--text-score`). Body copy uses 16px with 1.5 line height and a 68ch maximum paragraph width. Labels and dense table data use 12–14px. Tabular numerals align seasons, scores, and statistical columns. Interface controls remain system sans; Barlow Condensed italic 900 is reserved for compact broadcast headings and team identity. Roboto Serif and the card type treatments belong to the decade templates.

Card stock, kraft, masks, and printed trim retain the supplied era compositions. Team grounds use the published franchise colour; stock is the secondary colour because the runtime manifest publishes no second team colour. Normal text roles reach 4.5:1 and the 1970s headline reaches 3:1. When neither paper nor ink reaches 4.5:1 on a team ground, adjust the stronger foreground toward white or black without changing that ground. Raised photo placeholders retain their striped ground and use an ink that reaches 4.5:1 against both the ground and its light stripe.

Base, Foil, Foil + emboss, and Gem are fixed cosmetic finishes. Hitter/starter WAR/162 cut points are 2, 4, and 6; closer cut points are 0.5, 1.5, and 2.5. An individual two-way season uses the higher finite WAR across both roles independently of the front's represented role. Bullpen units and wholly unavailable WAR use Base. Finishes never alter drafting or simulation inputs. Verified-media selection and labelled failures remain authoritative; no mockup assets substitute for runtime media.

### Spacing and elevation

The spacing scale is 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px (`--space-1` through `--space-16`). Controls use a 4px radius; ordinary panels use 8px. Use one-pixel boundaries and tonal grounds rather than a shadow on every container. Keep actual baseball cards separate from application panels.

Native card dialogs and the field sheet use an ambient shadow at `oklch(8% .01 255 / .52)` with a 64px blur and 24px vertical offset, upward for the bottom sheet. Their dark backdrop separates modal content from the inert page. Card stock, foil, emboss, gem, tilt, and flip depth remain part of the card-rendering system rather than generic interface elevation.

### Control vocabulary

- Primary actions use the accent ground and background-colour ink. Secondary actions use the surface ground; quiet actions have a transparent ground.
- Buttons and native selects have a 44px minimum height. Icon-only controls have a 44px minimum width and an accessible action name. Dense layout never shrinks the interactive surface with a transform.
- Keyboard focus uses a 3px focus-colour outline with 4px offset. Scrollable rails must leave the focused control visible. Hover is tonal; pressing may translate a control by 1px.
- Selected filters use the text ground and background-colour ink with `aria-pressed`. Qualification buttons preview a placement; they are not commitment buttons.
- Native exact-season selects carry exact season IDs and historical-team labels. Never replace them with year-only IDs or a fixed number of demo season buttons.
- Loading, failed data, empty search, hidden blocked cards, and unavailable qualifications are distinct states. Show truthful copy and the relevant retry or reveal action. Never fabricate data to fill a visual gap.

## Imagery

Use free reusable sources first, retaining per-file source, credit, licence, and verified capture-year metadata. Prefer photos from the selected year; otherwise choose the nearest verified photo from the player's playing career and show its actual year. No current-photo-as-historical claim. No fabricated faces. Missing images receive an intentional no-photo treatment. Current franchise marks must not be presented as verified historical marks. Copyright status and trademark restrictions are distinct.

## Interaction and Responsive Behaviour

### State and commitment

Permanent exact-season picks, qualification-aware browsing, local resume, lineup order, worker simulation, all 162 game details, sharing, and retries remain available. DraftBoard owns transient candidate selection, exact-season choices, placement previews, movement, and inspection. Selecting a candidate highlights engine-approved empty destinations; a single destination previews automatically but never commits. A field preview identifies the full player, exact season, and destination. Only explicit Draft confirms a permanent pick. Back clears the destination; Cancel selection or sheet dismissal clears transient state without changing the roll or roster. A failed session mutation retains the preview and exposes its error inside the sheet.

Selecting a committed hitter suspends the candidate preview and highlights only engine-approved moves or reciprocal swaps. These assignments apply immediately, preserving the current roll and any unaffected legal candidate destination. Pitching tiles inspect rather than reassign; rotation order stays in the lineup editor. Inspection never replaces a pending candidate. After fourteen picks the existing lineup editor takes over.

### Desktop drafting

Wide mode starts at 1100px, or 1024px in landscape. The draft shell has a 1440px maximum width and 24px horizontal gutters. A single sticky header combines the wordmark, compact team-colour roll identity and bounded year range, pick count, Rules & model, and New draft. It is about 56px tall. Do not stack a second global header, progress toolbar, and large roll banner above the desktop cards.

The content has three visual columns: a 132px filter rail, flexible candidate cards, and a 452px field panel. Gaps between columns are 28px. The filter rail contains search, qualification filters with distinct-player counts, ranking selection/method/retry, blocked-card visibility, and pagination metadata. Both rails stick 72px from the viewport top and cap their scrolling area against the available viewport height. Sort and blocked-card controls must remain reachable on short windows.

Candidate grids have two columns below 1360px and three above, with 20px horizontal and 28px vertical gaps. Each card has one wrapping control bar below its artwork: native exact-season select, legal placement buttons, unavailable qualification buttons, and Turn over. The turn control does not sit above the artwork or select the player. Text and source disclosures sit beneath a turned card. Do not repeat separate qualification and availability rows when the controls already convey them.

Desktop hides a player group by default only when none of its seasons has an engine-approved destination. Show blocked cards restores those groups so the user can select one and rearrange the roster. Filled-position filters stay usable. A group with a viable alternate season remains visible; an explicit remembered season or selected candidate is not silently replaced. A selected candidate remains visible if its destination becomes illegal. Search, filter, sort, page, and visibility changes clear transient placement, not remembered exact-season choices. Narrow browsing continues to show blocked candidates.

The compact field uses a 404×350 coordinate space, 52px-wide original card fronts, a shallow outfield arc, and a separate SP1/SP2/SP3/CL/BP row. Miniature centres are C [202,268], 1B [312,224], 2B [256,152], SS [148,152], 3B [92,224], LF [78,96], CF [202,58], RF [326,96], and DH [372,290]. A slot's interactive area covers its entire 52×72.8px card. Full names wrap below the miniature; identity labels do not expand hit areas over neighbouring slots. Position and year remain visible. The header owns the fourteen progress ticks and count. Pitching workload facts are available through a native disclosure rather than occupying the idle panel.

The field footer owns permanent commitment. It identifies the selected or previewed full name, exact season, and destination, with Back, Cancel selection, and Draft at the destination. Movement identifies the committed season and offers Cancel move and Inspect card instead. The idle footer explains selection and movement without an enabled draft action.

### Narrow drafting and responsive transfer

Narrow browsing has two columns below 375px, three through 767px, and five on portrait tablets. Grid gaps are 10px horizontal and 14px vertical. The ordinary site header and real-team roll banner remain; a compact Open your field toolbar carries the picked count. Cards retain their year/qualification text without desktop action chrome. Labelled native exact-season selects live in the field sheet. Non-draft screens retain the 1280px shell, with 16px narrow gutters.

The narrow field keeps its 440×488 coordinate space and responsive miniature cards, not a scaled-down desktop interaction layer. Resizing transfers the same selected season and legal destination between panel and sheet without persisting an action. Crossing to wide mode closes the modal and hands focus to the visible field; entering narrow mode with an active candidate, movement, or inspection opens the sheet.

The bottom-anchored field sheet has a pinned identity/season/tab header and confirmation footer, a scrolling central panel, safe-area padding, native focus containment, and a locked background. Field and Card back tabs support arrow-key navigation. Escape, backdrop, and Close field dismiss without a pick and return focus to the activating card. Cancel move and Back to field focus the field heading; an unchanged candidate retains its Text version and Details disclosures during roster inspection. A roster-only sheet opens from the draft toolbar. The wide rail scrolls internally on short viewports so confirmation remains reachable.

### Card inspection

Card reverses always use the selected season's original decade design at 5:7, up to 330px on phone and 410px on tablet/desktop. Desktop candidates turn in place, span two grid columns, and expose one reverse at a time. Outside pointer/focus closes only the reverse, not placement. Text version separately exposes complete historical facts, including both two-way statistical families; Details exposes source, credit, licence/evidence links, model notes, and bullpen membership/exclusion facts. Source cues in the artwork focus that details region. Lineup/results and wide roster inspection use the same designed backs and disclosures inside the native card dialog. Optional ranking/media enrichment never disables a legal pick; ranking arrival does not reset exact-season choices.

### Motion and feedback

Mouse and pen tilt cards under a fixed directional light; touch does not tilt. Explicit turns lift through the flip; search/qualification filters and sorting fade departures, reposition survivors, then reveal entrants. Ranking arrival reorders without clearing selection; exact-season changes and pagination replace content directly. Animate transforms and opacity, never width or grid layout. Reduced motion removes tilt and transitions and swaps the semantic face instantly. Start and results retain atmosphere imagery; the draft uses a compact real-team-colour roll banner. Season turning points distinguish estimated neutral league-rate win expectancy from factual play and scores. Tables scroll only inside labelled regions, and route phases retain keyboard focus targets.

### Lineup, season, and results

The lineup editor separates batting order, starting rotation, closer, and bullpen remainder. Reordering uses explicit labelled controls; fielding/DH reassignment remains qualification-aware. Starting pitchers each receive 54 starts. Present workload assumptions near the affected unit instead of implying a real-world full pitching roster.

Simulation shows progress, current record, and the latest game without hiding later games after a loss. Results lead with the final record, followed by season totals, the complete game log, roster inspection, and sharing. Win/loss text accompanies semantic colours. Season turning points distinguish factual plays and scores from estimated neutral league-rate win expectancy.

Statistics use semantic tables, aligned numeric columns, and labelled internal horizontal scrolling, never document-level overflow. Game summaries expand into inning lines and batting/pitching boxes. Source and model information remains reachable from the relevant card or Rules & model page. A replay recomputes the same season without replacing the recipient's local draft.

## Verification

Inspect rendered start, draft with imagery, selected season, lineup, simulation, results, game details, and image credits. For draft changes, check 320px and 374px phones, the 375px column boundary, 402×874, 820×1180 and 1024×1366 portrait, 1024×768 and 1180×820 landscape, 1366px and 1440px desktop, and 844×390 phone landscape. Check short-window rail scrolling, complete control hit areas, visible position labels, wrapping identities, and no document-level horizontal overflow.

Exercise selection, placement shortcuts, flip, text/details, cancel, blocked-card visibility, exact-season changes, roster moves/swaps, resize with a preview, and explicit confirmation. Before confirmation, persisted picks/actions must not change. A successful confirmation adds one pick; a failed mutation retains the preview. Verify keyboard focus, reduced motion, failed imagery/rankings, fourteen-pick completion, lineup ordering, all 162 games, and identical replay scores.

Compare actual screenshots with the supplied reference and inspect them at useful sizes. Geometry tests do not establish visual approval. Preserve all eight decade fronts and backs, including two-way, bullpen, long-identity, and unavailable-media states. No generated or prototype assets substitute for production identities or missing facts.
