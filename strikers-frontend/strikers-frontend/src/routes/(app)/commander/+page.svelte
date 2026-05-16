<script lang="ts">
	import { useOperators, useDrones, useFlightLogs, useMissions } from '$lib/api/queries';
	import { Panel, Chip, Loading } from '$lib/components/ui';

	const operatorsQuery = useOperators();
	const dronesQuery = useDrones();
	const logsQuery = useFlightLogs({ limit: 100 });
	const missionsQuery = useMissions();

	const stats = $derived.by(() => {
		const ops = $operatorsQuery.data ?? [];
		const drones = $dronesQuery.data ?? [];
		const logs = $logsQuery.data ?? [];
		const ready = drones.filter((d) => !d.status || d.status === 'ready').length;
		const maint = drones.filter((d) => d.status === 'maintenance').length;
		const grounded = drones.filter((d) => d.status === 'grounded').length;
		const critical = logs.filter((l) => (l.anomalyScore ?? 0) > 0.5).length;
		return {
			operators: ops.length,
			drones: drones.length,
			ready,
			maint,
			grounded,
			sorties: logs.length,
			critical
		};
	});
</script>

<div class="page-pad">
	<div class="mb-4">
		<div class="label-tiny">COMMAND DECK · 17 JAK LI · ALPHA COY</div>
		<h1 class="h1 mt-1">UNIT READINESS</h1>
	</div>

	<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
		<Panel corner class="p-3.5">
			<div class="stat-label">UNIT READINESS</div>
			<div class="stat-num mt-1 text-gold">82</div>
			<div class="mt-0.5 text-[11px] text-text-dim">↑ +3</div>
		</Panel>
		<Panel class="p-3.5">
			<div class="stat-label">OPERATORS</div>
			<div class="stat-num mt-1">{stats.operators}</div>
			<div class="mt-0.5 text-[11px] text-text-dim">active</div>
		</Panel>
		<Panel class="p-3.5">
			<div class="stat-label">FLEET</div>
			<div class="stat-num mt-1">
				{stats.ready}<span class="text-sm text-text-dim">/{stats.drones}</span>
			</div>
			<div class="mt-0.5 text-[11px] text-text-dim">{stats.maint} in maint</div>
		</Panel>
		<Panel class="p-3.5">
			<div class="stat-label">SORTIES</div>
			<div class="stat-num mt-1">{stats.sorties}</div>
			<div class="mt-0.5 text-[11px] text-text-dim">last 30d</div>
		</Panel>
		<Panel class="p-3.5">
			<div class="stat-label">CRITICAL</div>
			<div class="stat-num mt-1 text-scarlet-bright">{stats.critical}</div>
			<div class="mt-0.5 text-[11px] text-text-dim">unresolved</div>
		</Panel>
	</div>

	<div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
		<Panel class="p-3.5">
			<div class="label-tiny mb-2.5">FLAGGED FOR REVIEW</div>
			{#if $logsQuery.isLoading}
				<Loading label="Loading..." />
			{:else}
				<div class="space-y-2.5">
					{#each ($logsQuery.data ?? []).filter((l) => (l.anomalyScore ?? 0) > 0.4).slice(0, 5) as log}
						<div
							class="border-l-2 pl-2.5"
							style="border-color: {(log.anomalyScore ?? 0) > 0.6
								? 'rgb(255 45 63)'
								: 'rgb(212 167 44)'}"
						>
							<div class="flex justify-between text-[12px]">
								<span>{log.originalFilename}</span>
								<span class="text-text-dim">anom {log.anomalyScore?.toFixed(2)}</span>
							</div>
						</div>
					{:else}
						<div class="text-[11px] text-text-dim">No critical issues.</div>
					{/each}
				</div>
			{/if}
		</Panel>

		<Panel class="p-3.5">
			<div class="label-tiny mb-2.5">FLEET STATUS</div>
			<div class="space-y-2">
				<div class="flex justify-between text-[12px]">
					<span>Flight Ready</span>
					<Chip variant="ok">{stats.ready}</Chip>
				</div>
				<div class="flex justify-between text-[12px]">
					<span>Maintenance</span>
					<Chip variant="warn">{stats.maint}</Chip>
				</div>
				<div class="flex justify-between text-[12px]">
					<span>Grounded</span>
					<Chip variant="danger">{stats.grounded}</Chip>
				</div>
			</div>
		</Panel>
	</div>
</div>
