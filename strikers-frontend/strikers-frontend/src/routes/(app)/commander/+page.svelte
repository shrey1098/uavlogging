<script lang="ts">
	import { useUnitReadiness, useDrones, useFlightLogs } from '$lib/api/queries';
	import { Panel, Button, Loading } from '$lib/components/ui';
	import { formatDateTime } from '$lib/utils';
	import { tierEmoji, tierColor } from '$lib/api/readiness';

	const readinessQuery = useUnitReadiness();
	const dronesQuery = useDrones();
	const logsQuery = useFlightLogs({ sort: '-createdAt', limit: 10 });

	const operators = $derived($readinessQuery.data ?? []);
	const drones = $derived(($dronesQuery.data ?? []) as any[]);
	const logs = $derived(($logsQuery.data ?? []) as any[]);

	const avgScore = $derived(
		operators.length
			? Math.round(operators.reduce((s, r) => s + r.readinessScore, 0) / operators.length)
			: 0
	);
	const ready = $derived(operators.filter(r => r.readinessScore >= 75).length);
	const low = $derived(operators.filter(r => r.readinessScore < 50).length);
	const topOperators = $derived([...operators].sort((a, b) => b.readinessScore - a.readinessScore).slice(0, 5));
	const atRisk = $derived([...operators].sort((a, b) => a.readinessScore - b.readinessScore).filter(r => r.readinessScore < 50).slice(0, 3));

	const activeDrones = $derived(drones.filter(d => d.isActive !== false).length);
	const inactiveDrones = $derived(drones.filter(d => d.isActive === false).length);
	const totalHours = $derived(drones.reduce((s, d) => s + (d.totalFlightTime ?? 0) / 3600, 0).toFixed(0));

	function scoreColor(s: number) {
		if (s >= 75) return 'rgb(100 220 120)';
		if (s >= 50) return 'rgb(212 167 44)';
		return 'rgb(255 45 63)';
	}

	function statusIcon(s: string) {
		if (s === 'completed') return '✓';
		if (s === 'failed') return '✕';
		return '⟳';
	}

	function statusColor(s: string) {
		if (s === 'completed') return 'rgb(100 220 120)';
		if (s === 'failed') return 'rgb(255 45 63)';
		return 'rgb(212 167 44)';
	}
	let logsOpen = $state(false);
</script>

