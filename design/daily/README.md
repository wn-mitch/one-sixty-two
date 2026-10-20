# Daily standings and scouting grade

This document specifies the daily run's shared standings and the scouting grade. L01 (the scouting grade), L02 (the daily percentile and records curve) and L03 (the named, verified board) are implemented. The daily run itself (`src/lib/game/daily.ts`) is current behavior: one seed and one pinned home stadium per New York calendar day, one attempt per device recorded in the device table `daily_runs`, and a replay carrying `daily: "YYYY-MM-DD"`.

## Goals

- Every player who finishes a daily learns where the run stands among that day's runs: "Top 7% of 1,240 daily runs", with the day's spread of records drawn as a curve that marks the player's run.
- A short named board shows the day's best runs. Every run on it has been recomputed on the server.
- Every season, Classic or daily, gets a scouting grade that separates taking the obvious card from finding value lower on the list.

Non-goals: accounts, cross-day ladders, prizes, and protection against a determined cheater on the percentile. The percentile trusts the client; only the visible board is verified.

## Trust model

The server never simulates a season on submission. A submission names an already stored replay (`/api/replays`, R2) and claims a record. Everything except the record comes from the stored replay, so roster, picks, seed and versions cannot be claimed separately from it.

| Data | Source | Trusted? |
| --- | --- | --- |
| Picks, seed, stadium, versions | Stored replay in R2 | Shape-checked on store; full draft history checked on verification |
| Wins, losses, runs for and against | Client claim | Trusted for the percentile until verified |
| Device | Client token, stored hashed | One submission per device per day |

The percentile counts every accepted submission that is not rejected or banned. Unverified rows count. A forged record moves other players' percentiles slightly; it cannot reach the board.

The named board shows **verified rows only**. Unverified rows that would rank in the top N are not shown as pending. A forged 162-0 shown even briefly as "pending" is the screenshot that matters, and hiding it costs a legitimate run one verification interval. A player whose own run would place is told on their device: "Your run is in today's top 25. It joins the board once it is checked."

### Verification

Verification runs on demand, and the board holds N = 25 rows. After each standings `GET` for a live day, the Worker uses `waitUntil` to check up to two unverified rows whose claimed record would rank within the top N among non-rejected rows, best first. Each row is claimed first (`verifying_at`, retaken after two minutes if its check died), so concurrent requests never recompute the same run. Each check:

1. Load the replay from R2 (`loadReplay`).
2. Load the manifest, `simulation.json` and the needed profile chunks from the `ASSETS` binding, as the browser does from `/data/{dataVersion}/`.
3. Validate the full draft history (`validateReplay`). The submission path checks shape only.
4. Build the season input (`prepareSeasonInput`) and play it with the wasm engine.
5. Compare wins, losses, runs for and runs against with the claim. A match sets `verified`; a difference sets `rejected` and increments the device's `flags`.

When data cannot be loaded, the claim is released and the next view retries. A mismatch is not an automatic ban. The engine is deterministic within one model and data version, so a mismatch means tampering or a bug, and an admin decides which.

Chosen: **wasm in the Worker, on demand.** It runs the same TypeScript validation and the same engine build as every browser, reads data from the deployed assets, so it is always on the deployed data version, and adds no second deployment or credential. Workers cannot compile wasm at runtime, so the build bundles the engine as a compiled module (`scripts/worker-wasm-plugin.ts`). Measured cost is about 0.9 s of CPU per check (manifest parse 24 ms, replay validation 56 ms, season 740 ms), inside the Workers Paid request limit (`limits.cpu_ms` 30 s). Checks follow views, so a quiet day costs nothing; only the top N are ever recomputed. The SvelteKit Cloudflare adapter exports no scheduled handler, which ruled out a Cron Trigger.

Rejected: **a native `engine-cli` job outside Cloudflare.** It has no CPU limit, and wasm and native results are identical (`libm`). But it needs a host with the 112 MB prepared dataset on the exact deployed `dataVersion`, D1 API credentials outside Cloudflare, a port of replay validation (`engine-cli/src/draft/` ports draft rules for calibration, not replay checking), and a second deployment that must track every data or model change.

### Version boundaries

A board is keyed by date plus `dataVersion`, `modelVersion` and `rulesVersion`. `loadReplay` rejects a replay from another data version, so a deploy that changes any of the three during a day starts a new board for the rest of that day. Rows from the earlier version become `retired`: they keep their device's one submission and are neither verified nor counted. This follows the release policy: replays and seeded results are disposable across releases. Avoiding data deploys during the day is an operational choice, not a code requirement.

## Identity, names and bans

There are no accounts. On its first daily submission a device generates a 128-bit random token and stores it in a new device-database table. This is a schema change, so it ships as a new step in `src/lib/storage/migrations.ts` and never edits a released step. The server stores only the token's SHA-256, so a leaked D1 export cannot be used to submit as someone else. The iOS app and the website have separate storage and separate tokens.

