<script lang="ts">
	import { user } from '$lib/stores';

	let clock = $state('');

	function updateClock() {
		const d = new Date();
		clock = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
	}

	$effect(() => {
		updateClock();
		const interval = setInterval(updateClock, 1000);
		return () => clearInterval(interval);
	});
</script>

<div
	class="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg-panel px-3.5 py-2.5"
>
	<div
		class="flex items-center gap-2 font-display text-sm font-extrabold tracking-wider text-gold"
	>
		▲ STRIKERS
		<span class="hidden text-[11px] font-medium tracking-widest text-text-secondary lg:inline">
			· UAV PERFORMANCE SYSTEM
		</span>
	</div>

	<div class="flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-dim">
		<span class="hidden sm:inline">●</span>
		<span class="hidden sm:inline">{clock}</span>
		{#if $user}
			<span class="hidden text-text-dim sm:inline">|</span>
			<span class="font-semibold text-text-secondary">{$user.name}</span>
		{/if}
	</div>
</div>
