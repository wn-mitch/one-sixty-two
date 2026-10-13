# Research task: newspaper phrases for a team's season, by how well it went

## Goal

Collect about 200 short, real phrases that newspapers have used to describe a baseball team's season (or a long stretch of it) relative to how well the team performed. Examples of the register we want: "a disappointing showing", "a season to forget", "the class of the league", "a juggernaut", "an also-ran", "a team that never got going".

The game (162-0, a baseball season simulator) will show one of these phrases on a finished season's results, picked by the season's grade. The phrases must read like period sports-page writing, not modern marketing copy.

## Citation is mandatory

Every phrase must cite a real, checkable published source in which it appears describing a team's performance. A phrase without a citation is not accepted, however plausible it sounds.

- Do not invent, paraphrase, or "reconstruct" a phrase. Copy the wording exactly as printed; note any spelling or punctuation you normalized.
- Do not cite a source you have not seen. If you find a phrase quoted secondhand, trace it to the original printing or mark the citation `secondhand` and name both sources.
- If you cannot verify a candidate, list it separately under "Unverified" with what you found. Do not mix it into the main list.
- Quote no more than the phrase plus at most a few words of surrounding context (keep each quotation under 25 words).

## Where to look

Prefer sources with stable public links:

- Library of Congress Chronicling America (chroniclingamerica.loc.gov), for pre-1964 papers with page-level links.
- Google News Archive (news.google.com/newspapers).
- Digitized archives of individual papers (NYT TimesMachine, Brooklyn Daily Eagle via Brooklyn Public Library, and similar).
- Sporting News and Baseball Magazine archives where available.
- Modern outlets (AP, newspaper websites) for recent decades.

Paywalled archives such as Newspapers.com are acceptable if you can see the clipping; cite the paper, date, page, and the clipping URL.

## Coverage

Spread the phrases across the whole range of outcomes, roughly evenly. Use these bands (win totals are for a 162-game season):

| Band | Season | Example tone |
|---|---|---|
| Perfect | 162-0 | unprecedented, immortal (phrases about historic greatness) |
| S+ / S | 146+ wins | the greatest team ever assembled, a juggernaut |
| AA / A | 132–145 | dominant, the class of the league, ran away with it |
| B | 118–131 | a fine season, contended all year, a solid club |
| C | 105–117 | respectable, middle of the pack, flashes of promise |
| D | 90–104 | a disappointing showing, never got untracked, an also-ran |
| F | 89 or fewer | a season to forget, a disaster, cellar dwellers |

Also aim for spread across eras (1900s to the present) and across papers. Avoid phrases that name a specific player, city, or franchise, so they can describe any club. Drop slurs and phrases that mock groups of people.

## Output format

Return one Markdown table or CSV with these columns, one row per phrase:

| Column | Content |
|---|---|
| `phrase` | The exact phrase, as printed |
| `band` | One of the bands above |
| `context` | The surrounding words as printed, under 25 words |
| `publication` | Newspaper or magazine name |
| `date` | Publication date (YYYY-MM-DD) |
| `page` | Page or section, if known |
| `headline` | Article headline, if known |
| `author` | Byline, if any |
| `url` | Direct link to the page, clipping, or article |
| `verified` | `yes` if you saw it in the original, `secondhand` otherwise |
| `notes` | Normalizations, ambiguities, or why it fits the band |

Then a short "Unverified" list with any candidates you could not trace, each with what you searched.

Aim for about 200 verified rows. Quality and real citations matter more than reaching the number.
