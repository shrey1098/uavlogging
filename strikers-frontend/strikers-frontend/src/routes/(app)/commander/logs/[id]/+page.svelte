<script lang="ts">
	import { page } from '$app/stores';
	import { useFlightLog } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError, formatDateTime, formatDuration } from '$lib/utils';
	import type { Mission, Drone } from '$lib/types';

	const id = $derived($page.params.id);
	const query = $derived.by(() => useFlightLog(id));
	const log = $derived($query.data);

	const missionName = $derived(
		log?.mission && typeof log.mission === 'object' ? (log.mission as Mission).name : '—'
	);
	const droneName = $derived(
		log?.drone && typeof log.drone === 'object' ? (log.drone as Drone).name : '—'
	);

	function parseVariant(s?: string): any {
		if (s === 'parsed') return 'ok';
		if (s === 'failed') return 'danger';
		return 'warn';
	}
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-center gap-2.5">
		<Button href="/commander/logs">← LOG FEED</Button>
		<span class="label-tiny">FLIGHT LOG</span>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading log..." />
	{:else if $query.error || !log}
		<ErrorState
			message={extractError($query.error) || 'Log not found'}
			onRetry={() => $query.refetch()}
		/>
	{:else}
		<Panel corner class="mb-3.5 p-4">
			<div class="flex flex-wrap items-start gap-3.5">
				<div class="min-w-[200px] flex-1">
					<div class="label-tiny">LOG ID · {log._id.slice(-8).toUpperCase()}</div>
					<div class="font-display text-[18px]">{log.originalFilename}</div>
					<div class="mt-0.5 text-[12px] text-text-dim">
						Uploaded {formatDateTime(log.createdAt)}
					</div>
					<div class="mt-2 flex flex-wrap gap-1.5">
						<Chip variant={parseVariant(log.parseStatus)}>
							{log.parseStatus.toUpperCase()}
						</Chip>
						{#if log.fileExtension}<Chip>{log.fileExtension.toUpperCase()}</Chip>{/if}
					</div>
				</div>
				<div class="text-right">
					<div class="label-tiny">ANOMALY</div>
					<div
						class="font-display text-4xl"
						style="color: {(log.anomalyScore ?? 0) > 0.6
							? 'rgb(255 45 63)'
							: (log.anomalyScore ?? 0) > 0.3
								? 'rgb(212 167 44)'
								: 'rgb(245 235 226)'}"
					>
						{log.anomalyScore?.toFixed(2) ?? '—'}
					</div>
				</div>
			</div>
		</Panel>

		<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
			<Panel class="p-3">
				<div class="stat-label">DURATION</div>
				<div class="stat-num mt-1 text-xl">{formatDuration(log.durationSeconds)}</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">MAX ALT</div>
				<div class="stat-num mt-1 text-xl">
					{log.maxAltitudeMeters?.toFixed(0) ?? '—'}m
				</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">MAX SPEED</div>
				<div class="stat-num mt-1 text-xl">
					{log.maxSpeedMps?.toFixed(1) ?? '—'} m/s
				</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">DISTANCE</div>
				<div class="stat-num mt-1 text-xl">
					{log.totalDistanceKm?.toFixed(2) ?? '—'} km
				</div>
			</Panel>
		</div>

		<div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">ASSIGNMENT</div>
				<div class="grid grid-cols-1 gap-1.5 text-[13px]">
					<div class="flex justify-between">
						<span class="text-text-dim">MISSION</span><span class="text-gold">{missionName}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">DRONE</span><span>{droneName}</span>
					</div>
				</div>
			</Panel>

			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">
					ALERTS · {(log.alerts ?? []).length}
				</div>
				{#if (log.alerts ?? []).length === 0}
					<div class="text-[12px] text-text-dim">No alerts.</div>
				{:else}
					<div class="space-y-1.5 text-[12px]">
						{#each (log.alerts ?? []).slice(0, 6) as a}
							<div class="flex items-start justify-between gap-2">
								<span>{a.message}</span>
								<Chip variant={a.severity === 'critical' ? 'danger' : 'warn'}>
									{a.severity}
								</Chip>
							</div>
						{/each}
					</div>
				{/if}
			</Panel>
		</div>

		{#if log.parseError}
			<Panel class="mt-3.5 p-3.5">
				<div class="label-tiny mb-1.5 text-scarlet-bright">PARSE ERROR</div>
				<div class="text-[12px] text-scarlet-bright">{log.parseError}</div>
			</Panel>
		{/if}
	{/if}
</div>
