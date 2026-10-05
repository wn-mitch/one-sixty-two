import type { AcquisitionInput, AcquiredTables } from '../data/acquire.ts';
import { acquireTablesFrom } from '../data/acquire.ts';

export const RANKINGS_SOURCE_COMMIT = '1c8c3084d62112efdaa7054125af3cd01003e38d';
export const RANKINGS_SOURCE_REPOSITORY = 'https://github.com/Neil-Paine-1/MLB-WAR-data-historical';
export const RANKINGS_SOURCE_FILE = 'jeffbagwell_war_historical_2025.csv';
export const RANKINGS_SOURCE_BASE_URL = `${RANKINGS_SOURCE_REPOSITORY}/raw/${RANKINGS_SOURCE_COMMIT}`;
export const RANKINGS_SOURCE_URL = `${RANKINGS_SOURCE_BASE_URL}/${RANKINGS_SOURCE_FILE}`;
export const RANKINGS_SOURCE_CHECKSUM =
	'0572a8971128444cfa1dd75292fba0795f05df7d5c6617b67adda24ee2a1e60d';
export const RANKINGS_README_URL = `${RANKINGS_SOURCE_REPOSITORY}/blob/${RANKINGS_SOURCE_COMMIT}/README.md`;
export const RANKINGS_LICENSE_URL = `${RANKINGS_SOURCE_REPOSITORY}/blob/${RANKINGS_SOURCE_COMMIT}/LICENSE.txt`;
export const RANKINGS_README_CHECKSUM =
	'621dac0d72c4b8263a665721c1c02da4939c2765393f3625e1f84e386034876e';
export const RANKINGS_LICENSE_CHECKSUM =
	'1545615554fbf1609c3ce1d18f38d879acb4c305d72822f6aeb0c0e4d4a6872d';


export const RANKINGS_LICENSE_TEXT = `MIT License

Copyright (c) 2024 Neil Paine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export const RANKINGS_SOURCE_DESCRIPTION =
	'JEFFBAGWELL composite WAR per 162 team games: bwar162 is the source batting composite, and pwar162 is the source pitching composite (not br_pwar162). The pinned 2025 annual export is the only file in this repository covering 2025; its 2025 rows are a partial season captured on 2025-05-10 (scheduled games at most 24), while the unversioned historical export stops at 2022. The exports are never combined. A season whose source rows cover fewer than 60 scheduled games — fewer than the shortest completed season in the covered window, 2020 — is treated as an incomplete capture and published unavailable rather than ranking a fraction of a season. WAR is unavailable when the source field is blank or NA; it is not estimated.';

export async function acquireRankingsSource(offline = false): Promise<AcquiredTables> {
	const input: AcquisitionInput = {
		cacheDir: '.cache/rankings',
		baseUrl: RANKINGS_SOURCE_BASE_URL,
		checksums: { [RANKINGS_SOURCE_FILE]: RANKINGS_SOURCE_CHECKSUM },
		fetch: (url) => fetch(url)
	};
	return acquireTablesFrom(input, offline);
}
