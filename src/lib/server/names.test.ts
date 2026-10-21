import { describe, expect, it } from 'vitest';
import { checkName } from './names.ts';

const accepted = (name: string) => checkName(name).ok;

describe('board name filter', () => {
	it('normalizes and keeps ordinary names, including digits-only and names containing short blocked words', () => {
		expect(checkName('  Babe   Ruth ')).toEqual({ ok: true, name: 'Babe Ruth' });
		for (const name of ['Cassidy', 'Titus', 'Sexton', 'Whitney', 'J.R. O\'Neil', 'Zoë_42', '1962', 'Glass Arm']) expect(accepted(name), name).toBe(true);
	});

	it('refuses lengths, characters and links', () => {
		expect(checkName('ab')).toEqual({ ok: false, reason: 'length' });
		expect(checkName('a'.repeat(21))).toEqual({ ok: false, reason: 'length' });
		expect(checkName('nice<script>')).toEqual({ ok: false, reason: 'characters' });
		for (const name of ['buy.com', 'me@x', 'www dot me', 'http stuff']) expect(checkName(name).ok, name).toBe(false);
	});

	it('catches disguised terms: leetspeak, separators, repeats, accents and look-alike letters', () => {
		for (const name of ['FUCK', 'fuuuuck', 'f.u.c.k', 'sh1t head', 'ßhit', 'аss', 'a s s', 'b!tch', 'Nаzi Fan', 'xXx_n1gg4_xXx', 'kys now']) {
			expect(checkName(name).ok, name).toBe(false);
		}
	});

	it('refuses hate numbers as whole runs only, and impersonation of the game or staff', () => {
		expect(accepted('Team 88')).toBe(false);
		expect(accepted('1488')).toBe(false);
		expect(accepted('Class of 1988')).toBe(true);
		for (const name of ['162-0 Admin', 'Official Team', '1620 Staff', 'Alpaca Soft', 'Alpacas0ft']) expect(accepted(name), name).toBe(false);
		// The studio's name is refused, not every alpaca.
		for (const name of ['TheAlpacalypse', 'Alpaca Fan']) expect(accepted(name), name).toBe(true);
	});

	it('takes added block terms and exempts allowed names', () => {
		expect(checkName('Grumpus', { block: ['grump'], allow: [] }).ok).toBe(false);
		expect(checkName('Dick Allen', { block: [], allow: [] }).ok).toBe(false);
		expect(checkName('Dick Allen', { block: [], allow: ['dick allen'] }).ok).toBe(true);
		// Longer terms match anywhere, so a real surname can need an allow entry.
		expect(checkName('Candy Cummings').ok).toBe(false);
		expect(checkName('Candy Cummings', { block: [], allow: ['candy cummings'] }).ok).toBe(true);
	});
});