The same migration adds a submission state to `daily_runs` (`null`, `accepted`, `rejected`), so a failed submission retries the day's first completed season and never a later one. The client always submits the season recorded in `daily_runs.season_key`.

**Names** are optional, shown only on the named board, and sent with the submission. A run without a name, or with a refused name, is listed as "Anonymous". A refused name never blocks the run: the response says the name was not accepted, and the player can submit a different one for that day's row. The checks, in order:

1. NFKC-normalize, trim, and collapse inner whitespace. Allow letters, digits, spaces and `.-'_`, 3 to 20 characters after normalization. A name of digits only is allowed.
2. Reject URLs and handles (`http`, `www`, `@`, dot-TLD patterns).
3. For matching only: lowercase, strip diacritics and zero-width characters, fold confusable letters (Cyrillic and Greek look-alikes) to Latin, map leetspeak (`0→o 1→i 3→e 4→a 5→s 7→t 8→b 9→g @→a $→s`), collapse repeated letters, and drop separators and digits between letters.
4. Reject any blocklist term longer than three letters found **anywhere** in the matching form, not only as a whole word; terms of three letters or fewer match only a whole word or the whole name, so Cassidy and Titus pass. Hate numbers match only as whole digit runs, so "Class of 1988" passes and "Team 88" does not. An allowlist entry exempts a specific name; it does not exempt a term. The filter favors refusing a harmless name over showing an offensive one; "Anonymous" costs the player nothing.

The default blocklist is deliberately broad. The seed list ships in source and covers profanity, slurs, sexual terms, drug and violence terms, and hate symbols and numbers (`88`, `1488`, `14 words` and similar), built from the English LDNOOBW list (CC BY 4.0, credited on `/credits`) plus hand additions. It also blocks impersonation of the game or staff (`1620`, `onesixtytwo`, `admin`, `moderator`, `official`, `alpaca`, `staff`, `support`, `system`). Real-person impersonation is left to reports: blocking every player name in the dataset would refuse too many ordinary names. The `name_rules` table adds block or allow entries without a deploy.

**Reports.** Any device with a counted submission that day can report a named row once. A name is **held** after three reports from distinct, unbanned devices: the row stays on the board as "Anonymous" until an admin restores the name or hides it for good. Reports never affect the run's record, rank or verification. A device whose reports are repeatedly overturned is flagged like any other abuse.

**Bans** bind to the device hash. A banned device is shadow-banned: its submissions are accepted, and it still sees its own percentile, but it is excluded from the board and from other players' percentiles and curves. Clearing site data, a private window, another browser or the iOS app gets a new token. This is a known weakness. The existing IP rate limit (`UPLOAD_LIMIT`) is the only mitigation, and this design adds none.

**Administration** uses `wrangler d1 execute` against the production database: list held names and flagged devices, restore or hide a name, ban or unban, add a `name_rules` term. The README documents the commands. A protected admin endpoint is deferred until command-line moderation proves too slow.

