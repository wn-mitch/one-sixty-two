import { expect, test } from '@playwright/test';
import hgh from '../../lib/cards/surface/films/hgh-sequence.ts';
import { SHARED_FILM_GLSL } from '../../lib/cards/surface/films/shared.ts';
import { LIGHT_VERTEX } from '../../lib/cards/surface/light-shader.ts';
import { DEFAULT_LIGHT } from '../../lib/cards/surface/light-renderer.ts';

// Render the production glyph mask directly so lighting and colorways cannot hide a sizing regression.
const fragment = `#version 300 es
precision highp float;
in vec2 v_card;
flat in vec2 v_cardSize;
uniform float u_scale;
const vec2 CARD = vec2(5.0, 7.0);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float footprint = 1.0;
${SHARED_FILM_GLSL}
out vec4 color;
void main() {
 vec2 p = v_card * CARD;
 float filmScale = u_scale * ${DEFAULT_LIGHT.holoScale.toFixed(1)};
 ${Object.entries(hgh.params).map(([name, dial]) => `float ${name} = ${dial.value.toFixed(8)};`).join('\n')}
 vec2 groove;
 float seed, vivid, copper, copperPad, cellSize;
 ${hgh.glsl}
 color = vec4(vec3(copper), 1.0);
}`;

test('HGH letters keep their readable size across card widths and pixel densities', async ({ page }) => {
 await page.goto('/lab');
 const cases = [
  { width: 200, ratio: 1, scale: 1.44, dot: 5.56 },
  { width: 200, ratio: 2, scale: 1.44, dot: 5.56 },
  { width: 346, ratio: 1, scale: 1.44, dot: 5.56 },
  // Above the floor, natural scaling and deliberately coarse dials remain in control.
  { width: 900, ratio: 2, scale: 1.44, dot: 900 / (5 * 8 * 1.44 * 2.2) },
  { width: 200, ratio: 1, scale: 0.3, dot: 200 / (5 * 8 * 0.3 * 2.2) }
 ];
 const glyphs = await page.evaluate(({ vertex, fragment, cases }) => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 is required to verify the lettering shader.');
  const compile = (type: number, source: string) => {
   const shader = gl.createShader(type)!;
   gl.shaderSource(shader, source);
   gl.compileShader(shader);
   if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed.');
   return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex);
  const fs = compile(gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader linking failed.');
  gl.useProgram(program);
  const result = cases.map(({ width, ratio, scale, dot }) => {
   const height = width * 7 / 5;
   canvas.width = width * ratio;
   canvas.height = height * ratio;
   gl.viewport(0, 0, canvas.width, canvas.height);
   gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
   gl.uniform1f(gl.getUniformLocation(program, 'u_scale'), scale);
   gl.vertexAttrib2f(0, 0, 0);
   gl.vertexAttrib4f(1, width, 0, 0, height);
   gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
   const pixel = new Uint8Array(4);
   return Array.from({ length: 6 }, (_, y) => Array.from({ length: 5 }, (_, x) => {
    gl.readPixels(Math.floor((x + 0.5) * dot * ratio), canvas.height - 1 - Math.floor((y + 0.5) * dot * ratio), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return pixel[0] > 127 ? '#' : '.';
   }).join(''));
  });
  gl.deleteProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return result;
 }, { vertex: LIGHT_VERTEX, fragment, cases });
 // The first residue is F. Its strokes must occupy the same readable dot grid on small cards.
 for (let index = 0; index < cases.length; index++) {
  expect(glyphs[index], JSON.stringify(cases[index])).toEqual(['#####', '#....', '####.', '#....', '#....', '#....']);
 }
});
