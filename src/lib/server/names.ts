import { LDNOOBW_EN } from './name-blocklist.ts';

export const NAME_MIN = 3;
export const NAME_MAX = 20;

/**
 * Terms added to the LDNOOBW list: hate groups and figures, threats, and impersonation of the game or its
 * staff. Matching normalizes case, accents, look-alike letters, leetspeak, separators and repeated letters.
 */
const EXTRA_TERMS = [
	'nazi', 'hitler', 'heil', 'kkk', 'klan', 'isis', 'jihad', 'whitepower', 'whitepride', 'siegheil', 'aryan', 'reich', 'genocide',
	'holocaust', 'lynch', 'rapist', 'rape', 'pedo', 'pedophile', 'molest', 'nigga', 'nigger', 'niger', 'negro', 'chink', 'gook',
	'kike', 'spic', 'wetback', 'tranny', 'faggot', 'retard', 'killyourself', 'kys', 'suicide', 'shooter', 'terrorist', 'cocaine',
	'heroin', 'meth', 'fentanyl', 'weed', 'stoner', 'porn', 'onlyfans', 'nsfw', 'hentai', 'horny', 'boob', 'penis', 'vagina',
	'dick', 'cock', 'pussy', 'bitch', 'shit', 'fuck', 'cunt', 'whore', 'slut', 'twat', 'wank', 'piss', 'crap', 'damn',
	'admin', 'moderator', 'official', 'staff', 'alpaca', 'onesixtytwo', '1620', 'system', 'support'
];

/** Hate numbers, refused as whole digit runs so ordinary numbers in a name pass. */
const NUMBER_TERMS = new Set(['88', '1488', '14', '1312', '311']);

/** Look-alike letters from other scripts, folded to the Latin letter they imitate. */
const CONFUSABLES: Record<string, string> = {
	а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd',
	ß: 'ss', α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w'
};
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'l' };
const URL_LIKE = /@|https?|www|\.(?:com|net|org|io|gg|tv|dev|co|me|app|xyz|ly|ru|link|site|online|live|info|biz)(?:\b|$)/i;
const ALLOWED = /^[\p{L}\p{N} .'_-]+$/u;

/** Lowercase Latin text with accents, zero-width characters and look-alike letters removed. */
function basic(text: string): string {
	return text.normalize('NFKD').replace(/\p{M}|[​-‍⁠﻿]/gu, '').toLowerCase()
		.replace(/./gu, char => CONFUSABLES[char] ?? char);
}
const leet = (text: string) => text.replace(/./g, char => LEET[char] ?? char);
const squeeze = (text: string) => text.replace(/(.)\1+/g, '$1');
/** The form a term is compared in: letters and digits only, leetspeak read as letters, repeats collapsed. */
const matchForm = (text: string) => squeeze(leet(basic(text)).replace(/[^a-z]/g, ''));

export interface NameRules { block: readonly string[]; allow: readonly string[] }

interface Compiled { long: string[]; short: Set<string>; allow: Set<string> }
const seed = [...LDNOOBW_EN, ...EXTRA_TERMS];

function compile(rules: NameRules): Compiled {
	const forms = [...seed, ...rules.block].map(matchForm).filter(Boolean);
	return {
		// Long terms match anywhere; three letters or fewer only as a whole word, so Cassidy and Cummings pass.
		long: forms.filter(form => form.length > 3),
		short: new Set(forms.filter(form => form.length <= 3)),
		allow: new Set(rules.allow.map(name => basic(name).trim()))
	};
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: 'length' | 'characters' | 'link' | 'blocked' };

/** NFKC-normalized, trimmed, single-spaced display name. */
export function normalizeName(raw: string): string {
	return raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/** Checks a submitted board name; the filter refuses a harmless name before it shows an offensive one. */
export function checkName(raw: string, rules: NameRules = { block: [], allow: [] }): NameCheck {
	const name = normalizeName(raw);
	const length = [...name].length;
	if (length < NAME_MIN || length > NAME_MAX) return { ok: false, reason: 'length' };
	if (!ALLOWED.test(name)) return { ok: false, reason: 'characters' };
	if (URL_LIKE.test(name)) return { ok: false, reason: 'link' };
	const compiled = compile(rules);
	if (compiled.allow.has(basic(name))) return { ok: true, name };
	const whole = matchForm(name);
	const words = basic(name).split(/[\s._'-]+/).map(matchForm).filter(Boolean);
	const digitRuns = basic(name).match(/\d+/g) ?? [];
	const blocked = compiled.long.some(term => whole.includes(term))
		|| [...words, whole].some(word => compiled.short.has(word))
		|| digitRuns.some(run => NUMBER_TERMS.has(run));
	return blocked ? { ok: false, reason: 'blocked' } : { ok: true, name };
}
