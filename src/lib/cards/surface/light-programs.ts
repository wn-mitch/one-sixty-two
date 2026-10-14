import { LIGHT_VERTEX, lightFragment, type ProgramSpec } from './light-shader.ts';

/**
 * The light's shader programs, one per set of films and plates a card shows. A program that carries every film and
 * plate takes seconds to compile on a phone or a software renderer, so each card gets one with only its own; the
 * driver compiles them in the background where it can, and a card waits, unlit, until its program is ready.
 */

/** The scene uniforms every program reads, by the name the renderer sets them under. */
const UNIFORMS = {
	resolution: 'u_resolution', texel: 'u_texel', relief: 'u_relief', lightHeight: 'u_lightHeight', glare: 'u_glare',
	shine: 'u_shine', foil: 'u_foil', coat: 'u_coat', holoPattern: 'u_holoPattern', holoScale: 'u_holoScale',
	waves: 'u_waves', brush: 'u_brush', foilMode: 'u_foilMode', shift: 'u_shift', time: 'u_time', paper: 'u_paper',
	wash: 'u_wash', foilPlate: 'u_foilPlate', plateDepth: 'u_plateDepth', plateScale: 'u_plateScale',
	plateTone: 'u_plateTone', stain: 'u_stain', tuneFilm: 'u_tuneFilm', filmTune: 'u_filmTune',
	tuneFinish: 'u_tuneFinish', finishTune: 'u_finishTune', tunePlate: 'u_tunePlate', plateTune: 'u_plateTune',
	finish: 'u_finish', palette: 'u_palette', plateUnderFilm: 'u_plateUnderFilm', underFilm: 'u_underFilm',
	underMix: 'u_underMix'
} as const;

export type Uniforms = Record<keyof typeof UNIFORMS, WebGLUniformLocation | null>;

export interface LightProgram {
	program: WebGLProgram;
	uniforms: Uniforms;
}

interface Pending {
	program: WebGLProgram;
	fragment: WebGLShader;
	ready: LightProgram | null;
}

/** `KHR_parallel_shader_compile`'s completion query. */
const COMPLETION_STATUS = 0x91b1;

/** One string per distinct program, so specs that would compile the same shader share it. */
export function programKey(spec: ProgramSpec): string {
	const list = (set: ReadonlySet<number>) => [...set].sort((a, b) => a - b).join(',');
	return `${list(spec.films)}|${list(spec.plates)}|${spec.remix ? 'r' : ''}${spec.under ? 'u' : ''}`;
}

export class LightPrograms {
	readonly #gl: WebGL2RenderingContext;
	readonly #vertex: WebGLShader;
	readonly #parallel: boolean;
	readonly #programs = new Map<string, Pending>();

	constructor(gl: WebGL2RenderingContext) {
		this.#gl = gl;
		this.#parallel = gl.getExtension('KHR_parallel_shader_compile') !== null;
		this.#vertex = gl.createShader(gl.VERTEX_SHADER)!;
		gl.shaderSource(this.#vertex, LIGHT_VERTEX);
		gl.compileShader(this.#vertex);
	}

	/**
	 * The program for these films and plates, or null while it is still compiling; the first call starts it.
	 * Throws if the shader does not compile, which is a bug in the generated GLSL.
	 */
	get(spec: ProgramSpec): LightProgram | null {
		const key = programKey(spec);
		let pending = this.#programs.get(key);
		if (!pending) {
			pending = this.#start(spec);
			this.#programs.set(key, pending);
		}
		if (pending.ready) return pending.ready;
		const gl = this.#gl;
		// Without the extension, asking for the link status waits for the compile, as WebGL always has.
		if (this.#parallel && !gl.getProgramParameter(pending.program, COMPLETION_STATUS)) return null;
		if (!gl.getProgramParameter(pending.program, gl.LINK_STATUS)) {
			const log = gl.getShaderInfoLog(pending.fragment) || gl.getProgramInfoLog(pending.program);
			this.#programs.delete(key);
			throw new Error(log ?? 'Shader link failed.');
		}
		pending.ready = this.#ready(pending.program);
		return pending.ready;
	}

	/** Starts compiling this program without waiting for it, so it is ready by the time a card needs it. */
	warm(spec: ProgramSpec): void {
		const key = programKey(spec);
		if (!this.#programs.has(key)) this.#programs.set(key, this.#start(spec));
	}

	#start(spec: ProgramSpec): Pending {
		const gl = this.#gl;
		const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
		gl.shaderSource(fragment, lightFragment(spec));
		gl.compileShader(fragment);
		const program = gl.createProgram()!;
		gl.attachShader(program, this.#vertex);
		gl.attachShader(program, fragment);
		gl.linkProgram(program);
		return { program, fragment, ready: null };
	}

	#ready(program: WebGLProgram): LightProgram {
		const gl = this.#gl;
		gl.useProgram(program);
		gl.uniform1i(gl.getUniformLocation(program, 'u_map'), 0);
		gl.uniform1i(gl.getUniformLocation(program, 'u_ink'), 1);
		gl.uniform1i(gl.getUniformLocation(program, 'u_circuit'), 2);
		const uniforms = Object.fromEntries(Object.entries(UNIFORMS).map(([key, name]) => [key, gl.getUniformLocation(program, name)])) as Uniforms;
		return { program, uniforms };
	}

	/** Frees every program, for instance before the renderer goes away. */
	destroy(): void {
		for (const pending of this.#programs.values()) {
			this.#gl.deleteProgram(pending.program);
			this.#gl.deleteShader(pending.fragment);
		}
		this.#programs.clear();
		this.#gl.deleteShader(this.#vertex);
	}
}
