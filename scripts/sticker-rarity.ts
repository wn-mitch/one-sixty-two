// Measures how often each sticker is earned: the native engine drafts and plays the seasons
// (`engine sticker-sample`), and this script scores every simulated card-season with the real
// sticker rules. A card that earns a tier also counts toward every lower tier of its family.
// Usage: node scripts/sticker-rarity.ts [--policy random,best,vorp,packs] [--from N] [--to N] [--seasons N] [--out path]
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { seasonStickers, STICKER_BY_KIND, STICKER_RULES_VERSION, STICKERS } from '../src/lib/collection/stickers.ts';
import { savedLines, seasonMvp } from '../src/lib/game/library.ts';
import type { RosterSlot } from '../src/lib/game/types.ts';
import type { SeasonResult } from '../src/lib/sim/types.ts';

interface SampleLine { picks: { seasonId: string; slot: RosterSlot }[]; result: Pick<SeasonResult, 'wins' | 'losses' | 'games' | 'batting' | 'pitching'> }

const options = { policy: 'random,best,vorp,packs', from: '1', to: '300', seasons: '10', out: 'src/lib/collection/sticker-rarity.json' };
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 2) {
 const key = args[index].replace(/^--/, '') as keyof typeof options;
 if (!(key in options) || args[index + 1] === undefined) throw new Error(`Usage: node scripts/sticker-rarity.ts ${Object.keys(options).map(name => `[--${name} value]`).join(' ')}`);
 options[key] = args[index + 1];
}

const engine = spawn('cargo', ['run', '--release', '--quiet', '-p', 'engine-cli', '--', 'sticker-sample',
 '--policy', options.policy, '--from', options.from, '--to', options.to, '--seasons', options.seasons], { stdio: ['ignore', 'pipe', 'inherit'] });
const exited = new Promise<number | null>(resolve => engine.on('close', resolve));

const reached = new Map<string, number>();
let seasons = 0, cards = 0;
for await (const text of createInterface({ input: engine.stdout })) {
 if (!text.trim()) continue;
 const { picks, result } = JSON.parse(text) as SampleLine;
 const slots = new Map(picks.map(pick => [pick.seasonId, pick.slot]));
 const profiles = new Map(picks.map(pick => [pick.seasonId, { seasonId: pick.seasonId, displayName: pick.seasonId, year: 0 }]));
 const entry = {
  record: { wins: result.wins, losses: result.losses },
  roster: picks.map(pick => ({ ...pick, label: pick.seasonId })),
  ...savedLines(result, slots, seasonId => seasonId),
  mvp: seasonMvp(result, profiles)
 };
 // seasonStickers keeps each family's top tier; count it and every tier below it.
 for (const { kind } of seasonStickers(entry)) {
  const earned = STICKER_BY_KIND.get(kind)!;
  for (const sticker of STICKERS) if (sticker.family === earned.family && sticker.tier <= earned.tier) reached.set(sticker.kind, (reached.get(sticker.kind) ?? 0) + 1);
 }
 seasons++;
 cards += picks.length;
}
const code = await exited;
if (code !== 0 || !seasons) throw new Error(`sticker-sample exited with ${code} after ${seasons} seasons`);

const table = {
 rulesVersion: STICKER_RULES_VERSION,
 sample: { policies: options.policy, drafts: `${options.from}-${options.to}`, seasonsPerDraft: Number(options.seasons), seasons },
 cards,
 // Every sticker kind in definition order; zero means the sample never produced it.
 reached: Object.fromEntries(STICKERS.filter(sticker => sticker.family !== 'loyalty').map(sticker => [sticker.kind, reached.get(sticker.kind) ?? 0]))
};
await writeFile(options.out, `${JSON.stringify(table, null, 1)}\n`);
console.log(`${seasons} seasons, ${cards} cards -> ${options.out}`);
