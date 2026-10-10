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

Home leads directly with the challenge and draft instructions. Keep the shared wordmark unaccompanied by a tagline; omit decorative eyebrow slogans and motivational captions. Small labels identify actual controls, eras, statistics, or game state.

System sans for interface labels, body, controls, and scoreboard-style results. Exact-season card artwork follows the supplied eight decade-specific fronts and backs at 5:7, using self-hosted Barlow Condensed and Roboto Serif. The selected season determines the clamped decade, never the photograph year. Card dimensions and text fitting scale with width; names may wrap but never truncate, ellipsize, or stretch horizontally. Team marks remain labelled historical or current-franchise identity. Hitter fronts show historical WAR/162, OPS, and position-specific `DEF est.`; assigned DH keeps HR. Pitcher and bullpen fronts retain WAR/162 · ERA · SO, with BP WAR unavailable. Inspection backs show historical statistics, ranks, source credits, and licence. Estimated or incomplete counts use the unavailable marker rather than impersonating measurements.

The shared type scale is 12, 14, 16, 20, 24, 32, 48, and 64px (`--text-xs` through `--text-score`). Body copy uses 16px with 1.5 line height and a 68ch maximum paragraph width. Labels and dense table data use 12–14px. Tabular numerals align seasons, scores, and statistical columns. Interface controls remain system sans; Barlow Condensed italic 900 is reserved for compact broadcast headings and team identity. Roboto Serif and the card type treatments belong to the decade templates.

Card stock, kraft, masks, and printed trim retain the supplied era compositions. Team grounds use the published franchise colour; stock is the secondary colour because the runtime manifest publishes no second team colour. Normal text roles reach 4.5:1 and the 1970s headline reaches 3:1. When neither paper nor ink reaches 4.5:1 on a team ground, adjust the stronger foreground toward white or black without changing that ground. Raised photo placeholders retain their striped ground and use an ink that reaches 4.5:1 against both the ground and its light stripe.

Base, Foil, Foil + emboss, and Gem are fixed cosmetic finishes. Hitter/starter historical WAR/162 cut points are 2, 4, and 6; closer cut points are 0.5, 1.5, and 2.5. An individual two-way season uses the higher finite historical WAR across both roles independently of the front's represented role. Bullpen units and wholly unavailable WAR use Base. Historical WAR/162 controls list ordering and finish only; it never alters matchup strength. Separately sourced position-specific defensive evidence is a gameplay input and is disclosed independently. Verified-media selection and labelled failures remain authoritative; no mockup assets substitute for runtime media.

### Spacing and elevation

The spacing scale is 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px (`--space-1` through `--space-16`). Controls use a 4px radius; ordinary panels use 8px. Use one-pixel boundaries and tonal grounds rather than a shadow on every container. Keep actual baseball cards separate from application panels.

The native field sheet uses an ambient shadow at `oklch(8% .01 255 / .52)` with a 64px blur and upward 24px offset. Its dark backdrop separates modal content from the inert page. Card review fronts stay inline; turned cards use the native top layer without adding a backdrop, scroll lock, or page inertness. Their source slot remains reserved. Card stock, foil, emboss, gem, tilt, and flip depth remain part of the card-rendering system rather than generic interface elevation.

### Control vocabulary

- Primary actions use the accent ground and background-colour ink. Secondary actions use the surface ground; quiet actions have a transparent ground.
- Buttons and native selects have a 44px minimum height. Icon-only controls have a 44px minimum width and an accessible action name. Dense layout never shrinks the interactive surface with a transform.
- Keyboard focus uses a 3px focus-colour outline with 4px offset. Scrollable rails must leave the focused control visible. Hover is tonal; pressing may translate a control by 1px.
- Selected filters use the text ground and background-colour ink with `aria-pressed`. Qualification buttons preview a placement; they are not commitment buttons.
- Native exact-season selects carry exact season IDs and display the year without the redundant team name. Never replace their values with year-only IDs or a fixed number of demo season buttons.
- Loading, failed data, empty search, hidden blocked cards, and unavailable qualifications are distinct states. Show truthful copy and the relevant retry or reveal action. Never fabricate data to fill a visual gap.

## Imagery

