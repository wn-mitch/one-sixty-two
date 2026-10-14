# Card print model

This document defines how a card front is made and rendered. It is the contract for templates, finish tiers and the light renderer. [DESIGN.md](../../DESIGN.md) records the current interface conventions.

Cards are the game. Every card front is described as a printed object, so a change to one surface reads consistently on every era and tier. The model is grounded in how real cards are produced, but it is not bound by print limits: light, colour and patterns can be pushed past what a press could do, as long as the change is expressed through the model rather than added beside it.

## How a card is made

A card is built from passes over the same sheet, in this order. Each later pass sits on the earlier ones.

1. **Stock.** The paper and its surface: uncoated fiber (1950s–60s), matte (1970s–80s), glossy UV (1990s) or chrome (2000s on). Stock sets how much light the bare card reflects and how fiber shows.
2. **Ink.** Everything printed in colour: the photo, bands, type and team artwork. Ink is flat. On uncoated stock it sits slightly into the paper; under a gloss coat it sits almost flush.
3. **Foil stamp.** A heated die presses foil only where the die's shape touches. Foil is a separate plate in one material: silver, gold, or a holographic film. The die shape matters more than the element: a nameplate's die can be its lettering alone, while the plate around it stays ink.
4. **Emboss and deboss.** A die raises or presses regions, usually in register with the foil: raised names and marks, pressed frames.
5. **Coat.** Gloss, matte or spot UV across chosen areas. The coat decides how strongly ink-only areas catch highlights.

Holographic film carries its colour in microscopic grooves rather than in ink. The groove layout makes the named looks: smooth grooves for a refractor sweep, small facets for prizm, irregular shards for cracked ice, circles for a spun rainbow. Each era has its own film: Atomic bubbles (1950s), a mojo swirl (1960s), the Atlanta Marriott Marquis lobby carpet (1970s; `geodesic` keeps the earlier dome), Xfractor (1980s), a circuit board of long wires ending in ring pads (1990s), the amino-acid sequence of human growth hormone as dense dot-matrix microtext (2000s; the `hgh` film draws its skeletal formula instead), cracked ice (2010s), and double-barred dollar signs on a staggered lattice (2020s). Every card shifts its film by a seed from its identity, so two cards of one era never show the same cut. Under diffuse light holo film reads as plain silver. Silver and gold foil carry a pattern pressed into the metal, which shows as light and shade that move with the tilt: hammered dents (1950s), brushed grain (1960s), a sunburst (1970s), TIG weld beads with strong heat tint between them (1980s), crumpled metal leaf (1990s), Damascus steel (2000s), carbon-fibre twill (2010s) and a crackle glaze (2020s). Carbon is cut finer than the other plates so it reads on narrow foil; Damascus, the weld and the sunburst are cut broader. Guilloche, diamond plate, a laser pinstripe, spun lathe rings, a knurl and a heat-tint stain are also available in the foil gallery. Paisley belongs to no era: as a film, curled boteh teardrops with copper outlines, inner rings, gold dots and an eye, their grooves following each motif's contours; as a plate, the same motifs embossed as raised outlines and domed dots over a darker pressed ground. Damascus shows many thin folded layers of light and dark steel, and the stain scatters many small oxide spots over the steel, each a muted temper colour from straw through bronze and purple to blue. The finish also reaches past its dies: a Gem card's whole face carries a faint refractor wash, and silver and gold cards catch a soft sheen band, both sliding with the light and the viewer.

Each film, plate, finish and colourway is its own module under `src/lib/cards/surface/` (`films/`, `plates/`, `finishes/`, `palettes/`), with named dials whose shipped values print as constants. A film is the groove geometry; its finish is the micro-surface it is pressed with (the refractor is bumped, shimmer brushed, the circuit etched; the rest smooth); its colourway is the spectrum its grooves split light into (rainbow unless the film picks another). Any finish, colourway or plate can be swapped in the Workshop stories, which give every module its own story and a dial for each setting, and a plate can be pressed through a film as well as bare foil. A second film can print under the first and show through its ground (carpet over mojo). The foil lab at `/lab` puts all of this on one card, a foil frame over bare stock, or a real era front: dials step across their range, any control can be staggered across several cards side by side, an era's shipped look loads as a preset, and the setup travels as a link. `just foil-engine-export <dir>` copies the engine into another project, as for the alpacasoft Foil Lab toy. A jackpot flickers through the era films in a shuffled order, a new one every half second. Stickers, sealed packs and dealt pack cards sit under the same light: foil stickers print in their own metal as smooth vinyl, the sealed pack is silver with a sunburst plate, a jackpot is gem holo, and a franchise card's frame carries its decade's plate.

