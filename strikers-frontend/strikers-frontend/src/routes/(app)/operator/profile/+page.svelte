<script lang="ts">
	import { useMyReadiness } from '$lib/api/queries';
	import { Panel, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';
	import { user } from '$lib/stores';
	import { tierLabel, tierColor, tierEmoji, progressToNext, type MyReadiness } from '$lib/api/readiness';

	const readinessQuery = useMyReadiness();
	const rd = $derived($readinessQuery.data as MyReadiness | undefined);
	const score = $derived(rd?.readiness?.score ?? 0);
	const components = $derived(rd?.readiness?.components);
	const meta = $derived(rd?.readiness?.meta);
	const badges = $derived(rd?.badges);
	const thresholds = $derived(badges?.thresholds?.category ?? []);

	const componentLabels: Record<string, string> = {
		flightQuality: 'FLIGHT QUALITY',
		currency: 'CURRENCY',
		experience: 'EXPERIENCE',
		volume: 'VOLUME',
		liveOps: 'LIVE OPS'
	};

	const allBadgeCategories = $derived(() => {
	if (!badges) return [];
	const c = badges.counts ?? { time: { day: 0, night: 0 }, type: { surveillance: 0, drop: 0, obstacle: 0, navigation: 0, fpv: 0 }, realOps: 0 };
	return [
		{ key: 'Day', tier: badges.time.day, count: c.time?.day ?? 0 },
		{ key: 'Night', tier: badges.time.night, count: c.time?.night ?? 0 },
		{ key: 'Surveillance', tier: badges.type.surveillance, count: c.type?.surveillance ?? 0 },
		{ key: 'Drop', tier: badges.type.drop, count: c.type?.drop ?? 0 },
		{ key: 'Obstacle', tier: badges.type.obstacle, count: c.type?.obstacle ?? 0 },
		{ key: 'Navigation', tier: badges.type.navigation, count: c.type?.navigation ?? 0 },
		{ key: 'FPV', tier: badges.type.fpv, count: c.type?.fpv ?? 0 },
		{ key: 'Real Ops', tier: Math.min(badges.realOps, 5), count: c.realOps ?? 0 }
	];
});

	function scoreColor(s: number) {
		if (s >= 75) return 'rgb(100 220 120)';
		if (s >= 50) return 'rgb(212 167 44)';
		return 'rgb(255 45 63)';
	}

	const initials = $derived(
		($user?.name || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'
	);
</script>

<div class="page-pad">
	<div class="label-tiny mb-3">MY PROFILE</div>

	{#if $readinessQuery.isLoading}
		<Loading label="Loading readiness..." />
	{:else if $readinessQuery.error}
		<ErrorState message={extractError($readinessQuery.error)} onRetry={() => $readinessQuery.refetch()} />
	{:else}
		<!-- Identity + score -->
		<Panel corner class="mb-3.5 p-4">
			<div class="flex items-center gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded bg-scarlet font-display text-2xl text-text-primary">
					{initials}
				</div>
				<div class="flex-1">
					<div class="font-display text-[20px]">{$user?.name ?? '—'}</div>
					<div class="text-[12px] text-text-secondary">{$user?.email ?? '—'}</div>
				</div>
				<div class="text-right">
					<div class="label-tiny">READINESS</div>
					<div class="font-display text-5xl" style="color: {scoreColor(score)}">{score}</div>
				</div>
			</div>
		</Panel>

		<!-- Meta stats -->
		{#if meta}
			<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
				<Panel class="p-3">
					<div class="stat-label">SORTIES</div>
					<div class="stat-num mt-1 text-xl">{meta.countedSorties}</div>
				</Panel>
				<Panel class="p-3">
					<div class="stat-label">HOURS</div>
					<div class="stat-num mt-1 text-xl">{meta.countedFlightHours.toFixed(1)}h</div>
				</Panel>
				<Panel class="p-3">
					<div class="stat-label">REAL OPS</div>
					<div class="stat-num mt-1 text-xl">{meta.realOpsCount}</div>
				</Panel>
				<Panel class="p-3">
					<div class="stat-label">LAST FLIGHT</div>
					<div class="stat-num mt-1 text-[13px]">
						{meta.lastFlightAt ? new Date(meta.lastFlightAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
					</div>
				</Panel>
			</div>
		{/if}

		<!-- Readiness breakdown -->
		<Panel class="mb-3.5 p-3.5">
			<div class="label-tiny mb-3">READINESS BREAKDOWN</div>
			{#if components}
				<div class="space-y-2.5">
					{#each Object.entries(componentLabels) as [key, label]}
						{@const val = (components as any)[key] ?? 0}
						<div>
							<div class="mb-1 flex justify-between text-[11px]">
								<span class="text-text-dim">{label}</span>
								<span>{val}</span>
							</div>
							<div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
								<div
									class="h-full rounded-full transition-all"
									style="width: {val}%; background: {val >= 75 ? 'rgb(100 220 120)' : val >= 40 ? 'rgb(212 167 44)' : 'rgb(255 45 63)'}"
								></div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Panel>

		<!-- Badges -->
		<Panel class="p-3.5">
			<div class="label-tiny mb-3">ACHIEVEMENT BADGES</div>
			{#if badges}
				<div class="space-y-2">
					{#each allBadgeCategories() as b}
						{@const prog = progressToNext(b.count, b.key === 'Real Ops' ? (badges.thresholds.realOps ?? []) : thresholds)}
						<div class="flex items-center gap-2.5">
							<span class="w-20 shrink-0 text-[10px] text-text-dim">{b.key}</span>
							<div class="flex-1">
								<div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
									<div
										class="h-full rounded-full transition-all"
										style="width: {prog.pct}%; background: {tierColor(b.tier)}"
									></div>
								</div>
							</div>
							<span class="w-14 text-right text-[10px]" style="color: {tierColor(b.tier)}">
								{b.tier > 0 ? `${tierEmoji(b.tier)} T${b.tier}` : '—'}
							</span>
							<span class="w-8 text-right text-[10px] text-text-dim">{b.count}</span>
						</div>
					{/each}
				</div>
				<div class="mt-3 text-[10px] text-text-dim">
					Progress bars show sorties toward next tier. Tier labels: T1 Iron → T4 Gold → T10 Apex.
				</div>
			{/if}
		</Panel>
	{/if}
</div>