Use free reusable sources first, retaining per-file source, credit, licence, and verified capture-year metadata. Prefer photos from the selected year; otherwise choose the nearest verified photo from the player's playing career and show its actual year. No current-photo-as-historical claim. No fabricated faces. Missing images receive an intentional no-photo treatment. Current franchise marks must not be presented as verified historical marks. Copyright status and trademark restrictions are distinct.

Team marks fit wholly inside their padded tiles, preserving aspect ratio without cropping or intrinsic image dimensions expanding the layout. Reviewed round source marks retain circular frames; square/freeform marks use square frames across era fronts, backs, and interface tiles. Missing reviewed marks retain labelled abbreviation fallbacks.

All club marks identify actual franchises rather than the app's own brand. Reviewed non-free marks may be included in the UI and exported season share images under an asserted fair-use basis, with accurate source/copyright disclosure and a non-affiliation notice. Do not describe those marks as freely licensed or permission-cleared. Portrait and atmosphere reuse requirements are unchanged. There is no standalone logo download or card-printing feature.

## Interaction and Responsive Behaviour

### State and commitment

Permanent exact-season picks, qualification-aware browsing, local resume, lineup order, worker simulation, all 162 game details, sharing, and retries remain available. DraftBoard owns transient candidate selection, exact-season choices, placement previews, movement, and inspection. Selecting a candidate highlights engine-approved empty destinations; a single destination previews automatically but never commits. A field preview identifies the full player, exact season, and destination. Only explicit Draft confirms a permanent pick. Back clears the destination; Cancel selection, sheet dismissal, or clicking outside the card clears transient state without changing the roll or roster. Card controls, field slots, and confirmation controls preserve the active selection. A failed session mutation retains the preview and exposes its error inside the sheet.

Move first selects a committed hitter on the first click and raises its front for review on the second click. Review first opens the front immediately and offers Move card on the reverse. Movement highlights only engine-approved moves or reciprocal swaps. These assignments apply immediately, preserving the current roll and any unaffected legal candidate destination. Pitching tiles review rather than reassign; rotation order stays in the lineup editor. Inspection never replaces a pending candidate or shifts the field. After fourteen picks the existing lineup editor takes over.

### Stadium choice

A new draft opens on the stadium deck before the first roll. The deck shows all thirty current parks alphabetically as radio cards: two columns on phones, three from 48rem, four from 72rem. Each StadiumCard shows the franchise mark, name and reference year, a field-outline SVG with the diamond, LF/CF/RF distances, wall-height range, roof, and elevation. Estimated distances carry `est.` and unsourced elevation says so. A sticky footer names the selection and holds Draft at this stadium, disabled until a park is chosen. Stadium cards show physical facts only, never ratings or bonuses.

### Desktop drafting

Wide mode starts at 1100px, or 1024px in landscape. The draft shell has a 1440px maximum width and 24px horizontal gutters. A single sticky header combines the wordmark, compact team-colour roll identity and bounded year range, pick count, Rules & model, and New draft. The team mark and roll identity share a 44px height, with 10px padding above and below. Do not stack a second global header, progress toolbar, and large roll banner above the desktop cards.

The content has three visual columns: a 132px filter rail, flexible candidate cards, and a 452px field panel. Gaps between columns are 28px. The filter rail contains search, qualification filters with player counts, ranking selection/retry, and blocked-card visibility. Ranking choices use short WAR / 162 and OPS / ERA labels that fit the rail; Rules & model owns the method link. Both rails stick 72px from the viewport top and cap their scrolling area against the available viewport height. Sort and blocked-card controls must remain reachable on short windows.

Candidate grids have two columns below 1360px and three above, with 20px horizontal and 28px vertical gaps. Candidate fronts begin with artwork, not a repeated player/team heading or review toolbar. Each card has one nonwrapping control bar below its artwork: native year-labelled exact-season select, legal placement buttons, unavailable qualification buttons, and Turn over. Exceptionally long qualification lists scroll within that bar rather than wrapping or shrinking touch targets. The turn control does not sit above the artwork or select the player. Text version appears only on a turned candidate and includes season evidence and source credits. Do not repeat separate qualification and availability rows when the controls already convey them. Pagination is centered below the cards as one bordered 48px-high control with directional arrows, tabular page numbers, the total player count, and 44px button targets. It fits the available width on phones. Changing pages brings the new cards into view below the sticky header.

