import { expect, test, type Page } from '@playwright/test';
import { FILMS } from '../../lib/cards/surface/holo-films.ts';
import { filmDials, dialValues } from '../../lib/cards/surface/films/film.ts';
import { GOSPER_CHILDREN, GOSPER_MAX_DETAIL } from '../../lib/cards/surface/films/gosper-curve.ts';
import { LIGHT_VERTEX, lightFragment } from '../../lib/cards/surface/light-shader.ts';
import { DEFAULT_LIGHT, programSpec } from '../../lib/cards/surface/light-renderer.ts';
import { parseSetup } from '../../lib/lab/controls.ts';
import { encodeLink } from '../../lib/lab/link.ts';

type Pose = { dials?: Record<string, number>; view?: [number, number]; time?: number };

// Read the production pattern before lighting: a colour sweep alone must not count as geometry moving.
async function geometry(page: Page, name: string, poses: Pose[], inspectGrooves = false, periodicity?: [number, number]) {
	const index = FILMS.findIndex(film => film.name === name);
	const dials = filmDials(FILMS[index]!);
	const source = lightFragment(programSpec(index, 0, {}));
	const fragment = source.slice(0, source.indexOf('\nvoid main() {')) + `
void main() {
	vec2 groove = vec2(1.0, 0.0);
	float seed = 0.0, vivid = 0.0, copper = 0.0, copperPad = 0.0, shade = 1.0, cellSize = 100.0, ground = -1.0;
	footprint = max(length(fwidth(v_card * CARD)), 1e-5);
	filmPattern(${index}, v_card * CARD + v_view.zw, groove, seed, vivid, copper, copperPad, shade, cellSize, ground);
	o_color = ${inspectGrooves ? 'vec4(groove * 0.5 + 0.5, copper, 1.0)' : 'vec4(seed < 0.0 ? 0.0 : 0.5 + seed * 0.5, copper, vivid, 1.0)'};
}`;
	return page.evaluate(({ vertex, fragment, index, values, shift, periodicity }) => {
		const canvas = document.createElement('canvas');
		canvas.width = 250;
		canvas.height = 350;
		const gl = canvas.getContext('webgl2')!;
		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type)!;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)!);
			return shader;
		};
		const vs = compile(gl.VERTEX_SHADER, vertex);
		const fs = compile(gl.FRAGMENT_SHADER, fragment);
		const program = gl.createProgram()!;
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)!);
		gl.useProgram(program);
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height);
		gl.uniform1f(gl.getUniformLocation(program, 'u_holoScale'), 8);
		gl.uniform1f(gl.getUniformLocation(program, 'u_shift'), shift);
		gl.uniform1i(gl.getUniformLocation(program, 'u_tuneFilm'), index);
		gl.vertexAttrib2f(0, 0, 0);
		gl.vertexAttrib4f(1, canvas.width, 0, 0, canvas.height);
		const result = values.map(({ tune, view, time }) => {
			gl.uniform1fv(gl.getUniformLocation(program, 'u_filmTune[0]'), tune);
			gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
			// Keep the same seeded crop while changing only the viewer's tilt.
			gl.vertexAttrib4f(4, view[0], view[1], 0.37, -0.21);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			const pixels = new Uint8Array(canvas.width * canvas.height * 4);
			gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			const red = (x: number, y: number) => pixels[(Math.floor(y * canvas.height) * canvas.width + Math.floor(x * canvas.width)) * 4]!;
			const blue = (x: number, y: number) => pixels[(Math.floor(y * canvas.height) * canvas.width + Math.floor(x * canvas.width)) * 4 + 2]!;
			let maskCoverage: number | undefined;
			let largestComponent: number | undefined;
			let periodOverlap: number | undefined;
			if (periodicity) {
				const [dx, dy] = periodicity;
				const mask = new Uint8Array(canvas.width * canvas.height);
				let ink = 0;
				for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
					const present = pixels[(y * canvas.width + x) * 4 + 1]! > 32;
					mask[y * canvas.width + x] = present ? 1 : 0;
					ink += present ? 1 : 0;
				}
				maskCoverage = ink / mask.length;
				let overlap = 0, union = 0;
				for (let y = 0; y + dy < canvas.height; y++) for (let x = 0; x + dx < canvas.width; x++) {
					const a = mask[y * canvas.width + x]!, b = mask[(y + dy) * canvas.width + x + dx]!;
					overlap += a && b ? 1 : 0;
					union += a || b ? 1 : 0;
				}
				periodOverlap = union === 0 ? 0 : overlap / union;
				let largest = 0;
				const seen = new Uint8Array(mask.length);
				for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
					const start = y * canvas.width + x;
					if (!mask[start] || seen[start]) continue;
					let size = 0;
					const queue = [start];
					seen[start] = 1;
					for (let head = 0; head < queue.length; head++) {
						const current = queue[head]!;
						const cx = current % canvas.width, cy = Math.floor(current / canvas.width);
						size++;
						for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
							const nx = cx + ox, ny = cy + oy;
							if (nx < 0 || nx >= canvas.width || ny < 0 || ny >= canvas.height) continue;
							const neighbour = ny * canvas.width + nx;
							if (mask[neighbour] && !seen[neighbour]) { seen[neighbour] = 1; queue.push(neighbour); }
						}
					}
					largest = Math.max(largest, size);
				}
				largestComponent = ink === 0 ? 0 : largest / ink;
			}
			return {
				image: canvas.toDataURL(),
				maskCoverage, largestComponent, periodOverlap,
				corners: [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([x, y]) => red(x!, y!)),
				left: red(0.2, 0.5), right: red(0.8, 0.5), top: red(0.5, 0.8), bottom: red(0.5, 0.2),
				vivid: {
					corners: [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([x, y]) => blue(x!, y!)),
					left: blue(0.2, 0.5), right: blue(0.8, 0.5), top: blue(0.5, 0.8), bottom: blue(0.5, 0.2)
				}
			};
		});
		gl.deleteProgram(program);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		return result;
	}, {
		vertex: LIGHT_VERTEX, fragment, index, shift: DEFAULT_LIGHT.shift, periodicity,
		values: poses.map(pose => ({ tune: dialValues(Object.fromEntries(Object.entries(dials).map(([key, dial]) => [key, { ...dial, value: pose.dials?.[key] ?? dial.value }]))), view: pose.view ?? [0, 0], time: pose.time ?? 0 }))
	});
}

