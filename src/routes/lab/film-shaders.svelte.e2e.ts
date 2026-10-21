import { expect, test } from '@playwright/test';
import { FILMS } from '../../lib/cards/surface/holo-films.ts';
import { programSpec } from '../../lib/cards/surface/light-renderer.ts';
import { LIGHT_VERTEX, lightFragment } from '../../lib/cards/surface/light-shader.ts';

// A film's GLSL only meets a compiler in the browser; a typo there leaves its cards unlit without failing any unit test.
test('every film compiles into the light program a card would draw it with', async ({ page }) => {
	await page.goto('/lab');
	const fragments = FILMS.map((film, index) => ({ name: film.name, source: lightFragment(programSpec(index, 0, {})) }));
	const failures = await page.evaluate(({ vertex, fragments }) => {
		const gl = document.createElement('canvas').getContext('webgl2');
		if (!gl) return ['no WebGL2'];
		const compile = (type: number, source: string) => {
			const shader = gl.createShader(type)!;
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			return shader;
		};
		const vertexShader = compile(gl.VERTEX_SHADER, vertex);
		return fragments.flatMap(({ name, source }) => {
			const fragment = compile(gl.FRAGMENT_SHADER, source);
			const program = gl.createProgram()!;
			gl.attachShader(program, vertexShader);
			gl.attachShader(program, fragment);
			gl.linkProgram(program);
			const linked = gl.getProgramParameter(program, gl.LINK_STATUS) as boolean;
			return linked ? [] : [`${name}: ${gl.getShaderInfoLog(fragment) || gl.getProgramInfoLog(program)}`];
		});
	}, { vertex: LIGHT_VERTEX, fragments });
	expect(failures).toEqual([]);
});