Desktop hides a player group by default only when none of its seasons has an engine-approved destination. Show blocked cards restores those groups so the user can select one and rearrange the roster. Filled-position filters stay usable. A group with a viable alternate season remains visible; an explicit remembered season or selected candidate is not silently replaced. A selected candidate remains visible if its destination becomes illegal. Search, filter, sort, page, and visibility changes clear transient placement, not remembered exact-season choices. Narrow browsing continues to show blocked candidates.

Roster miniatures use the canonical compact Card path, not a second renderer. All eight era fronts receive an era-specific lower plate: angled nameplate, colored band, pinstripe, edged italic plate, horizontal team trim, name bar/dark strip, or clipped dark plate. Plain position labels share a lower row with right-aligned statistics; compact cards omit position pills, round badges, tags, and rails. Names use the card's existing fitter to stay within two lines without ellipsis, with full-name captions outside the artwork. Year type has an 8px floor and does not repeat the lower position label. Desktop field artwork is 56px wide inside 64px-wide slot buttons. A 368px field groups outfield, infield, and home/DH positions so all nine hitters and five pitching slots fit the panel at the standard desktop height without overlapping. Narrow fields retain 72px artwork and long vertical rows. The field never scrolls horizontally. Staff remains five columns where five 72px cards fit and wraps to three plus two below that width.

The field footer appears only for an active selection or move. It identifies the selected or previewed full name, exact season, and destination, with Back, Cancel selection, and Draft at the destination. Movement offers Cancel move; the wide rail also identifies the committed season. Field footers contain no movement instructions or inspection buttons. Idle fields have no instructional footer or inline pitching-workload explanation; Rules & model owns that help.

### Narrow drafting and responsive transfer

Narrow browsing has two columns below 375px, three through 767px, and five on portrait tablets. Grid gaps are 10px horizontal and 14px vertical. The ordinary site header and real-team roll banner remain; a compact Open your field toolbar carries the picked count. Cards retain their year/qualification text without desktop action chrome. Labelled native exact-season selects live in the field sheet. Non-draft screens retain the 1280px shell, with 16px narrow gutters.

The narrow field keeps the same legal roster and compact Card controls but lengthens its vertical coordinate rows instead of scaling cards below 72px. Resizing transfers the selected season and legal destination without persisting an action. Crossing to wide mode closes the modal and hands focus to the visible field; entering narrow mode with an active candidate, movement, or inspection opens the sheet. DraftSheet retains its own internal scrolling so its pinned confirmation controls remain reachable without document-level horizontal overflow.

The bottom-anchored field sheet has a pinned identity/season/tab header and confirmation footer, a scrolling central panel, safe-area padding, native focus containment, and a locked background. Field and Card back tabs support arrow-key navigation. While a roster card is raised, Escape or the backdrop returns that card without closing the sheet. Otherwise Escape, backdrop, and Close field dismiss without a pick and return focus to the activating card. Cancel move focuses the field heading; an unchanged candidate retains its Text version during roster inspection. A roster-only sheet opens from the draft toolbar. The wide rail scrolls internally on short viewports so confirmation remains reachable.

### Card inspection

CardReview owns one exact-season review. Candidate and gallery fronts stay inline until turned; roster review opens centered on the front, up to 410px wide. The same turn symbol sits beneath the raised card: turn the roster front to read its reverse, then turn back to return it to its source. Escape and outside clicks also return raised cards. Historical styled reverses retain their decade design at 5:7, with scrolling on short screens. Text version is a reverse-face control, not an external toolbar. It presents the same identity, statistics, ranks, and source credits as the printed reverse in readable text, without supplemental estimates, valuation breakdowns, or model explanations. Switching it off restores the styled reverse and focuses its source cue without scrolling the page. Lineup rows use 56px canonical front miniatures; position assignment is not repeated beneath the name or in an idle status paragraph. Lineup raises a tapped row's card with the same roster-review flight as the draft field, returning it on Escape, outside click, or turning back. Results expands one review after its collection; Hide card restores the activating card or owning heading. Results starts on its simulated styled back and retains the back presentation while switching 162-0 season and Actual season. The narrow DraftSheet remains the native field-selection modal, preserving candidate presentation, destination, and movement state while visiting roster review and resizing. Only the active Card back tab mounts its candidate reading surface.

Turning moves keyboard focus to the raised turn control; returning restores its source trigger. Turning a different card first returns the current reader.