async function renderedDifference(page: Page, reference: string): Promise<number> {
	return page.evaluate(async reference => {
		const current = document.querySelector<HTMLCanvasElement>('.lab-card canvas.light')!.toDataURL();
		const images = await Promise.all([reference, current].map(async source => createImageBitmap(await (await fetch(source)).blob())));
		const pixels = images.map(image => {
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);
			image.close();

			return context.getImageData(0, 0, canvas.width, canvas.height).data;
		});
		if (pixels[0]!.length !== pixels[1]!.length) return Infinity;
		let error = 0;
		for (let index = 0; index < pixels[0]!.length; index++) {
			error += Math.abs(pixels[0]![index]! - pixels[1]![index]!);
		}
		return error / pixels[0]!.length;
	}, reference);
}
test('Gosper substitution keeps each sampled order connected and unit-normalized', () => {
	expect(GOSPER_MAX_DETAIL).toBe(8);
	expect(GOSPER_CHILDREN).toHaveLength(14);
	for (const offset of [0, 7]) {
		const children = GOSPER_CHILDREN.slice(offset, offset + 7);
		expect(children[0]!.start).toEqual([0, 0]);
		for (const child of children) {
			expect(Math.hypot(...child.axis)).toBeCloseTo(1 / Math.sqrt(7), 6);
		}
		for (let index = 1; index < children.length; index++) {
			const previous = children[index - 1]!;
			const current = children[index]!;
			expect(current.start[0]).toBeCloseTo(previous.start[0] + previous.axis[0], 6);
			expect(current.start[1]).toBeCloseTo(previous.start[1] + previous.axis[1], 6);
		}
		const last = children.at(-1)!;
		expect(last.start[0] + last.axis[0]).toBeCloseTo(1, 6);
		expect(last.start[1] + last.axis[1]).toBeCloseTo(0, 6);
	}
});

