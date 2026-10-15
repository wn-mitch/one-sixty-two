import { lightStats } from '../cards/surface/card-light.ts';
import { motionStats } from '../cards/motion-runtime.ts';

/** One second of what the page did, as the `?perf` overlay shows it and `window.__perf` reports it. */
export interface PerfSample {
	fps: number;
	/** Frame gaps in milliseconds over the last second. */
	p50: number;
	p95: number;
	/** Frames that took more than one and a half display periods. */
	dropped: number;
	/** Light passes, batches drawn and card canvases filled, per second. */
	flushes: number;
	batches: number;
	presents: number;
	/** Motion subscriber steps per second. */
	ticks: number;
	lights: number;
	visible: number;
	canvas: string;
}

declare global {
	interface Window {
		__perf?: PerfSample[];
	}
}

function percentile(sorted: number[], fraction: number): number {
	return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]! : 0;
}

/** Shows frame pacing and light-pass counters in a corner of the page; returns its teardown. */
export function mountPerfHud(): () => void {
	const panel = document.createElement('pre');
	panel.setAttribute('aria-hidden', 'true');
	Object.assign(panel.style, {
		position: 'fixed', right: '8px', bottom: '8px', zIndex: '2147483647', margin: '0', padding: '6px 8px',
		font: '11px/1.35 ui-monospace, monospace', color: '#d9f99d', background: 'rgb(0 0 0 / .78)',
		borderRadius: '4px', pointerEvents: 'none', whiteSpace: 'pre'
	});
	document.body.append(panel);
	const samples: PerfSample[] = window.__perf = [];
	let gaps: number[] = [];
	let last = 0;
	let frame = 0;
	let windowStart = performance.now();
	let base = { ...lightStats, ticks: motionStats.ticks };
	const step = (time: number) => {
		if (last) gaps.push(time - last);
		last = time;
		if (time - windowStart >= 1000) {
			const sorted = [...gaps].sort((a, b) => a - b);
			const period = percentile(sorted, 0.1) || 16.7;
			const sample: PerfSample = {
				fps: Math.round(gaps.length * 1000 / (time - windowStart)),
				p50: +percentile(sorted, 0.5).toFixed(1),
				p95: +percentile(sorted, 0.95).toFixed(1),
				dropped: gaps.filter(gap => gap > period * 1.5).length,
				flushes: lightStats.flushes - base.flushes,
				batches: lightStats.batches - base.batches,
				presents: lightStats.presents - base.presents,
				ticks: motionStats.ticks - base.ticks,
				lights: lightStats.lights,
				visible: lightStats.visible,
				canvas: `${lightStats.canvasWidth}×${lightStats.canvasHeight}`
			};
			samples.push(sample);
			if (samples.length > 120) samples.shift();
			panel.textContent = [
				`fps ${sample.fps}  p50 ${sample.p50}ms  p95 ${sample.p95}ms  dropped ${sample.dropped}`,
				`light ${sample.batches} batches/s  ${sample.presents} presents/s`,
				`cards ${sample.visible}/${sample.lights} visible  canvas ${sample.canvas}`,
				`motion ${sample.ticks} steps/s  period ${motionStats.period.toFixed(1)}ms`
			].join('\n');
			gaps = [];
			windowStart = time;
			base = { ...lightStats, ticks: motionStats.ticks };
		}
		frame = requestAnimationFrame(step);
	};
	frame = requestAnimationFrame(step);
	return () => {
		cancelAnimationFrame(frame);
		panel.remove();
	};
}