### Motion and feedback

Mouse and pen tilt cards under a fixed directional light; touch does not tilt. Home wall cards and Results award cards opt into autonomous drift/finish lighting, and the Home wall adds sweeps, gem twinkles, spotlights, and measured marquees. One roughly 30fps scheduler serves all autonomous effects, pauses hidden/offscreen subscribers through shared visibility and intersection observation, and freezes logical time while the document is hidden. Settings persists Motion, Card review animation, Card speed, and Roster first click in `162-zero:settings:v1`. Motion governs all movement and transitions; the card-animation switch can disable review travel and rotation separately. Card speed ranges from 0.5× to 2×, with 780ms at the default 1×. Ambient amount remains 2.5× and ambient speed 1×. Storage denial leaves controls usable for the session. Live system reduced motion overrides animation without changing saved preferences and restores a fixed readable light pose. Card flights lift, scale, and rotate from live source bounds; return flights reach those bounds before restoring inline layout. Disabled card animation exposes the centered reading face without travel or rotation. Animate transforms and opacity, never width or grid layout.

Card flights use the reader’s measured layout, including reserved scrollbar space, so the last raised frame aligns with the inline source. Compact source artwork remains intact during travel and resolves to the canonical full front when centered. Reverse layout and controls remain mounted through the return flight. Flights remain clipped beneath the sticky draft header until the card clears it.

Home’s decorative wall is independently clipped and rotated −7°. Desktop renders four duplicated 176px rows with 22px gaps; phone renders three 96px rows with 12px gaps in a 300px top band, so copy starts below rather than competing with the cards. A left-to-right and top/bottom scrim protects text, and the masked logo strip uses all thirty real franchise states. The wall is inert to pointer and assistive technology. Results award fronts alone use continuous idle motion; compact hand cards remain still and lift only for hover/focus.

Neighboring wall rows use disjoint era palettes, and each row separates matching eras through its repeat seam. Each showcase player belongs to one row and appears once per base cycle, even when several seasons are available. Full cycles repeat to cover the viewport; a finite showcase can repeat players within a row on wide screens.

Draft loading renders eight era-styled TEAM placeholders, never invented eligible players. One card lifts and flies upward out of the grid. The responsive grid keeps artwork at least 72px wide, pauses offscreen and while the document is hidden, and stays static when Motion is off or the operating system requests reduced motion.

### Lineup, season, and results

The lineup editor separates batting order, starting rotation, and relief (closer and bullpen remainder). Each entry is one dense lineup-card row: order number, 56px canonical compact front, full name and year, then the information that informs order: hitters show a position select plus historical OBP, SLG, and HR; starters show ERA, SO, and IP; the closer shows ERA, SO, and SV; the bullpen remainder shows its pool size. Estimated or missing inputs show the unavailable marker. At 40rem and wider each row is a single line with aligned stat columns; narrower rows place the position and stats beneath the name and stack the arrows. Tapping a front raises it from its row. The order number is the mouse/touch drag handle and reorders only within batting order or starting rotation: the lifted row follows the pointer while the rows it passes slide aside with anime.js to open the insertion gap, and only a committed drop persists. Drops, cancellations, and up/down moves settle every row into its slot with the same motion; Motion off places rows without travel. Escape, pointer cancellation, or dropping outside the list leaves order unchanged. Labelled up/down controls and live announcements provide keyboard ordering. Closer and bullpen remainder remain fixed and labelled CL and BP. The position select lists every hitter slot: the current slot alone, legal moves as open or swap with the named occupant, and unavailable slots disabled with the engine's reason. Choosing a legal slot applies immediately and announces any reciprocal swap. Starting pitchers each receive 54 starts. A one-sentence workload assumption appears beside the rotation and relief units. The simulate action sticks to the bottom of the viewport.

Simulation shows progress, current record, and the latest game without hiding later games after a loss. Results lead with the final W–L, first loss/no losses, streak, runs ledger, and share actions. The awards spread considers every participating individual for MVP, batting title, fewest runs allowed (RA9), strikeout leader, and LVP; BP is excluded from individual awards. Exact unrounded ties receive chips, stable identity chooses the featured winner, and categories merge when one player wins more than one. The rest-of-hand preserves every unfeatured roster card in slot order with 72px compact fronts. Turning points attach the correct drafted batter or pitcher/BP by season identity. Totals and all 162 expandable game boxes remain below.

