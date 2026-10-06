# 162-0

A browser baseball challenge: draft fourteen exact historical selections (nine hitters, three starters, a closer, and a team-season bullpen remainder), then play a deterministic 162-game season. SvelteKit 3, Svelte 5, Tailwind 4, and Cloudflare Workers Static Assets. Simulation stays in the browser; no account, database, or paid data API is required.

Draft progress, fielding/DH assignments, and lineup order are saved locally. Exact season selections are permanent; qualifying position players can move into an empty slot or swap reciprocally before simulation. Moves preserve a pending roll and must leave the roster completable. Only saves compatible with the current schema, model, and dataset resume. Sharing uploads versioned inputs and an authoritative roll/pick/reassignment action history; the recipient recomputes the same season without replacing the local draft. Inputs live in the `REPLAYS` R2 bucket bound in `wrangler.jsonc`; no results, names, accounts, or request metadata are stored. Oversized histories fail explicitly rather than losing chronology.

## Run

Use Node >=24.12 and npm. Install with `npm ci`, then `npx playwright install chromium` for headless browser tests.

```sh
just dev --host 127.0.0.1 --port 5173
just test
just smoke --seed 162 --policy best
just calibrate --seed 162 --games 10000
```

Development and builds prepare the statistical, ranking, and image assets automatically. The first preparation needs network access and ImageMagick's `magick` executable for image conversion. Raw statistics and ranking exports are checksum-verified and cached under ignored `.cache/lahman/` and `.cache/rankings/`; source metadata and thumbnails are cached under ignored `.cache/media/`. Generated data and imagery belong under ignored `static/data/`, `static/rankings/`, and `static/media/`, never in source control. Synthetic test identities contain no public athlete names.

```sh
npm run data:prepare
npm run data:prepare -- --offline
npm run rankings:prepare
npm run rankings:prepare -- --offline
npm run media:prepare
npm run media:prepare -- --offline
npm run build
npx wrangler deploy --dry-run
just deploy
```

The rankings index pins the same source revision and SHA-256 as the statistical compiler. A season whose source rows cover fewer scheduled games than the shortest completed season in the covered window is published as unavailable rather than ranked from a fraction of a season.

The data compiler pins an immutable third-party transport commit and SHA-256 for every source CSV. Changed or missing bytes fail rather than selecting another release. Output URLs use a SHA-256 version of canonical transformed payloads. The versioned `diagnostics.json` records exclusions and estimated-field counts without display names.

## Images

Team marks use reviewed Wikimedia Commons sources. Historical marks apply only within their verified year ranges; other marks are labelled as current franchise identity. A missing reusable mark remains an explicit abbreviation fallback.

Player identity joins use Lahman identifiers and Wikidata's Baseball-Reference identifier property (`P1825`), then Commons images (`P18`) and verified player categories (`P373`). Acquisition reads every paginated root file and direct matching year/season category, not unrestricted category descendants. Only reusable public-domain, CC BY, or CC BY-SA files with an exact capture year inside the recorded playing career qualify. Reviewed archive entries may supply otherwise missing capture metadata with explicit capture and identity evidence; contradictory or approximate metadata remains excluded. Ambiguous group portraits and memorabilia are excluded rather than inferred as individual portraits. Upload dates, filenames, and category years are not capture evidence. Composite bullpen units never receive a player's portrait.

Public portraits must also appear in the reviewed per-player file inventory. Discovery alone never authorizes a new image or an unreviewed replacement for a rejected subject. New files require caption/identity review before entering that inventory.

Metadata batches travel in POST bodies rather than long query URLs. Acquisition retries interrupted transfers. Only complete responses are cached, with checksums verified on reuse. Offline preparation rebuilds from those caches, and prepared builds verify every published image's content hash. The development watcher ignores acquisition-cache writes while retaining source and published-asset updates.

Portraits prefer the drafted year, then the nearest verified playing-career year, with the actual photo year always labelled. Missing, loading, and failed images have distinct states and never block gameplay. Schema-2 media uses local, content-hashed WebP assets: portraits and marks are bounded to 384px, ballpark atmosphere to 1280px, without upscaling. The `/about#image-credits` section exposes source, photographer, licence, capture/identity evidence, and a downloadable manifest. Atmosphere is context, not a simulated historical venue. Copyright reuse does not establish trademark or athlete-likeness permission.

