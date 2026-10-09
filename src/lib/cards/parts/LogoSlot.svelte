<script lang="ts">
	import type { CardFront } from '../view-model.ts';

	export interface LogoSlotProps {
	s: Pick<CardFront, 'abbr' | 'team' | 'logo' | 'hasLogo' | 'noLogo' | 'logoLabel' | 'logoShape'>;
		markStyle?: string;
		fallbackStyle?: string;
	}

	let { s, markStyle = '', fallbackStyle = '' }: LogoSlotProps = $props();
	let failed = $state(false);
	let previousUrl = $state('');

	$effect(() => {
		if (previousUrl !== s.logo) {
			previousUrl = s.logo;
			failed = false;
		}
	});

	function markUnavailable(): void {
		failed = true;
	}
</script>

{#if s.hasLogo && s.logo && !failed}
	<img
		data-rt
		data-layer="logo.mark"
		src={s.logo}
		alt={`${s.logoLabel}: ${s.team}`}
		style={`position:absolute; left:2cqw; top:2cqw; width:11cqw; height:11cqw; object-fit:contain; ${markStyle}`}
		onerror={markUnavailable}
	/>
{:else}
	<div
		data-rt
		data-layer="logo.fallback"
		role="img"
		aria-label={`${failed ? 'Team mark image unavailable' : s.logoLabel}: ${s.team} abbreviation`}
		title={failed ? 'Team mark image unavailable' : s.logoLabel}
		style={`position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:5cqw; ${fallbackStyle}`}
	>
		{s.abbr}
	</div>
{/if}
