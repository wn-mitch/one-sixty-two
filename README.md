# 162-0

A browser baseball challenge: draft thirteen historical player-seasons, then play a deterministic 162-game season. SvelteKit 3, Svelte 5, Tailwind 4, and Cloudflare Workers Static Assets. Simulation stays in the browser; no account, database, or paid data API is required.

Draft progress and lineup order are saved locally. Reloading keeps the pending roll; network retries cannot reroll it. Only saves compatible with the current schema, model, and dataset resume. Sharing uploads a compact replay snapshot and returns a short link; the recipient's browser recomputes the season from the seed, picks, and order without replacing the locally saved draft. Snapshots hold only the versioned draft inputs and live in the `REPLAYS` R2 bucket bound in `wrangler.jsonc`; no results, names, accounts, or request metadata are stored.

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

Player identity joins use Lahman identifiers and Wikidata's Baseball-Reference identifier property (`P1825`), then Commons images (`P18`) and verified player categories (`P373`). Acquisition samples direct and year-category files; it is not an exhaustive image archive. Only reusable public-domain or compatible Creative Commons files with an explicit Commons `DateTimeOriginal` inside the recorded playing career qualify. Upload dates, filenames, and category years are not capture evidence.

Metadata batches travel in POST bodies rather than long query URLs. Acquisition retries interrupted transfers. Only complete responses are cached, with checksums verified on reuse. Offline preparation rebuilds from those caches, and prepared builds verify every published image's content hash.

Portraits prefer the drafted year, then the nearest verified playing-career year, with the actual photo year always labelled. Missing, loading, and failed images have distinct states and never block gameplay. Local WebP assets are bounded to 384px and use content-hashed URLs. The `/about#image-credits` section exposes source, photographer, licence, coverage, and a downloadable manifest. Image copyright licences do not grant trademark rights.

No Baseball-Reference subscription or API account is used. [Sports Reference does not provide a data API](https://www.sports-reference.com/bot-traffic.html); its site content and paid tools are not an image republication licence.

Draft ordering additionally uses the JEFFBAGWELL historical WAR file published at [Neil-Paine-1/MLB-WAR-data-historical](https://github.com/Neil-Paine-1/MLB-WAR-data-historical), which is an MIT-licensed, pinned, checksum-verified download that already averages Baseball-Reference and FanGraphs WAR. It is a ranking and comparison index only: it never feeds the simulation, and a missing value is published as unavailable rather than zero.

## Model and data

AL/NL franchise history from 1961–2025 is translated into a common combined 2025 batting-event environment. Historical source league priors, coarse park factors, generic platoon effects, inferred pitcher allowed extra-base hits, and explicit runner-advancement probabilities are approximations, not measured historical splits or a professional simulator.

Each of three selected starters receives 54 starts. A capped/rested closer complements a league-average support bullpen. This is an arcade workload abstraction, not a claim that real pitchers could sustain it. The schedule draws actual 2025 opposition but is not an official club schedule. Games continue through all 162, including after a loss.

The schedule independently shuffles five games against every opponent plus one extra game against twelve distinct opponents, alternating venues for 81 home and 81 away games. Opponent starters cycle through their own five-player rotations. Closers may enter one half inning from the ninth onward when tied or leading by one to three, require three remaining seasonal outs, and rest after appearing in both immediately preceding challenge games. All other relief is explicitly labelled **Support bullpen**.

Plate appearances account for inherited runners, forced advancement, errors, steals, double plays, and sacrifice flies. Extra innings begin with empty bases. Non-home-run walkoffs stop on the winning run and truncate hit credit to the winning runner's advance; home runs count every runner. A 1,000-PA half-inning or 100-inning bound raises an error instead of inventing a winner. Results retain all inning lines and batting/pitching boxes; worker progress never controls simulation randomness.

The game publishes runs allowed per nine innings (RA9) and outs-based baseball innings, not simulated ERA, wins, or saves whose official scoring is not reconstructed. Replay fragments contain versioned draft inputs, not trusted win records. They are friendly sharing, not a tamper-proof leaderboard.

Source: [SABR's Lahman database](https://sabr.org/lahman-database/). Transformed data is distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) with generated full attribution, pinned revision, changes notice, and a downloadable transformed-data archive. This data licence does not automatically determine an application-code licence.

The `/about` route describes rules, eligibility, workload, and statistical assumptions, and displays the generated source notice.