test('Gosper is one connected sampled curve rather than a repeating tile', async ({ page }) => {
	await page.goto('/lab');
	const density = 0.85;
	// The former order-three island repeated at this period in card coordinates.
	const oldTilePeriod: [number, number] = [
		Math.round(22 / (8 * density) * 50),
		Math.round(22.784609691 / (8 * density) * 50)
	];
	const [base, rescaled, coarse, zoomed] = await geometry(page, 'gosper', [
		{ dials: { density, detail: 6, zoom: 16 } },
		{ dials: { density: 1.45, detail: 6, zoom: 16 } },
		{ dials: { density, detail: 3, zoom: 16 } },
		{ dials: { density, detail: 6, zoom: 28 } }
	], true, oldTilePeriod);
	expect(base!.maskCoverage).toBeGreaterThan(0.01);
	expect(base!.largestComponent).toBeGreaterThan(0.2);
	expect(base!.periodOverlap).toBeLessThan(0.8);
	expect(rescaled!.image).not.toBe(base!.image);
	expect(coarse!.image).not.toBe(base!.image);
	expect(zoomed!.image).not.toBe(base!.image);
	expect(rescaled!.maskCoverage).toBeGreaterThan(0.005);
});

test('Poincare can fill the card and focus on either axis without moving with tilt', async ({ page }) => {
	await page.goto('/lab');
	const [whole, filled, rightRim, bottomRim, held] = await geometry(page, 'poincare-disk', [
		{}, { dials: { zoom: 3 } },
		{ dials: { zoom: 12, focusX: 1 } },
		{ dials: { zoom: 12, focusY: 1 } },
		{ dials: { zoom: 3 }, view: [0.2, -0.15] }
	]);
	expect(whole!.corners).toEqual([0, 0, 0, 0]);
	for (const corner of filled!.corners) expect(corner).toBeGreaterThan(127);
	expect(rightRim!.left).toBeGreaterThan(127);
	expect(rightRim!.right).toBe(0);
	expect(bottomRim!.top).toBeGreaterThan(127);
	expect(bottomRim!.bottom).toBe(0);
	expect(held!.image).toBe(filled!.image);
});

test('Apollonian zoom fills the card and focus reaches either rim without following tilt', async ({ page }) => {
	await page.goto('/lab');
	const [whole, filled, rightRim, bottomRim, held] = await geometry(page, 'apollonian', [
		{ dials: { scale: 1, zoom: 1, focusX: 0, focusY: 0 } },
		{ dials: { scale: 1, zoom: 3, focusX: 0, focusY: 0 } },
		{ dials: { scale: 1, zoom: 12, focusX: 1, focusY: 0 } },
		{ dials: { scale: 1, zoom: 12, focusX: 0, focusY: 1 } },
		{ dials: { scale: 1, zoom: 3, focusX: 0, focusY: 0 }, view: [0.2, -0.15] }
	]);
	for (const corner of whole!.vivid.corners) expect(corner).toBeLessThan(20);
	for (const corner of filled!.vivid.corners) expect(corner).toBeGreaterThan(128);
	expect(rightRim!.vivid.left).toBeGreaterThan(128);
	expect(rightRim!.vivid.right).toBeLessThan(20);
	expect(bottomRim!.vivid.top).toBeGreaterThan(128);
	expect(bottomRim!.vivid.bottom).toBeLessThan(20);
	expect(held!.image).toBe(filled!.image);
});

for (const name of ['double-helix', 'paisley', 'poincare-disk', 'cracked-ice', 'spun', 'matrix', 'spiral-moire', 'wallpaper']) {
	test(`${name} tilt travel can be disabled, follows both axes, holds without a clock, and returns exactly`, async ({ page }) => {
		await page.goto('/lab');
		const [fixed, fixedTilt, resting, horizontal, vertical, held, returned] = await geometry(page, name, [
			{ dials: { slideWithTilt: 0 } }, { dials: { slideWithTilt: 0 }, view: [0.2, -0.15] },
			{ dials: { slideWithTilt: 1 } },
			{ dials: { slideWithTilt: 1 }, view: [0.2, 0] },
			{ dials: { slideWithTilt: 1 }, view: [0, 0.2] },
			{ dials: { slideWithTilt: 1 }, view: [0, 0.2], time: 37 },
			{ dials: { slideWithTilt: 1 }, time: 74 }
		], true);
		expect(fixedTilt!.image).toBe(fixed!.image);
		expect(resting!.image).toBe(fixed!.image);
		expect(horizontal!.image).not.toBe(resting!.image);
		expect(vertical!.image).not.toBe(resting!.image);
		expect(held!.image).toBe(vertical!.image);
		expect(returned!.image).toBe(resting!.image);
	});
}