<div class="page-pad">
	<div class="mb-4">
		<div class="label-tiny">COMMAND · UNIT OVERVIEW</div>
		<h1 class="h1 mt-1">DASHBOARD</h1>
	</div>

	<!-- Readiness summary -->
	<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
		<Panel class="p-3.5">
			<div class="stat-label">AVG READINESS</div>
			<div class="font-display mt-1 text-3xl" style="color: {scoreColor(avgScore)}">{avgScore}</div>
		</Panel>
		<Panel class="p-3.5">
			<div class="stat-label">READY (75+)</div>
			<div class="font-display mt-1 text-3xl text-green-400">{ready}</div>
		</Panel>
		<Panel class="p-3.5">
			<div class="stat-label">LOW (&lt;50)</div>
			<div class="font-display mt-1 text-3xl" style="color: {low > 0 ? 'rgb(255 45 63)' : 'rgb(100 220 120)'}">{low}</div>
		</Panel>
		<Panel class="p-3.5">
			<div class="stat-label">TOTAL OPERATORS</div>
			<div class="font-display mt-1 text-3xl">{operators.length}</div>
		</Panel>
	</div>

	<div class="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
		<!-- Top operators -->
		<Panel class="p-3.5 lg:col-span-2">
			<div class="mb-3 flex items-center justify-between">
				<div class="label-tiny">TOP OPERATORS</div>
				<Button href="/commander/operators" size="sm">VIEW ALL ▸</Button>
			</div>
			{#if $readinessQuery.isLoading}
				<Loading label="Loading..." />
			{:else}
				<div class="space-y-2">
					{#each topOperators as r, i}
						<div
							class="flex cursor-pointer items-center gap-3 rounded-lg border border-border/40 p-2.5 transition-colors hover:bg-bg-elevated"
							onclick={() => window.location.href = `/commander/operators/${(r as any).operator?._id ?? r.user?._id}`}
						>
							<div class="w-5 text-center text-[11px] font-bold text-text-dim">#{i + 1}</div>
							<div class="flex-1 text-[12px] font-semibold">{r.user?.name ?? '—'}</div>
							<div class="flex gap-1 text-[14px]">
								{(r as any).badges?.time?.day > 0 ? tierEmoji((r as any).badges.time.day) : ''}
								{(r as any).badges?.time?.night > 0 ? tierEmoji((r as any).badges.time.night) : ''}
								{(r as any).badges?.type?.surveillance > 0 ? tierEmoji((r as any).badges.type.surveillance) : ''}
							</div>
							<div class="font-display w-10 text-right text-[20px]" style="color: {scoreColor(r.readinessScore)}">{r.readinessScore}</div>
						</div>
					{/each}
				</div>

				{#if atRisk.length > 0}
					<div class="mt-3 border-t border-border/40 pt-3">
						<div class="label-tiny mb-2 text-scarlet-bright">⚠ NEEDS ATTENTION</div>
						<div class="space-y-1.5">
							{#each atRisk as r}
								<div
									class="flex cursor-pointer items-center justify-between rounded border border-scarlet/20 bg-scarlet/5 px-2.5 py-1.5 text-[11px] transition-colors hover:bg-scarlet/10"
									onclick={() => window.location.href = `/commander/operators/${(r as any).operator?._id ?? r.user?._id}`}
								>
									<span>{r.user?.name ?? '—'}</span>
									<span style="color: {scoreColor(r.readinessScore)}">{r.readinessScore}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</Panel>

		<!-- Fleet status -->
		<Panel class="p-3.5">
			<div class="mb-3 flex items-center justify-between">
				<div class="label-tiny">FLEET STATUS</div>
				<Button href="/commander/drones" size="sm">VIEW ▸</Button>
			</div>
			{#if $dronesQuery.isLoading}
				<Loading label="Loading..." />
			{:else}
				<div class="space-y-2.5">
					<div class="flex items-center justify-between rounded-lg border border-green-500/20 bg-green-500/5 p-2.5">
						<span class="text-[12px]">🟢 Active</span>
						<span class="font-display text-[20px] text-green-400">{activeDrones}</span>
					</div>
					<div class="flex items-center justify-between rounded-lg border border-scarlet/20 bg-scarlet/5 p-2.5">
						<span class="text-[12px]">🔴 Inactive</span>
						<span class="font-display text-[20px] text-scarlet-bright">{inactiveDrones}</span>
					</div>
					<div class="flex items-center justify-between rounded-lg border border-border p-2.5">
						<span class="text-[12px]">⏱ Total Hours</span>
						<span class="font-display text-[20px]">{totalHours}h</span>
					</div>
					<div class="flex items-center justify-between rounded-lg border border-border p-2.5">
						<span class="text-[12px]">🚁 Airframes</span>
						<span class="font-display text-[20px]">{drones.length}</span>
					</div>
				</div>
				<Button href="/commander/drones/new" variant="default" size="sm" class="mt-3 w-full">+ ADD DRONE</Button>
			{/if}
		</Panel>
	</div>

<!-- Recent uploads -->
	<Panel class="mt-3.5 overflow-hidden p-0">
		<div
			class="flex cursor-pointer items-center justify-between border-b border-border px-4 py-2.5 hover:bg-bg-elevated transition-colors"
			onclick={() => (logsOpen = !logsOpen)}
		>
			<div class="label-tiny">RECENT UPLOADS</div>
			<div class="flex items-center gap-2">
				<Button href="/commander/logs" size="sm" onclick={(e: Event) => e.stopPropagation()}>ALL LOGS ▸</Button>
				<span class="text-[12px] text-text-dim" style="transition: transform 0.3s; display:inline-block; transform: rotate({logsOpen ? 180 : 0}deg)">▼</span>
			</div>
		</div>
		{#if logsOpen}
		{#if $logsQuery.isLoading}
			<div class="p-4 text-center text-[11px] text-text-dim">Loading...</div>
		{:else if logs.length === 0}
			<div class="p-4 text-center text-[11px] text-text-dim">No logs yet.</div>
		{:else}
			<div class="divide-y divide-border/40">
				{#each logs as log}
					<a href="/commander/logs/{log._id}" class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-elevated">
						<div
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[12px] font-bold"
							style="color: {statusColor(log.parseStatus)}; background: {statusColor(log.parseStatus)}18"
						>
							{statusIcon(log.parseStatus)}
						</div>
						<div class="min-w-0 flex-1">
							<div class="truncate text-[12px] font-semibold">{log.originalName ?? log.originalFilename ?? '—'}</div>
							<div class="mt-0.5 text-[10px] text-text-dim">{formatDateTime(log.createdAt)}</div>
						</div>
						{#if log.parsedData?.anomalyScore != null}
							<div class="text-right">
								<div class="text-[9px] text-text-dim">ANOM</div>
								<div
									class="font-display text-[14px]"
									style="color: {log.parsedData.anomalyScore > 60 ? 'rgb(255 45 63)' : log.parsedData.anomalyScore > 30 ? 'rgb(212 167 44)' : 'rgb(100 220 120)'}"
								>
									{log.parsedData.anomalyScore}
								</div>
							</div>
						{/if}
						<span class="text-[12px] text-text-dim">›</span>
					</a>
				{/each}
			</div>
		{/if}
		{/if}
	</Panel>

	<!-- Quick actions -->
	<div class="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
		<Button href="/commander/upload" variant="primary" size="sm" class="w-full">⬆ UPLOAD LOG</Button>
		<Button href="/commander/operators" variant="default" size="sm" class="w-full">👥 ROSTER</Button>
		<Button href="/commander/drones" variant="default" size="sm" class="w-full">🚁 FLEET</Button>
		<Button href="/commander/missions" variant="default" size="sm" class="w-full">◈ MISSIONS</Button>
	</div>
</div>