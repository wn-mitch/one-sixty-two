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

Completed seasons are saved in a device-local library, My teams (`/seasons`), and every card the player rosters joins a device-local collection (`/collection`) where it earns cosmetic stickers that also show on that card in later drafts. Completing an own season earns a token (the device's first completed season earns one bonus token; completing the shared daily run, one attempt per device per day, earns one more) for cosmetic finishes in the Shop (`/shop`) and per-era choices in the card factory (`/factory`); tokens cannot be bought. Draft Mode is developer-only until finished. Any two current-version replay links can meet in a deterministic best-of-five head-to-head series (`/h2h`) that recomputes both seasons for seeding; a series is shared as a link and never stored on the server.

Sharing publishes two 1080×1920 PNGs, a field layout and a four-by-four full-card layout, plus a 1200×630 Open Graph preview. The player's browser draws them from its own season. The server checks the replay's shape and versions and the images' formats and sizes, then stores them immutably; it does not recompute the season, so a published record is trusted, not verified. Recipients recompute the season from the replay. A local preview is not presented as the stored publication. Links are released only after the images are stored; preparation errors preserve the replay and leave an explicit retry or download/copy alternative.

## Accessibility & Inclusion

WCAG AA text and control contrast, visible keyboard focus, labelled scrolling tables, at least 44px primary touch targets, textual win/loss indicators, and reduced-motion support. A single Motion toggle persists the on/off preference when storage is available and remains usable for the session when it is not. Motion amount and speed are fixed; the operating system's reduced-motion preference always overrides the toggle. No audio or advertising trackers. Production hosting supplies Cloudflare traffic and performance analytics, disclosed in `/privacy`.

## Voluntary Support

This is the intended monetization policy, not a claim that purchases are implemented. The game remains free to play. This model excludes ads, paid gameplay advantages, paid draft odds, paid rerolls, subscriptions, and energy or pay-to-continue mechanics.

Preserve one earned Plate Store token per draft without changing the existing qualification event, imposing a daily cap, or reducing earnings to encourage spending. The free earning path must remain genuine, not a deliberately degraded alternative.

Optional support purchases include an explicitly stated quantity of the same spendable Plate Store tokens. There is no separate premium currency or tip-only checkout. Tokens buy cosmetic plates, never stronger players or improved simulation outcomes. Players choose a known cosmetic; there is no paid random reward mechanism. Neither purchased tokens nor unlocked cosmetics expire.

The entry label is `Support 162-0`. Describe offers as purchases, not charitable donations. Before checkout, every offer displays its store-provided local-currency price and exact token quantity. No preselected purchase, countdown, artificial scarcity, guilt copy, purchase prompt after a loss, automatic checkout on insufficient balance, or token bundle deliberately mismatched to redemption costs is permitted.

### Pricing

The base USD exchange rate is **4 coins per $1**, or **$0.25 per coin**. “Coins” means the same Plate Store currency called tokens here, not a second balance or a code-wide rename. The intended redemption price is **1 coin per cosmetic plate**, interpreting the $0.25-per-cosmetic target; this is a pricing commitment, not a verified claim about the current implementation. Preserve one earned coin per draft, so each draft earns one cosmetic's worth of currency. Earned and purchased coins buy the same cosmetics.

Keep the exchange rate flat, without bulk discounts or bonus-coin pressure. Illustrative offers—not configured store products—are:

| Base USD price | Coins |
| --- | --- |
| $1 | 4 |
| $5 | 20 |
| $10 | 40 |

Exact offered bundles and available storefront price points remain implementation selections. If a store cannot represent the exact base price, surface the discrepancy before configuring an approximation; do not silently change the rate. Outside the base USD market, display the actual localized price and exact coin quantity, without claiming a universal $0.25 local equivalent. Assess proceeds after applicable store fees and taxes without changing the customer-facing rate.

### Discovery and purchase context

These are intended UI requirements for subsequent implementation, not shipped navigation:

- Provide a persistent, ordinary `Card Lab` navigation entry so the free tool is discoverable independently of the store.
- In the Plate Store purchase context, show: “Earn a token with every draft, or buy extras to support the game. Card Lab is always free.” Include a clearly labelled `Open Card Lab` link.
- Place `Support 162-0` in the Plate Store and settings/about navigation. Do not use interrupting modals, first-run sales screens, or payment prompts triggered by game results.
- When a balance is insufficient, explain the amount needed and keep the earned-token and free-Lab paths visible beside optional support. Billing starts only when the player explicitly selects a priced offer.
- Card Lab access itself requires neither tokens nor a purchase. Do not promise that exporting, saving, or applying every possible Lab design is equivalent to owning a store plate; establish that relationship from the actual implementation before writing more specific copy.
- Reuse existing visual conventions rather than introduce a separate commerce aesthetic.

## Mobile Publishing Roadmap

Target both the Apple App Store and Google Play while retaining the web game. The ordered milestones below are release gates, not a claim that native apps, billing, recovery, or the intended navigation already exist, and not authorization to implement them as part of this roadmap. Web checkout and cross-store wallet sharing are not promised.

1. **Establish the economy and free-path baseline.** Locate the actual Plate Store and Card Lab implementation. In the implementation task, record the reward qualification event, redemption cost, scope of cosmetic ownership, and free capabilities. Preserve the baseline, expose the free-path UI above, and demonstrate that a player can earn and redeem without spending money. Prior workspace searches have not identified the user-described store; that does not establish its absence or justify inventing a replacement or rewriting the stated reward rule. If it is in another workspace or an unlanded change, payment work depends on its landed implementation. The documented `/lab` renderer workshop is not enough evidence to identify the intended Card Lab or select its route.

2. **Clear distribution rights and store prerequisites.** Review commercial-use rights for source data, images, team marks, player likeness uses, fonts, and screenshots. Preserve required notices and transformed-data obligations. Existing attribution is evidence, not blanket legal clearance. Unresolved rights require a qualified determination before public commercial distribution of the affected release; do not silently delete game content as a substitute. Prepare publisher accounts, support and privacy URLs, age/content ratings, App Privacy and Data safety declarations, screenshots, and accurate optional-IAP descriptions for both stores. Check each account's actual testing and verification requirements rather than assuming universal thresholds. Rights review and technical packaging investigation may run independently after the product promise is recorded.

3. **Prove mobile delivery with the existing game.** Start with the shared Svelte interface and Rust engine, not a mandated native rewrite. Evaluate native hosting against draft, season simulation, collection, Card Lab, saving, share links, image exports, and navigation. Select packaging only after proving working iOS and Android device builds, WebAssembly and rendering performance, application lifecycle save safety, required storage support, safe areas, Android Back behavior, and a clearly documented network/offline boundary. A thin website wrapper is not automatically acceptable to review. This roadmap intentionally does not select a wrapper technology.

4. **Establish recovery before charging.** Paid balances and unlocked paid cosmetics must survive reinstall and device replacement within each supported store ecosystem. App upgrades must preserve existing device records. Define whether broader game-save sync or cross-store wallet portability is offered before promising either. This roadmap mandates neither an account system nor a backend; a separate recovery implementation decision must prove the promised behavior. Local SQLite or a generic Restore Purchases button alone is not proof of recovery for consumed currency. If recovery cannot be proved, keep real-money sales disabled while the free game proceeds through testing.

5. **Integrate explicit support purchases.** Use Apple's in-app purchase and Google Play Billing as the default paths, with store-supplied prices and clearly stated token quantities. Support purchases are digital currency transactions despite their friendly label. Require verified fulfillment without duplicate credit, correct pending/cancelled/failed states, recoverable interrupted purchases, and a defined refund/revocation policy that does not confiscate unrelated earned currency. Select product identifiers, quantities, integration libraries, and persistence schemas in a subsequent implementation specification only after the economy and recovery gates; this roadmap does not define speculative API contracts.

6. **Validate and submit both apps.** Exercise the game and support flow using TestFlight and Google Play testing tracks before public release. Resolve submission issues independently: either platform may release when its own gates pass, without dropping the other target or waiting for simultaneous approval. Review notes must explain the free game, free Lab, earned token path, support purchase quantities, cosmetic-only redemption, and recovery. Make the purchase flow accessible to reviewers and ensure listed offers actually work. Release only after the relevant platform gates pass.

### Policy sources

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): review section 3.1.1 for in-game currency, tipping, non-expiry, and purchase rules, and section 4.2 for minimum functionality.
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en): review virtual currency, price transparency, billing, and regional exceptions.

Native billing is the selected conservative direction, not a claim that regional alternatives never exist. Recheck current rules at implementation and submission.