## One renderer

Every lit card front goes through one pipeline:

- **Templates** lay out ink in the DOM and tag each surface with its role (`data-surface`). Templates draw no finish effects of their own.
- **The print spec** (`src/lib/cards/surface/`) says, for each role and tier, which plates apply: foil material and die, emboss height, coat.
- **The surface map** is painted from the laid-out DOM and the print spec: relief, foil coverage and material, coat, and the ink colour under each pixel.
- **The light renderer** (WebGL2) draws stock, foil, holo, relief and coat light from the map over the printed ink.

The DOM keeps the card body (thickness and drop shadow) and the ink. No lit card draws foil, sheen, glare or edge metal in CSS.

Finish paint reaches the DOM only through CSS variables (`--stamp`, `--emb`, `--gem-ring`) and the material layer's paint, which `Card.svelte` sets only for cards without a light canvas. A template writes each finish surface as `var(--stamp, <ink>)`, so a lit card prints the ink and the shader adds the foil. The material layer keeps its tagged shapes (rings and keylines) unpainted on a lit card, because the surface map reads their geometry.

The edge is stamped over the print. A band that runs off the card's side, such as the 2000s rail, is marked `data-over-edge` and prints over the edge instead. Foil with no printed colour of its own, such as the edge, is bare metal; colour-over foil takes its colour only from the ink printed for it.

A lit card shows its ink until its light canvas draws its first frame, then the canvas fades in. Share captures, compact cards, thumbnails, the home wall, and browsers without WebGL2 keep the static CSS finish.

## Roles

| Role | What it is |
| --- | --- |
| `name` | The player's name lettering |
| `team` | The club name lettering |
| `mark` | Team artwork, printed on its stamped badge |
| `stamp` | Small printed devices: season chips, logo discs, keylines |
| `frame` | Bands, rules and plates pressed into the stock |
| `edge` | The card's outer border (the `ring` surface kind) |
| `photo` | The photo window, flat under a gloss coat |
| `brand` | The 162-0 mark, foil on every card |
| `sticker` | Die-cut vinyl stickers applied after printing |
| `ink` | Everything else printed: stats, labels, credits |

## Tiers

A tier is the set of plates a card receives. Silver accents on gold cards are deliberate: a second metal separates secondary marks from the gold name.

| Role | Base | Foil | Foil + emboss | Gem |
| --- | --- | --- | --- | --- |
| `name` | ink | silver | gold, raised | holo, raised |
| `team` | ink | ink | silver | silver |
| `mark` | ink | ink | raised | raised, holo |
| `stamp` | ink | silver | gold, raised | holo, raised |
| `frame` | pressed | pressed | pressed | pressed |
| `edge` | stock | brushed silver | brushed gold | holo pattern |
| `brand` | silver | silver | gold | holo |
| `ink` | pressed | pressed | pressed | pressed |

## Foil over ink

Real foil is opaque and replaces the ink under its die. The renderer supports three treatments so they can be compared:

- **Opaque.** Metal replaces the ink, as on press. Strongest metal read; lettering contrast depends on the metal against its surroundings.
- **Colour over foil.** The ink tints the metal, as on coloured refractor parallels. Keeps team colour inside foil.
- **Contrast-keyed.** The metal keeps the ink's lightness and adds its sheen and colour shift. Not physically possible; preserves the printed contrast.

Readable text is a requirement, not a finish preference. Foiled lettering that carries information (names, team names, the year chip) must stay legible at rest, without depending on the light's position, against the surface it sits on.

## Open decisions

- Which foil treatment ships, and whether it differs by role.
- Holo pattern per tier or era.
- Where silver accents appear on gold cards beyond `team` and `mark`.
- Whether share captures and compact cards move onto the renderer; today they keep the static CSS finish.
