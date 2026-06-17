<script lang="ts">
	import { page } from '$app/stores';
	import { useOperator, useOperatorReadiness, useFlightLogs } from '$lib/api/queries';
	import { Panel, Button, Chip } from '$lib/components/ui';
	import { extractError, formatDate, formatDateTime } from '$lib/utils';
	import { type OperatorReadiness } from '$lib/api/readiness';
	import { onMount } from 'svelte';

	// ── Route ─────────────────────────────────────────────────────────────
	const id = $derived($page.params.id);
	const DEMO_ID = 'demo-operator';
	const isMock = $derived(id === DEMO_ID);

	// ── Mock data ─────────────────────────────────────────────────────────
	const mockOp = { name: 'Rfn Sameer Ahmad Khandy', email: 'sameer@stiff.dev', licenseNumber: 'UAV-2024-0042', licenseExpiry: '2027-03-15' };
	const mockScore = 74;
	const mockComponents = { flightQuality: 81, currency: 100, experience: 42, volume: 55, liveOps: 60 };
	const mockMeta = { countedSorties: 47, countedFlightHours: 18.4, realOpsCount: 3, lastFlightAt: '2026-05-10T08:30:00.000Z' };
	const mockBadgeCategories = [
		{ key: 'Day', tier: 4, count: 38 }, { key: 'Night', tier: 2, count: 12 },
		{ key: 'Surveillance', tier: 5, count: 62 }, { key: 'Drop', tier: 1, count: 7 },
		{ key: 'Obstacle', tier: 0, count: 0 }, { key: 'Navigation', tier: 3, count: 21 },
		{ key: 'FPV', tier: 2, count: 11 }, { key: 'Real Ops', tier: 2, count: 5 }
	];
	const mockLogs = [
		{ _id: 'mock1', originalFilename: 'pokhran_isr_01.bin', createdAt: '2026-05-10T08:30:00Z', parseStatus: 'parsed', anomalyScore: 0.12 },
		{ _id: 'mock2', originalFilename: 'night_nav_patrol.ulg', createdAt: '2026-05-07T21:15:00Z', parseStatus: 'parsed', anomalyScore: 0.31 },
		{ _id: 'mock3', originalFilename: 'drop_run_sector4.bin', createdAt: '2026-05-03T14:45:00Z', parseStatus: 'parsed', anomalyScore: 0.05 },
		{ _id: 'mock4', originalFilename: 'fpv_obstacle_train.csv', createdAt: '2026-04-28T09:00:00Z', parseStatus: 'parsed', anomalyScore: 0.44 },
		{ _id: 'mock5', originalFilename: 'surv_border_run.tlog', createdAt: '2026-04-21T06:30:00Z', parseStatus: 'parsed', anomalyScore: 0.08 },
		{ _id: 'mock6', originalFilename: 'maintenance_check.log', createdAt: '2026-04-15T11:00:00Z', parseStatus: 'failed', anomalyScore: null },
		{ _id: 'mock7', originalFilename: 'night_isr_02.bin', createdAt: '2026-04-10T22:00:00Z', parseStatus: 'parsed', anomalyScore: 0.19 }
	];

	// ── Live API ──────────────────────────────────────────────────────────
	const _opQuery = useOperator(isMock ? 'skip' : id);
	const op = $derived(isMock ? mockOp : ($_opQuery?.data as any));
	const linkedUserId = $derived(!isMock ? ((op as any)?.linkedUser ?? '') : '');

	const _readinessQuery = $derived.by(() => useOperatorReadiness(isMock ? '' : linkedUserId));
	const rd = $derived(!isMock ? ($_readinessQuery?.data as OperatorReadiness | undefined) : null);

	const _logsQuery = $derived.by(() => useFlightLogs(!isMock && linkedUserId ? { owner: linkedUserId, sort: '-createdAt', limit: 100 } : undefined));
	const liveLogs = $derived(!isMock ? ($_logsQuery?.data ?? []) : mockLogs);

	// ── Resolved values ───────────────────────────────────────────────────
	const score = $derived(isMock ? mockScore : (rd?.readiness?.score ?? 0));
	const components = $derived(isMock ? mockComponents : rd?.readiness?.components);
	const meta = $derived(isMock ? mockMeta : rd?.readiness?.meta);
	const badges = $derived(isMock ? null : rd?.badges);
	const thresholds = $derived(badges?.thresholds?.category ?? [5,10,20,35,60,100,150,225,325,500]);
	const realOpsThresholds = $derived(badges?.thresholds?.realOps ?? [1,3,7,15,30]);

	const badgeCategories = $derived(isMock ? mockBadgeCategories : (() => {
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
	})());

	const topBadges = $derived(badgeCategories.filter(b => b.tier > 0).sort((a, b) => b.tier - a.tier));
	const isLoading = $derived(!isMock && ($_opQuery?.isLoading || $_readinessQuery?.isLoading));
	const hasError = $derived(!isMock && (!!$_opQuery?.error || (!op && !$_opQuery?.isLoading)));

	// ── Logs expand ───────────────────────────────────────────────────────
	let logsExpanded = $state(false);
	const visibleLogs = $derived(logsExpanded ? liveLogs : (liveLogs as any[]).slice(0, 5));

	// ── Helpers ───────────────────────────────────────────────────────────
	const componentLabels: Record<string, string> = {
		flightQuality: 'FLIGHT QUALITY', currency: 'CURRENCY',
		experience: 'EXPERIENCE', volume: 'VOLUME', liveOps: 'LIVE OPS'
	};
	const TIER_COLORS = ['rgb(80 80 80)','rgb(130 130 130)','rgb(176 120 60)','rgb(192 192 192)','rgb(212 167 44)','rgb(147 210 255)','rgb(167 100 255)','rgb(255 100 80)','rgb(255 50 50)','rgb(255 210 0)','rgb(255 45 63)'];
	const TIER_LABELS = ['—','Iron','Bronze','Silver','Gold','Platinum','Diamond','Elite','Master','Legend','Apex'];
	const TIER_EMOJIS = ['','🔩','🥉','🥈','🥇','💎','👑','⚡','🔥','🌟','🎯'];

	function tierColor(t: number) { return TIER_COLORS[Math.min(t, 10)]; }
	function tierLabel(t: number) { return TIER_LABELS[Math.min(t, 10)]; }
	function tierEmoji(t: number) { return t > 0 ? TIER_EMOJIS[Math.min(t, 10)] : ''; }
	function progressToNext(count: number, thresh: number[]) {
		for (let i = 0; i < thresh.length; i++) {
			if (count < thresh[i]) {
				const prev = i === 0 ? 0 : thresh[i - 1];
				return { pct: Math.round(((count - prev) / (thresh[i] - prev)) * 100), next: thresh[i] };
			}
		}
		return { pct: 100, next: thresh.at(-1) ?? 0 };
	}
	function scoreColor(s: number) {
		if (s >= 75) return 'rgb(100 220 120)';
		if (s >= 50) return 'rgb(212 167 44)';
		return 'rgb(255 45 63)';
	}
	function statusIcon(s: string) {
    if (s === 'completed') return '✓';
    if (s === 'failed') return '✕';
    if (s === 'skipped') return '—';
    return '⏳';
}

