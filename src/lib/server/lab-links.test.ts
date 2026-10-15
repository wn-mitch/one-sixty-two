import { describe, expect, it } from 'vitest';
import type { ReplayBucket, ReplayPutOptions } from './replays.ts';
import { LAB_LINK_ID_PATTERN, LAB_LINK_PREFIX, LabLinkInvalidError, canonicalLabState, labFragment, labLinkId, loadLabLink, storeLabLink } from './lab-links.ts';
import { decodeLink } from '../lab/link.ts';

class MemoryBucket implements ReplayBucket {
	objects = new Map<string, Uint8Array>();
	async get(key: string) {
		const body = this.objects.get(key);
		return body ? { body } : null;
	}
	async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ReplayPutOptions) {
		const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
		if (options?.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
		this.objects.set(key, Uint8Array.from(bytes));
		return {};
	}
}

const STATE = {
	print: 'sheet', relief: 'rim', tier: 'gem', era: '2020s', film: 'galaxy', finish: '', palette: 'custom', gradient: ['#112233', '#445566'], under: '', plate: 'brushed', stock: '',
	tuned: { 'film:galaxy': { speed: 0.4 } }, light: { spotlight: 0.35 }, drift: false, stagger: null, zoom: 2
};

describe('lab links', () => {
	it('stores a state under the lab prefix and opens it again as the same setup', async () => {
		const bucket = new MemoryBucket();
		const id = await storeLabLink(bucket, { ...STATE, junk: 'dropped' });
		expect(id).toMatch(LAB_LINK_ID_PATTERN);
		expect([...bucket.objects.keys()]).toEqual([`${LAB_LINK_PREFIX}${id}`]);
		const loaded = await loadLabLink(bucket, id);
		expect(loaded).not.toHaveProperty('junk');
		const opened = decodeLink(labFragment(loaded!));
		expect(opened?.setup).toMatchObject({ film: 'galaxy', relief: 'rim', drift: false, gradient: ['#112233', '#445566'], tuned: { 'film:galaxy': { speed: 0.4 } }, light: { spotlight: 0.35 } });
		expect(opened?.zoom).toBe(2);
	});

	it('never overwrites a taken id and draws another', async () => {
		const bucket = new MemoryBucket();
		const ids = ['AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB'];
		const first = await storeLabLink(bucket, STATE, () => ids.shift()!);
		const before = bucket.objects.get(`${LAB_LINK_PREFIX}AAAAAAAA`);
		const second = await storeLabLink(bucket, { ...STATE, film: 'julia' }, () => ids.shift()!);
		expect([first, second]).toEqual(['AAAAAAAA', 'BBBBBBBB']);
		expect(bucket.objects.get(`${LAB_LINK_PREFIX}AAAAAAAA`)).toBe(before);
	});

	it('rejects states that are not lab setups or are too large', async () => {
		const bucket = new MemoryBucket();
		await expect(storeLabLink(bucket, [1, 2])).rejects.toBeInstanceOf(LabLinkInvalidError);
		await expect(storeLabLink(bucket, { film: '<script>' })).rejects.toBeInstanceOf(LabLinkInvalidError);
		await expect(storeLabLink(bucket, { light: { shine: 'bright' } })).rejects.toBeInstanceOf(LabLinkInvalidError);
		const huge = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`film:f${index}`, Object.fromEntries(Array.from({ length: 40 }, (_, dial) => [`dial${dial}`, 0.123456789]))]));
		await expect(storeLabLink(bucket, { tuned: huge })).rejects.toBeInstanceOf(LabLinkInvalidError);
		expect(bucket.objects.size).toBe(0);
	});
	it('preserves custom gradients and rejects incompatible explicit versions', () => {
		const gradient = ['#112233', '#AaBbCc', '#445566'];
		expect(canonicalLabState({ v: 1, palette: 'custom', gradient })).toMatchObject({ v: 1, palette: 'custom', gradient });
		expect(() => canonicalLabState({ v: 2, palette: 'custom', gradient })).toThrow(LabLinkInvalidError);
		expect(() => canonicalLabState({ palette: 'custom', gradient: ['#12345'] })).toThrow(LabLinkInvalidError);
	});

	it('draws ids from the full base62 alphabet', () => {
		const seen = new Set(Array.from({ length: 400 }, labLinkId).join(''));
		expect(seen.size).toBe(62);
		expect(loadLabLink(new MemoryBucket(), '../etc')).resolves.toBeNull();
	});
});
