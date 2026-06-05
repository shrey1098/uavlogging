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
	let infoOpen = $state(false);
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
	<!-- Info collapsible -->
	<div class="mt-3.5">
		<button
			onclick={() => (infoOpen = !infoOpen)}
			class="flex w-full items-center justify-between rounded-lg border border-border bg-bg-panel px-3.5 py-2.5 text-left transition-colors hover:border-gold/40"
		>
			<span class="label-tiny">ℹ HOW BADGES AND SCORES WORK</span>
			<span class="text-[12px] text-text-dim" style="display:inline-block; transition: transform 0.3s; transform: rotate({infoOpen ? 180 : 0}deg)">▼</span>
		</button>
		{#if infoOpen}
			<Panel class="mt-1 space-y-5 p-4">
				<div>
					<div class="mb-2 text-[13px] font-bold text-gold">📊 What is the Readiness Score?</div>
					<div class="mb-3 rounded-lg border border-border bg-bg-elevated p-3 text-[12px] text-text-secondary leading-relaxed">
						It is a number from <span class="font-bold text-text-primary">0 to 100</span>. The more you fly, the higher it goes. Nobody sets this number — it calculates itself from your flights.
					</div>
					<div class="grid grid-cols-3 gap-2 text-center text-[11px]">
						<div class="rounded-lg border border-green-500/30 bg-green-500/10 p-2.5"><div class="font-display text-[22px] text-green-400">75+</div><div class="mt-1 font-bold text-green-400">READY</div><div class="mt-0.5 text-text-dim">Good to go 💪</div></div>
						<div class="rounded-lg border border-gold/30 bg-gold/10 p-2.5"><div class="font-display text-[22px] text-gold">50–74</div><div class="mt-1 font-bold text-gold">AVERAGE</div><div class="mt-0.5 text-text-dim">Keep flying 👍</div></div>
						<div class="rounded-lg border border-scarlet/30 bg-scarlet/10 p-2.5"><div class="font-display text-[22px] text-scarlet-bright">0–49</div><div class="mt-1 font-bold text-scarlet-bright">LOW</div><div class="mt-0.5 text-text-dim">Fly more ✈</div></div>
					</div>
				</div>
				<div>
					<div class="mb-2 text-[13px] font-bold text-gold">⚙ What builds the score?</div>
					<div class="space-y-2">
						{#each [
							{ icon: '✈', label: 'Flight Quality', pct: 40, desc: 'Was the flight smooth? No errors = high score.' },
							{ icon: '📅', label: 'How recently you flew', pct: 25, desc: 'Flew in last 14 days = full marks. Did not fly in 60 days = zero.' },
							{ icon: '⏱', label: 'Total hours flown', pct: 20, desc: 'More hours in the air = higher score.' },
							{ icon: '🔢', label: 'Total flights done', pct: 10, desc: 'More flights = better score.' },
							{ icon: '🎖', label: 'Real Ops', pct: 5, desc: 'Have you flown on a real mission?' }
						] as item}
							<div class="flex items-start gap-2.5 rounded-lg border border-border p-2.5">
								<div class="text-[20px]">{item.icon}</div>
								<div class="flex-1">
									<div class="flex items-center justify-between">
										<span class="text-[12px] font-semibold text-text-primary">{item.label}</span>
										<span class="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold text-gold">{item.pct}%</span>
									</div>
									<div class="mt-0.5 text-[11px] text-text-dim">{item.desc}</div>
									<div class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
										<div class="h-full rounded-full bg-gold" style="width: {item.pct * 2.5}%"></div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
				<div>
					<div class="mb-2 text-[13px] font-bold text-gold">🏅 What are Badges?</div>
					<div class="mb-3 rounded-lg border border-border bg-bg-elevated p-3 text-[12px] text-text-secondary leading-relaxed">
						Every type of flight gives you a badge. The more you fly that type, the higher your badge level gets. Badges go up on their own — nobody gives them to you.
					</div>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<div class="rounded-lg border border-border p-3">
							<div class="mb-2 text-[11px] font-bold text-text-primary">⏰ Time Badges</div>
							<div class="space-y-2">
								{#each [['☀', 'Day', 'flights during daylight'], ['🌙', 'Night', 'flights after dark']] as [icon, name, desc]}
									<div class="flex items-center gap-2 text-[11px]"><span class="text-[18px]">{icon}</span><div><span class="font-semibold">{name}</span> <span class="text-text-dim">— {desc}</span></div></div>
								{/each}
							</div>
						</div>
						<div class="rounded-lg border border-border p-3">
							<div class="mb-2 text-[11px] font-bold text-text-primary">✈ Mission Badges</div>
							<div class="space-y-1.5">
								{#each [['👁','Surveillance','watching from above'],['📦','Drop','dropping a payload'],['🎯','Obstacle','flying through obstacles'],['🧭','Navigation','following a waypoint route'],['🎮','FPV','flying with a camera view']] as [icon, name, desc]}
									<div class="flex items-center gap-2 text-[11px]"><span class="text-[16px]">{icon}</span><div><span class="font-semibold">{name}</span> <span class="text-text-dim">— {desc}</span></div></div>
								{/each}
							</div>
						</div>
					</div>
					<div class="mt-2 rounded-lg border border-scarlet/40 bg-scarlet/10 p-3">
						<div class="flex items-start gap-2.5">
							<span class="text-[22px]">🎖</span>
							<div>
								<div class="text-[12px] font-bold text-scarlet-bright">Real Ops — Live Mission Badge</div>
								<div class="mt-0.5 text-[11px] text-text-dim">Only when the commander marks a flight as a real operation. Training flights do not count here.</div>
							</div>
						</div>
					</div>
				</div>
				<div>
					<div class="mb-2 text-[13px] font-bold text-gold">🪜 Badge Levels</div>
					<div class="mb-3 text-[11px] text-text-dim">Each badge has 10 levels. Keep flying that type and you will keep going up.</div>
					<div class="flex items-end gap-1.5 overflow-x-auto pb-2">
						{#each [['—',''],['🔩','Iron'],['🥉','Bronze'],['🥈','Silver'],['🥇','Gold'],['💎','Platinum'],['👑','Diamond'],['⚡','Elite'],['🔥','Master'],['🌟','Legend'],['🎯','Apex']] as [emoji, label], i}
							{#if i > 0}
								<div class="flex shrink-0 flex-col items-center gap-1">
									<div class="flex items-center justify-center rounded text-[13px]" style="width: {22 + (i-1) * 4}px; height: {22 + (i-1) * 4}px; background: rgba(212,167,44,0.1); border: 1px solid rgba(212,167,44,0.3)">{emoji}</div>
									<div class="text-[8px] font-bold text-gold">{label}</div>
									<div class="text-[8px] text-text-dim">T{i}</div>
								</div>
							{/if}
						{/each}
					</div>
				</div>
				<div class="rounded-lg border border-border bg-bg-elevated p-3 text-[11px] text-text-dim">
					⚠ <span class="font-semibold text-text-primary">Maintenance Test Flight</span> — Does not count toward any badge or score. Only for checking if the drone is working fine.
				</div>
			</Panel>
		{/if}
	</div>
</div>