Statistics use semantic tables, aligned numeric columns, and labelled internal horizontal scrolling, never document-level overflow. Results inspection ranks hitters against hitters and pitchers/BP against pitchers/BP with unrounded competition values; unsupported/missing values and invalid denominators show no comparative rank. Simulated and historical counts, rates, and WAR measures stay in separate views. Source credits remain on the text reverse; model definitions belong on Rules & model. A current compatible replay loads by opaque ID, validates its authoritative action history, and recomputes the same season without replacing the recipient's local draft.

Season in review and game boxes share the dense `.stat-table` scorebook treatment in `src/routes/layout.css`: 12px tabular data, 36px baseline rows that grow for complete identities, striped grounds, grouped columns, and a sticky name/year column. Portrait date labels do not appear inside statistical rows. Horizontal scrolling stays within labelled regions and joins the tab order only when necessary. The wide game log has two columns, with expanded details spanning both; narrow screens retain one chronological list. Every existing statistic and all 162 game boxes remain accessible.

### Saved seasons and head-to-head

`/seasons` and `/h2h` use the narrow page shell (48rem and 56rem) with a muted back link, a large heading, and a one-sentence lede. Each saved season shows its name or record, home stadium, save date, and MVP, with the roster in a collapsible text list. Playable entries offer Play head-to-head and Copy challenge link; Rename edits inline and Delete removes the entry. Retired entries are dimmed, carry a Retired notice, and keep their roster and record without play actions. Copy status is announced in a live region; a denied clipboard shows the link as text.

Head-to-head setup is two Team A/Team B fieldsets, side by side from 48rem, each with a replay-link field, an optional saved-season select, and an optional team name. Field errors are attached to their input and the first invalid field takes focus. Progress reports both regular seasons and the current series game, with Cancel while running. Series results lead with the champion and score, both seeds with records and home stadiums, and Copy series link. The series MVP card, series swings from Team A's side, every game with its stadium, running score and MVP, and series totals follow. The seeding tie rule appears only when records are equal.

### Sharing and publication

Results offers scorecard 1080×1350, diamond 1080×1350, and wide 1200×630 compositions through one `ShareArtwork` component built from real Card fronts. Until publication, the responsive preview is explicitly local and carries no fabricated public URL. The published preview, download, clipboard image, replay metadata, and crawler image all resolve to the same stored PNG bytes; capture uses a fixed readable finish-light pose and no ambient animation.

The first Challenge, Copy link, Download PNG, or Copy image action stores the current replay and requests publication. The server accepts only its replay ID, validates schema 5 / `contact-v1` / `classic-v1` action history and pinned core/media/ranking/renderer versions, recomputes the full season, and captures all three authenticated internal surfaces. Content-addressed model and PNG objects are written before a conditional immutable replay manifest, so a failed partial capture exposes no completed publication and retry can safely reuse immutable work. The public link is not distributed until the wide crawler image also exists. Native sharing may need a second tap after preparation; denied/unsupported clipboards expose a selected readonly link or Download PNG instead of reporting success.

## Verification

Inspect rendered start, draft with imagery, selected season, lineup, simulation, results, game details, and image credits. For draft changes, check 320px and 374px phones, the 375px column boundary, 402×874, 820×1180 and 1024×1366 portrait, 1024×768 and 1180×820 landscape, 1366px and 1440px desktop, and 844×390 phone landscape. Check short-window rail scrolling, complete control hit areas, visible position labels, wrapping identities, and no document-level horizontal overflow.

Exercise selection, placement shortcuts, flip, text version and source cues, cancel, blocked-card visibility, exact-season changes, roster moves/swaps, resize with a preview, and explicit confirmation. Before confirmation, persisted picks/actions must not change. A successful confirmation adds one pick; a failed mutation retains the preview. Verify keyboard focus, reduced motion, failed imagery/rankings, fourteen-pick completion, lineup ordering, all 162 games, and identical replay scores.

Compare actual screenshots with the supplied reference and inspect them at useful sizes. Geometry tests do not establish visual approval. Preserve all eight decade fronts and backs, including two-way, bullpen, long-identity, and unavailable-media states. No generated or prototype assets substitute for production identities or missing facts.
