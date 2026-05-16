<script lang="ts">
	import { page } from '$app/stores';
	import { useFlightLog, useReparseFlightLog } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { formatDateTime, formatDuration, extractError } from '$lib/utils';

	const id = $derived($page.params.id);
	const query = $derived.by(() => useFlightLog(id));
	const reparse = useReparseFlightLog();

	const log = $derived($query.data);
	const isLive = $derived(false); // backend doesn't expose training/live distinction yet

	const stats = $derived([
		{ label: 'DISTANCE', value: log?.totalDistanceKm?.toFixed(1) ?? '—', unit: 'km' },
		{ label: 'HEIGHT', value: log?.maxAltitudeMeters?.toFixed(0) ?? '—', unit: 'm' },
		{ label: 'SPEED', value: log?.maxSpeedMps?.toFixed(0) ?? '—', unit: 'm/s' },
		{ label: 'DURATION', value: formatDuration(log?.durationSeconds), unit: '' },
		{ label: 'ALERTS', value: log?.alertCount ?? 0, unit: '' },
		{ label: 'ANOMALY', value: log?.anomalyScore?.toFixed(2) ?? '—', unit: '' }
	]);
</script>

<div class="page-pad">
	<div class="mb-3 flex items-center justify-between lg:hidden">
		<Button href="/operator/flights" variant="default" size="sm">‹ BACK</Button>
		<span class="label-tiny">FLIGHT DETAIL</span>
		<span class="w-[60px]"></span>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading flight..." />
	{:else if $query.error || !log}
		<ErrorState
			message={extractError($query.error) || 'Flight log not found'}
			onRetry={() => $query.refetch()}
		/>
	{:else}
		<div class="label-tiny">FLIGHT LOG · {formatDateTime(log.createdAt)}</div>
		<div class="mt-1 font-display text-[24px]">{log.originalFilename}</div>
		<div class="mt-1.5 flex gap-1.5">
			<Chip variant={log.parseStatus === 'parsed' ? 'ok' : log.parseStatus === 'failed' ? 'danger' : 'warn'}>
				{log.parseStatus}
			</Chip>
			{#if log.durationSeconds}<Chip>{formatDuration(log.durationSeconds)}</Chip>{/if}
		</div>

		<!-- Flight path map placeholder -->
		<div
			class="map-bg corner relative mt-3.5 h-48 overflow-hidden rounded-lg sm:h-56"
		>
			<span class="c-tr"></span>
			<span class="c-bl"></span>
			<svg viewBox="0 0 360 200" class="h-full w-full">
				<path
					d="M30,170 Q90,40 160,110 T280,50 Q310,80 340,40"
					stroke="rgb(212 167 44)"
					stroke-width="2"
					fill="none"
				/>
				<circle cx="30" cy="170" r="5" fill="rgb(212 167 44)" />
				<text x="40" y="174" font-size="9" fill="rgb(212 167 44)">TAKEOFF</text>
				<circle cx="340" cy="40" r="5" fill="rgb(255 45 63)" />
				<text x="290" y="34" font-size="9" fill="rgb(255 45 63)">LANDED</text>
			</svg>
		</div>

		<!-- Quick stats -->
		<div class="mt-3.5 grid grid-cols-3 gap-2 sm:grid-cols-6">
			{#each stats as s}
				<div class="rounded-lg border border-border bg-bg-panel p-2.5 text-center">
					<div class="label-tiny" style="font-size: 8.5px">{s.label}</div>
					<div class="med-num mt-0.5" style="font-size: 22px">
						{s.value}{#if s.unit}<span class="text-[10px] text-text-dim">{s.unit}</span>{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Issues -->
		{#if log.alerts && log.alerts.length > 0}
			<div class="label-tiny mb-2 mt-5">⚠ ISSUES TO REVIEW · {log.alerts.length}</div>
			<div class="space-y-2">
				{#each log.alerts as alert}
					<div
						class="rounded-lg border border-border bg-bg-panel p-3.5"
						style="border-left: 3px solid {alert.severity === 'critical' ? 'rgb(255 45 63)' : 'rgb(212 167 44)'}"
					>
						<div class="flex items-start justify-between">
							<div
								class="text-[13px] font-bold"
								style="color: {alert.severity === 'critical' ? 'rgb(255 45 63)' : 'rgb(212 167 44)'}"
							>
								{alert.message}
							</div>
							<span class="text-[10px] text-text-dim">{formatDuration(alert.t)}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if log.parseStatus === 'failed'}
			<div class="mt-4 flex gap-2">
				<Button onclick={() => $reparse.mutate(id)} variant="default">
					⟳ RETRY PARSE
				</Button>
			</div>
			{#if log.parseError}
				<div
					class="mt-2 rounded-md border border-scarlet-bright/40 bg-scarlet-bright/10 p-2.5 text-[11px] text-scarlet-bright"
				>
					{log.parseError}
				</div>
			{/if}
		{/if}
	{/if}
</div>