No Baseball-Reference subscription or API account is used. [Sports Reference does not provide a data API](https://www.sports-reference.com/bot-traffic.html); its site content and paid tools are not an image republication licence.

This is a non-commercial game intended for public sharing. Free documented-reuse assets are the default; no paid assets are purchased. [MLBAM's notice](https://gdx.mlb.com/components/copyright.txt) permits individual, non-commercial, non-bulk use without defining those terms. [MLB's general terms](https://www.mlb.com/official-information/terms-of-use#section-1) separately limit the download exception to personal, non-commercial home use. Public in-game headshot permission has not been established; individual fetching does not settle display rights. [Hall of Fame game use](https://baseballhall.org/discover-more/photo-archives/image-rights-reproduction) requires a quote, and [Alamy's game-inclusive licence](https://www.alamy.com/image-license-details/) starts at £300 per asset, outside the $25 total research ceiling. Personal-use stock prices are not public-game permission.

Draft ordering additionally uses the JEFFBAGWELL historical WAR file published at [Neil-Paine-1/MLB-WAR-data-historical](https://github.com/Neil-Paine-1/MLB-WAR-data-historical), which is an MIT-licensed, pinned, checksum-verified download that already averages Baseball-Reference and FanGraphs WAR. It is a ranking and comparison index only: it never feeds the simulation, and a missing value is published as unavailable rather than zero.

## Model and data

AL/NL franchise history from 1950–2025 is translated into a common combined 2025 batting-event environment. Historical source league priors, coarse park factors, generic platoon effects, inferred pitcher allowed extra-base hits, and explicit runner-advancement probabilities are approximations, not measured historical splits or a professional simulator. Missing sacrifice flies retain available records and yield conservative plate-appearance components; labelled OBP/OPS denominators are not reconstructed historical totals. Missing separate outfield counts use recorded generic-OF reliability or league estimates, never fabricated positional counts.

Each of three selected starters receives 54 starts. A capped/rested closer complements an independently drafted historical team-season bullpen remainder. The remainder pools positive-appearance pitcher-seasons with starts in at most 20% of appearances, excluding the saves leader (pitching outs, then ID, break ties), and uses BFP-weighted normalized rates. Its composition stays fixed independently of individual picks. Neutral handedness and unlimited support workload are arcade abstractions, not reconstructed relief-only innings. The schedule draws actual 2025 opposition but is not an official club schedule. All 162 games run, including after a loss.

The schedule independently shuffles five games against every opponent plus one extra game against twelve distinct opponents, alternating venues for 81 home and 81 away games. Opponent starters cycle through their five-player rotations. Closers may enter one half inning from the ninth onward when tied or leading by one to three, require three remaining seasonal outs, and rest after appearing in both immediately preceding challenge games. Other relief identifies the drafted team remainder in game boxes and season totals. Legacy schema-1/2, thirteen-pick inputs retain pa-v1 and league-average Support bullpen behavior when the recorded dataset matches; refreshed datasets never silently migrate old seeds.

Plate appearances account for inherited runners, forced advancement, errors, steals, double plays, and sacrifice flies. Extra innings begin with empty bases. Non-home-run walkoffs stop on the winning run and truncate hit credit to the winning runner's advance; home runs count every runner. A 1,000-PA half-inning or 100-inning bound raises an error instead of inventing a winner. Results retain all inning lines and batting/pitching boxes; worker progress never controls simulation randomness.
Season highlights and lowlights are the actual steal, caught-stealing, or plate-appearance events with the largest positive and negative change in the challenge team's neutral win probability. The win model uses the combined league event rates, actual inning/half, outs, occupied bases, and score, but intentionally removes player, pitcher, team, and park strength. Its absorbing half-inning Markov model sends runners from second and third home on singles, scores second and third on doubles while first takes third, scores every runner on triples and home runs, applies forced walk/HBP advancement, and treats other outs as one out with runners holding. Future steals, errors, double plays, and sacrifice flies are omitted from the projection even though actual simulated occurrences are measured as moments. Remaining half-innings and innings are convolved numerically; propagation stops only below 1e-13 remaining mass and rejects failed convergence or invalid mass. An equal-strength tie after regulation or the current extra inning is worth 0.5, with no ghost runner. A completed or skipped half produces an exact 1 or 0 rather than an estimated final-score story.

The game publishes runs allowed per nine innings (RA9) and outs-based baseball innings, not simulated ERA, wins, or saves whose official scoring is not reconstructed. Replay fragments contain versioned draft inputs, not trusted win records. They are friendly sharing, not a tamper-proof leaderboard.

Source: [SABR's Lahman database](https://sabr.org/lahman-database/). Transformed data is distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) with generated full attribution, pinned revision, changes notice, and a downloadable transformed-data archive. This data licence does not automatically determine an application-code licence.

The `/about` route describes rules, eligibility, workload, and statistical assumptions, and displays the generated source notice.