function anomalyColor(v: number | null) {
    if (v == null) return 'rgb(80 80 80)';
    if (v > 60) return 'rgb(255 45 63)';
    if (v > 30) return 'rgb(212 167 44)';
    return 'rgb(100 220 120)';
}

	const initials = $derived(
		((isMock ? mockOp.name : op?.name) || '').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '??'
	);

	// ── Animation ─────────────────────────────────────────────────────────
	let animated = $state(false);
	let scoreAnimated = $state(0);
	let infoOpen = $state(false);

	onMount(() => {
    setTimeout(() => { animated = true; }, 100);
});

$effect(() => {
    if (score === 0) return;
    const target = score;
    const duration = 1200;
    const start = performance.now();
    function tick(now: number) {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        scoreAnimated = Math.round(ease * target);
        if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
});

</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-center gap-2.5">
		<Button href="/commander/operators">← ROSTER</Button>
		<span class="label-tiny">PERSONNEL FILE{isMock ? ' · DEMO' : ''}</span>
	</div>

	{#if isLoading}
		<div class="label-tiny animate-pulse py-10 text-center">LOADING...</div>
	{:else if hasError}
		<div class="py-10 text-center text-[12px] text-scarlet-bright">Operator not found.</div>
	{:else}
		<!-- Header -->
		<Panel corner class="mb-3.5 p-4">
			<div class="flex flex-wrap items-center gap-3.5">
				<div class="flex h-16 w-16 items-center justify-center rounded bg-scarlet font-display text-2xl text-text-primary">
					{initials}
				</div>
				<div class="min-w-[200px] flex-1">
					<div class="font-display text-[22px]">{isMock ? mockOp.name : op?.name}</div>
					<div class="mt-0.5 text-[12px] text-text-secondary">{isMock ? mockOp.email : op?.email}</div>
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#if (isMock ? mockOp.licenseNumber : (op as any)?.licenseNumber)}
							<Chip variant="gold">LICENSE {isMock ? mockOp.licenseNumber : (op as any)?.licenseNumber}</Chip>
						{/if}
						{#if (isMock ? mockOp.licenseExpiry : (op as any)?.licenseExpiry)}
							<Chip>EXPIRES {isMock ? mockOp.licenseExpiry : formatDate((op as any)?.licenseExpiry)}</Chip>
						{/if}
					</div>
				</div>
				<div class="text-right">
					<div class="label-tiny">READINESS</div>
					<div class="font-display text-6xl transition-all duration-300" style="color: {scoreColor(scoreAnimated)}">
						{scoreAnimated}
					</div>
				</div>
			</div>
		</Panel>

		<!-- Meta stats -->
		{#if meta}
			<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
				<Panel class="p-3"><div class="stat-label">SORTIES</div><div class="stat-num mt-1 text-xl">{(meta as any).countedSorties}</div></Panel>
				<Panel class="p-3"><div class="stat-label">HOURS</div><div class="stat-num mt-1 text-xl">{(meta as any).countedFlightHours}h</div></Panel>
				<Panel class="p-3">
					<div class="stat-label">REAL OPS</div>
					<div class="stat-num mt-1 text-xl" style="color: {(meta as any).realOpsCount > 0 ? 'rgb(255 45 63)' : ''}">{(meta as any).realOpsCount}</div>
				</Panel>
				<Panel class="p-3">
					<div class="stat-label">LAST FLIGHT</div>
					<div class="stat-num mt-1 text-[13px]">
						{(meta as any).lastFlightAt ? new Date((meta as any).lastFlightAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
					</div>
				</Panel>
			</div>
		{/if}

		<!-- Top achievements -->
		{#if topBadges.length > 0}
			<Panel class="mb-3.5 overflow-hidden p-0">
				<div class="flex items-center justify-between border-b border-border px-4 py-2.5">
					<div class="label-tiny">TOP ACHIEVEMENTS</div>
					<div class="text-[10px] text-text-dim">{topBadges.length} earned</div>
				</div>
				<div class="grid grid-cols-2 sm:grid-cols-4">
					{#each topBadges.slice(0, 4) as b, i}
						<div
							class="relative flex flex-col items-center justify-center gap-2 px-4 py-6"
							style="border-right: {i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none'}"
						>
							<div class="absolute inset-x-0 top-0 h-[2px]" style="background: linear-gradient(90deg, transparent 10%, {tierColor(b.tier)}, transparent 90%)"></div>
							<div class="pointer-events-none absolute inset-0 opacity-[0.04]" style="background: radial-gradient(ellipse at 50% 0%, {tierColor(b.tier)}, transparent 70%)"></div>
							<div class="relative flex flex-col items-center gap-1.5">
								<div class="flex h-12 w-12 items-center justify-center rounded-full text-[24px]" style="background: {tierColor(b.tier)}15; border: 1px solid {tierColor(b.tier)}30">
									{tierEmoji(b.tier)}
								</div>
								<div class="text-center">
									<div class="text-[11px] font-bold uppercase tracking-[0.12em]" style="color: {tierColor(b.tier)}">{tierLabel(b.tier)}</div>
									<div class="mt-0.5 text-[12px] font-semibold text-text-primary">{b.key}</div>
									<div class="mt-0.5 text-[10px] text-text-dim">{b.count} sorties</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</Panel>
		{/if}

		<!-- Readiness + Badge progress -->
		<div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
			<Panel class="p-3.5">
				<div class="label-tiny mb-3">READINESS BREAKDOWN</div>
				{#if components}
					<div class="space-y-3">
						{#each Object.entries(componentLabels) as [key, label], idx}
							{@const val = (components as any)[key] ?? 0}
							<div>
								<div class="mb-1.5 flex justify-between text-[11px]">
									<span class="text-text-dim">{label}</span>
									<span style="color: {val >= 75 ? 'rgb(100 220 120)' : val >= 40 ? 'rgb(212 167 44)' : 'rgb(255 45 63)'}">{val}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-white/10">
									<div class="h-full rounded-full" style="width: {animated ? val : 0}%; background: {val >= 75 ? 'rgb(100 220 120)' : val >= 40 ? 'rgb(212 167 44)' : 'rgb(255 45 63)'}; transition: width 1s cubic-bezier(0.16,1,0.3,1) {200 + idx * 100}ms"></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="text-[12px] text-text-dim">No readiness data yet.</div>
				{/if}
			</Panel>

			<Panel class="p-3.5">
				<div class="label-tiny mb-3">BADGE PROGRESS</div>
				{#if badgeCategories.length > 0}
					<div class="space-y-2.5">
						{#each badgeCategories as b, i}
							{@const prog = progressToNext(b.count, b.key === 'Real Ops' ? realOpsThresholds : thresholds)}
							<div class="flex items-center gap-2">
								<span class="w-20 shrink-0 text-[10px] text-text-dim">{b.key}</span>
								<div class="flex-1">
									<div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
										<div class="h-full rounded-full" style="width: {animated ? prog.pct : 0}%; background: {tierColor(b.tier)}; transition: width 0.9s cubic-bezier(0.16,1,0.3,1) {300 + i * 80}ms"></div>
									</div>
								</div>
								<span class="w-16 text-right text-[10px]" style="color: {b.tier > 0 ? tierColor(b.tier) : 'rgb(80 80 80)'}">
									{b.tier > 0 ? `${tierEmoji(b.tier)} ${tierLabel(b.tier)}` : '—'}
								</span>
								<span class="w-6 text-right text-[10px] text-text-dim">{b.count}</span>
							</div>
						{/each}
					</div>
					<div class="mt-3 text-[9px] text-text-dim">Bar shows progress toward next tier</div>
				{:else}
					<div class="text-[12px] text-text-dim">No flights recorded yet.</div>
				{/if}
			</Panel>
		</div>

		{#if (log as any).typeClass === 'drop' && (log as any).dropScore != null}
	<div class="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold text-gold">
		DROP {(log as any).dropScore}
	</div>
{/if}

		<!-- Flight history -->
		<Panel class="mt-3.5 overflow-hidden p-0">
			<div class="flex items-center justify-between border-b border-border px-4 py-2.5">
				<div class="label-tiny">FLIGHT HISTORY · {(liveLogs as any[]).length} TOTAL</div>
				{#if !isMock && $_logsQuery?.isLoading}
					<span class="text-[10px] text-text-dim">Loading...</span>
				{/if}
			</div>
			{#if (liveLogs as any[]).length === 0}
				<div class="p-4 text-center text-[12px] text-text-dim">No flights recorded yet.</div>
			{:else}
				<div class="divide-y divide-border/40">
					{#each visibleLogs as log}
						<a href="/commander/logs/{(log as any)._id}" class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-elevated">
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[13px] font-bold"
								style="background: {(log as any).parseStatus === 'completed' ? 'rgba(100,220,120,0.1)' : (log as any).parseStatus === 'failed' ? 'rgba(255,45,63,0.1)' : 'rgba(212,167,44,0.1)'}; color: {(log as any).parseStatus === 'completed' ? 'rgb(100 220 120)' : (log as any).parseStatus === 'failed' ? 'rgb(255 45 63)' : 'rgb(212 167 44)'}"
							>
								{statusIcon((log as any).parseStatus)}
							</div>
							<div class="min-w-0 flex-1">
								<div class="truncate text-[12px] font-semibold">{(log as any).originalName ?? (log as any).originalFilename ?? '—'}</div>
								<div class="mt-0.5 text-[10px] text-text-dim">{formatDateTime((log as any).createdAt)}</div>
							</div>
							<div class="text-right">
								<div class="text-[10px] text-text-dim">ANOM</div>
								<div class="font-display text-[16px]" style="color: {anomalyColor((log as any).anomalyScore)}">
									{((log as any).parsedData?.anomalyScore ?? (log as any).anomalyScore) ?? '—'}
								</div>
							</div>
							<span class="text-[14px] text-text-dim">›</span>
						</a>
					{/each}
				</div>
				{#if (liveLogs as any[]).length > 5}
					<button
						onclick={() => (logsExpanded = !logsExpanded)}
						class="flex w-full items-center justify-center gap-1.5 border-t border-border/40 py-2.5 text-[11px] text-text-dim transition-colors hover:text-text-primary"
					>
						{logsExpanded ? '▲ SHOW LESS' : `▼ SHOW ${(liveLogs as any[]).length - 5} MORE`}
					</button>
				{/if}
			{/if}
		</Panel>

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
							{#each TIER_LABELS.slice(1) as label, i}
								<div class="flex shrink-0 flex-col items-center gap-1">
									<div class="flex items-center justify-center rounded text-[13px]" style="width: {22 + i * 4}px; height: {22 + i * 4}px; background: {TIER_COLORS[i+1]}22; border: 1px solid {TIER_COLORS[i+1]}55">{TIER_EMOJIS[i+1]}</div>
									<div class="text-[8px] font-bold" style="color: {TIER_COLORS[i+1]}">{label}</div>
									<div class="text-[8px] text-text-dim">T{i+1}</div>
								</div>
							{/each}
						</div>
					</div>
					<div>
						<div class="mb-2 text-[13px] font-bold text-gold">📈 How many flights to reach each level?</div>
						<div class="mb-2 text-[11px] text-text-dim">For Day, Night, and all Mission badges:</div>
						<div class="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
							{#each thresholds as t, i}
								<div class="rounded border p-1.5 text-center" style="border-color: {TIER_COLORS[i+1]}44; background: {TIER_COLORS[i+1]}11">
									<div class="text-[8px] text-text-dim">T{i+1}</div>
									<div class="font-bold text-[12px]" style="color: {TIER_COLORS[i+1]}">{t}</div>
									<div class="text-[8px] text-text-dim">flights</div>
								</div>
							{/each}
						</div>
						<div class="mb-2 mt-3 text-[11px] text-text-dim">For Real Ops badge:</div>
						<div class="flex gap-1.5">
							{#each realOpsThresholds as t, i}
								<div class="rounded border border-scarlet/30 bg-scarlet/10 p-1.5 text-center min-w-[44px]">
									<div class="text-[8px] text-text-dim">T{i+1}</div>
									<div class="font-bold text-[12px] text-scarlet-bright">{t}</div>
									<div class="text-[8px] text-text-dim">ops</div>
								</div>
							{/each}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-bg-elevated p-3 text-[11px] text-text-dim">
						⚠ <span class="font-semibold text-text-primary">Maintenance Test Flight</span> — Does not count toward any badge or score. Only for checking if the drone is working fine.
					</div>
				</Panel>
			{/if}
		</div>
	{/if}
</div>