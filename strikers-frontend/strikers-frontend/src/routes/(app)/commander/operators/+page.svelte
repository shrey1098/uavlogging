<script lang="ts">
	import { useUnitReadiness } from '$lib/api/queries';
	import { Panel, Button, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';
	import { tierEmoji, tierColor, type UnitReadinessEntry } from '$lib/api/readiness';
	import { AlignCenter } from 'lucide-svelte';

	const query = useUnitReadiness();
	let search = $state('');

	const filtered = $derived(
		($query.data ?? []).filter((r) =>
			search ? r.user?.name?.toLowerCase().includes(search.toLowerCase()) : true
		)
	);

	function scoreColor(s: number) {
		if (s >= 75) return 'rgb(100 220 120)';
		if (s >= 50) return 'rgb(212 167 44)';
		return 'rgb(255 45 63)';
	}

	function topBadges(badges: UnitReadinessEntry['badges']) {
		const entries: { category: string; tier: number }[] = [
			{ category: 'Day', tier: badges.time.day },
			{ category: 'Night', tier: badges.time.night },
			{ category: 'Surv', tier: badges.type.surveillance },
			{ category: 'Drop', tier: badges.type.drop },
			{ category: 'Nav', tier: badges.type.navigation },
			{ category: 'FPV', tier: badges.type.fpv },
		];
		return entries.filter(e => e.tier > 0).sort((a, b) => b.tier - a.tier).slice(0, 3);
	}
</script>

<div class="page-pad">
	<div class="mb-3.5">
		<div class="label-tiny">PERSONNEL ROSTER · UNIT WIDE</div>
		<h1 class="h1 mt-1">ALL OPERATORS · {($query.data ?? []).length}</h1>
	</div>

	<div class="mb-3.5">
		<input bind:value={search} class="input" placeholder="Search by name..." style="max-width: 240px" />
	</div>

	{#if $query.isLoading}
		<Loading label="Loading roster..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else}
		<Panel>
			<div class="overflow-x-auto">
				<table class="tbl">
	<thead>
	<tr>
		<th>NAME</th>
		<th>TOP BADGES</th>
		<th>TOTAL FLIGHTS</th>
		<th>READINESS</th>
	</tr>
</thead>
	<tbody>
	<!-- Demo entry -->
	<tr
	class="cursor-pointer hover:bg-bg-elevated"
	onclick={() => (window.location.href = '/commander/operators/demo-operator')}
>
	<td class="font-semibold">
		Rfn Sameer Ahmad Khandy
		<span class="ml-1.5 rounded border border-gold/30 bg-gold/10 px-1 py-0.5 text-[8px] text-gold">DEMO</span>
	</td>
	<td>
		<div class="flex gap-1.5">
			<span class="text-[11px]" style="color: rgb(212 167 44)">🥇 Day</span>
			<span class="text-[11px]" style="color: rgb(147 210 255)">💎 Surv</span>
		</div>
	</td>
	<td class="text-[13px]">50</td>
	<td>
		<span class="font-display text-[20px]" style="color: rgb(212 167 44)">74</span>
	</td>
</tr>
		{#each filtered as r}
			<tr
	class="cursor-pointer hover:bg-bg-elevated"
	onclick={() => (window.location.href = `/commander/operators/${(r as any).operator?._id ?? r.user?._id}`)}
>
	<td class="font-semibold">{r.user?.name ?? '—'}</td>
	<td>
		<div class="flex gap-1.5">
			{#each topBadges(r.badges) as b}
				<span class="text-[11px]" title="{b.category} · Tier {b.tier}" style="color: {tierColor(b.tier)}">
					{tierEmoji(b.tier)} {b.category}
				</span>
			{/each}
			{#if topBadges(r.badges).length === 0}
				<span class="text-[11px] text-text-dim">—</span>
			{/if}
		</div>
	</td>
	<td class="text-[13px]">
		{r.badges?.counts?.time ? r.badges.counts.time.day + r.badges.counts.time.night : '—'}
	</td>
	<td>
		<span class="font-display text-[20px]" style="color: {scoreColor(r.readinessScore)}">
			{r.readinessScore}
		</span>
	</td>
</tr>
		{:else}
			<tr>
				<td colspan="4" class="text-center text-text-dim">No operators found.</td>
			</tr>
		{/each}
	</tbody>
</table>
			</div>
		</Panel>
	{/if}
</div>