test('concentric spirals keep their origin, bend independently, and can wind in opposite directions', async ({ page }) => {
	await page.goto('/lab');
	const concentric = { lockCenters: 1, pitchOffset: 0, bendA: 1, bendB: 1.25, counterWound: 0 };
	const [base, offsetIgnored, bendA, bendB, reversed, tilted, held, returned, unlocked] = await geometry(page, 'spiral-moire', [
		{ dials: concentric },
		{ dials: { ...concentric, offset: 0.75 } },
		{ dials: { ...concentric, bendA: 0.75 } },
		{ dials: { ...concentric, bendB: 0.75 } },
		{ dials: { ...concentric, counterWound: 1 } },
		{ dials: concentric, view: [0.2, 0.1] },
		{ dials: { ...concentric, offset: 0.75 }, view: [0.2, 0.1], time: 37 },
		{ dials: concentric, time: 74 },
		{ dials: { ...concentric, lockCenters: 0, offset: 0.75 } }
	], true);
	expect(offsetIgnored!.image).toBe(base!.image);
	for (const changed of [bendA, bendB, reversed, tilted, unlocked]) expect(changed!.image).not.toBe(base!.image);
	expect(bendA!.image).not.toBe(bendB!.image);
	expect(held!.image).toBe(tilted!.image);
	expect(returned!.image).toBe(base!.image);
});


test('Smoke drifts with time, repeats a held frame, and stops at zero speed', async ({ page }) => {
	await page.goto('/lab');
	const [initial, drifted, held, stopped, stoppedLater] = await geometry(page, 'smoke', [
		{}, { time: 8 }, { time: 8 },
		{ dials: { speed: 0 } }, { dials: { speed: 0 }, time: 8 }
	], true);
	expect(drifted!.image).not.toBe(initial!.image);
	expect(held!.image).toBe(drifted!.image);
	expect(stoppedLater!.image).toBe(stopped!.image);
});
test('film framing and walking dials update the live lab renderer', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/lab');
	await page.locator('#lab-film').selectOption('poincare-disk');
	const canvas = page.locator('.lab-card canvas.light');
	await expect(canvas).toHaveAttribute('data-presented', '', { timeout: 15000 });
	const original = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
	for (const [dial, value] of [['zoom', '8'], ['focusX', '0.6'], ['focusY', '-0.3']]) {
		await page.locator(`#lab-film-${dial}`).fill(value!);
		await page.locator(`#lab-film-${dial}`).press('Tab');
	}
	await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).not.toBe(original);
	await page.locator('#lab-film').selectOption('double-helix');
	await page.getByRole('slider', { name: 'slide with tilt dial', exact: true }).fill('1');
	await expect(page.locator('#lab-film-slideWithTilt')).toHaveValue('1');
	await expect(canvas).toHaveAttribute('data-presented', '');
});

test('the shipped 2000s look renders the selected shared helix and restores it after tuning', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	// Active settings from the selected design; unrelated edits to other films do not belong to this look.
	const setup = parseSetup({
		era: '2000s', film: 'double-helix', plate: 'damascus', drift: false,
		tuned: {
			'plate:damascus': { scale: 0.45 },
			'film:double-helix': {
				ground: 1.5, scale: 1.71633218654434, spacing: 1.17165519877676, pitch: 1.44158543577982,
				radius: 0.573021788990826, strandWidth: 0.052998375382263, swell: 0.0357702599388379, rungs: 11
			}
		},
		light: { plateTone: 0.4, stain: 0.52, vivid: 2.6 }
	});
	await page.goto(`/lab#${encodeLink({ setup, stagger: null, width: 323 })}`);
	const canvas = page.locator('.lab-card canvas.light');
	await expect(canvas).toHaveAttribute('data-presented', '', { timeout: 15000 });
	const selected = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
	await page.locator('#lab-film-density').fill('0.7');
	await page.locator('#lab-film-density').press('Tab');
	await expect.poll(() => renderedDifference(page, selected)).toBeGreaterThan(5);
	await page.getByRole('button', { name: 'Use the 2000s look', exact: true }).click();
	// Re-rendering can change a few edge pixels; a different helix changes the full pattern.
	await expect.poll(() => renderedDifference(page, selected)).toBeLessThan(0.5);
});