**Policy pages.** The board launches with a conduct page and `/privacy` additions; the draft copy is under [Policy copy](#policy-copy-draft).

## Storage (D1)

```sql
CREATE TABLE daily_submissions (
 date TEXT NOT NULL,                 -- YYYY-MM-DD, the replay's `daily`
 device TEXT NOT NULL,               -- hex SHA-256 of the device token
 replay_id TEXT NOT NULL,
 data_version TEXT NOT NULL, model_version TEXT NOT NULL, rules_version TEXT NOT NULL,
 wins INTEGER NOT NULL, losses INTEGER NOT NULL, runs_for INTEGER NOT NULL, runs_against INTEGER NOT NULL,
 name TEXT,                          -- accepted display name, or NULL
 name_state TEXT NOT NULL DEFAULT 'shown' CHECK (name_state IN ('shown', 'held', 'hidden')),
 status TEXT NOT NULL CHECK (status IN ('unverified', 'verified', 'rejected', 'retired')),
 submitted_at TEXT NOT NULL,
 verifying_at TEXT,                  -- claim taken before a recomputation, so two requests never check one row
 verified_at TEXT,
 entry TEXT,                         -- random public id on the board; unique per date
 roster_key TEXT,                    -- set by verification; identical rosters share one board row
 PRIMARY KEY (date, device)          -- first submission per device per day wins
);
CREATE INDEX daily_board ON daily_submissions (date, data_version, status, wins DESC);

CREATE TABLE devices (
 device TEXT PRIMARY KEY, banned_at TEXT, flags INTEGER NOT NULL DEFAULT 0, note TEXT
);

CREATE TABLE name_reports (
 date TEXT NOT NULL, entry TEXT NOT NULL, reporter TEXT NOT NULL,  -- reporter is a device hash
 reported_at TEXT NOT NULL,
 PRIMARY KEY (date, entry, reporter)
);

CREATE TABLE name_rules (term TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('block', 'allow')));
```

The Worker applies this schema itself, in numbered steps on first use in an isolate (`src/lib/server/daily-standings.ts`), so the schema ships with the code that reads it. A replay ID is not unique per day: replays are content-addressed, so two players who make identical picks in the same order share one replay, and both runs count. A cheater gains nothing from reusing a replay that a fresh device token does not already give.

**Retention.** Submissions, names and reports are deleted 90 days after their date, the same schedule as share images, on each submission. A board older than 90 days is no longer viewable; its replays stay public, as every replay does.

Percentile and distribution queries join `devices` to exclude banned rows. They count only rows on the board's current versions whose status is not `rejected` or `retired`.

## API

- `POST /api/daily/{date}` with `{ replayId, record: { wins, losses, runsFor, runsAgainst }, token, name? }`. The Worker loads the replay and requires `replay.daily === date`, `replay.seed === dailySeed(date)`, current versions, and a record that sums to 162 games (the check share images already use). It accepts `date` only while that daily is live, plus two hours after midnight New York for seasons started before midnight. It inserts with `ON CONFLICT DO NOTHING`; a repeat submission returns the existing row's standing. A row's public `entry` is a random 16-hex id, so the board never shows the device hash. Response: `{ rank, total, topPercent, record, entry, name, nameAccepted? }`; a device whose entry has no accepted name may send another name later that day.
- `POST /api/daily/{date}/report` with `{ entry, token }` records a report as described under Reports. It returns 204 whether or not the report counted, so it reveals nothing about the threshold.
- `GET /api/daily/{date}?wins=N` returns `{ total, distribution, standing, final }` today (`standing` only with `wins`, for a day that no longer accepts the device's refresh); plus `board: [{ entry, name, wins, losses, runDiff, replayId, copies }]` and `checkedAt`. It is served with a short edge cache (about 60 seconds). Any earlier date with retained rows stays viewable, and its board and curve are final once the grace period ends.

**Distribution.** `distribution` is the count of counted rows at each win total, as `[[wins, count], …]` for the win totals that occur. The client bins it (five-win bins) and draws the curve with the player's own run marked. It counts the same rows as the percentile, so it also trusts claimed records.

**Percentile.** `rank = 1 + count(wins > mine)`, so ties share the better rank. `topPercent = ceil(100 × rank / total)`. Records are ranked by wins only, because ties are expected and a run-differential tiebreak would make the percentile sound more exact than it is. The board breaks ties by run differential, then by earliest `submitted_at`. Both numbers change all day; the display says "so far" until the date closes. Below the median the display shows the rank instead ("#900 of 1,240"), since "Top 80%" reads as praise.

**Identical rosters.** The season is seeded by the draft seed, which every daily run shares, so the same sixteen seasons in the same batting order, rotation and relief roles play the same season. The board lists such a group once, at its earliest submission, with a count such as "3 runs with this roster", rather than repeating rows. The group key is a hash of the replay's picks and lineup orders.

## Scouting grade (every run, on the device)

The grade asks whether the player took the card the list put first or found more value lower down. It is computed in the browser from the replay, so it works for Classic and daily runs, needs no server, and does not change.

**Offered set.** Replay the draft actions from the seed (the same chronology `replayChronology` reconstructs). For pick *i*, the offered set *O_i* is every legal card in every pack open at the moment of the pick. Before a `choose-pack`, that is all packs on the table. Restrict it to cards eligible for the slot the player filled, so the grade judges which card, not which slot.

**Obvious card.** *T_i* is the card in *O_i* with the highest composite WAR/162 (batting WAR for hitter slots, pitching WAR for pitcher slots). This is the default `war` sort of `CandidateList`, so it is what the list shows first. Ties go to the lower season ID, the list's stable order.

**Value.** `valueRuns` is the card's modeled runs above replacement, which already drives the draft grade (`grade.ts`). `draft-cards.json` holds it for every card in one columnar file, so the browser does not need each pack's profile chunk. `valueRuns` is priced at the card's best slot, not necessarily the slot it filled; that approximation is accepted.

Per pick, with *P_i* the card taken:

- `obvious_i = (P_i == T_i)`
- `edge_i = valueRuns(P_i) − valueRuns(T_i)`, which is 0 when obvious

Per run:

- **Chalk rate** `C = count(obvious_i) / 16`
- **Scout edge** `E = Σ edge_i` (runs gained or lost by leaving the list's top card)

The first matching row sets the label:

| Label | Condition |
| --- | --- |
| Talent scout | `E ≥ E_scout` |
| Off the board | `E ≤ E_off` (went off-list and lost value) |
| By the book | `C ≥ C_book` |
| Sharp eye | any other run: off-list often, without a large gain or loss |

The thresholds come from 1,000 native calibration drafts per policy:

- `E_scout = +44`: the 25th percentile of `E` for the `vorp` policy, which drafts by `valueRuns` and is the scout baseline. 44 runs is about two wins.
- `E_off = −44`: the mirror of `E_scout`. Every `random` draft falls below it; 0.5% of `best` drafts do.
- `C_book = 12`: the 90th percentile of `C` for the `vorp` policy. The obvious-card policy itself always scores 16, so its own distribution cannot set the band.

`just draft-spread` reports `chalk` and `edge` for every draft. Its `chalk` policy takes `T_i` for the first open slot; `best` picks by line value (OPS for hitters, ERA for pitchers), not WAR/162, and lands a talent scout in about half its drafts. `SCOUTING_BANDS` in `src/lib/game/scouting.ts` holds the bands; refit them when card values, rankings or draft rules change.

Rejected: **field ownership**, the share of the day's runs that rostered each card. Only the first roll of a daily is identical for everyone, so ownership mostly measures pack luck rather than choice, and it needs a minimum sample before it means anything. The pack-relative scouting grade measures choice alone.

Rejected: **a shared daily deck** that deals every player the same franchise order. With one season seed per day, drafters who take the best card from identical packs converge on identical rosters and identical records, and the board fills with ties. The current dealing lets each pick reshape later packs, which keeps rosters apart.

## Surfaces

- **Daily Results**: the record, "Top X% of N daily runs so far", the distribution curve with the run marked, the scouting label with `E` (for example "+38 runs over the obvious cards"), the run's board place once verified (or the top-25 waiting note), an optional board name field while the run has no accepted name, and a link to the board. There is no per-pick breakdown: showing which card was the obvious one and how much value each pick gave up would teach the value model and make drafting more solvable.
- **Classic Results**: the scouting label only.
- **Home daily tile**: after completion, today's percentile, a link to the board and the countdown to the next daily. Before completion, the current number of runs.
- **Board page** (`/daily/{date}`): the day's curve and the named board (place, name or Anonymous, record and run differential, copies of the roster, replay link), for today and earlier retained dates. The device's own row is marked; a device with its own counted run sees Report on other named rows while the day is live.
- **Share artwork**: the scouting label only. It is deterministic. Percentile and distribution change during the day and would be wrong in an immutable PNG.

## Delivery

| Step | Usable result | Gate |
| --- | --- | --- |
| L01: Scouting grade | Label and scout edge on all Results | `chalk` policy and calibrated thresholds |
| L02: Daily percentile | Submission, D1, device token migration, percentile and curve on Results and Home | `/privacy` update |
| L03: Verified board | On-demand verification, named board, name filtering, reports, ban commands | Measured wasm season and manifest cost in workerd; conduct page |

L01 has no server dependency and can ship alone.

## Policy copy (draft)

Shipped in `/privacy` and `/conduct`.

### `/conduct`: Board names

> A name is optional. It appears only next to your run on the daily board, and anyone can see it.
>
> Names are 3 to 20 letters, digits, spaces and `. - ' _`. We refuse names that are profane, sexual, hateful, threatening, or about drugs; names that look like links or social handles; and names that pretend to be 162-0, its staff, or a real person. Our filter is strict on purpose and sometimes refuses a harmless name. A refused name never costs you your run: it is listed as "Anonymous", and you can try another name that day.
>
> Anyone who finished the same daily can report a name. A reported name may be hidden while we review it. We can hide any name and can remove a device from the board and from everyone's standings, without notice, if it breaks these rules or submits a record the game did not produce.
>
> To ask about a hidden name, contact Alpaca Software from the link in the website footer and include the replay link.

### `/privacy` additions

A new section, "Daily standings", after "Replay links and shared images":

> When you finish the daily, the game sends your season's replay link and record to our server to place you in that day's standings. To keep one entry per device each day, your device creates a random code and stores it locally; our server keeps only a scrambled (hashed) form of it, which is not linked to you or to any account. If you add a board name, we store it with your entry. If you report a name, we store that report with your device's hashed code.
>
> Board names, records and replay links are public. Entries, names and reports are deleted 90 days after the daily's date; the replays they link to are kept like any other replay. Clearing the website's data or reinstalling the app creates a new code, and earlier entries stay until they expire.

Changed sentences:

- Intro: "completed Classic seasons can automatically publish replay data and share images" becomes "completed Classic and daily seasons can automatically publish replay data, share images and daily standings entries".
- Children's privacy: "The game does not ask players for a name, email address, birth date, or account profile" becomes "The game does not ask for an email address, birth date, or account profile. The daily board accepts an optional display name; please do not use a real name."
- Your choices: add "To remove a daily board name or entry before it expires, contact us with its replay link."
