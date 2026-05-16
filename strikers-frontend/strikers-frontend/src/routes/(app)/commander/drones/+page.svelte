<script lang="ts">
	import { useDrones } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';

	const query = useDrones();

	function statusVariant(s?: string): any {
		if (s === 'maintenance') return 'warn';
		if (s === 'grounded') return 'danger';
		if (s === 'new') return 'info';
		return 'ok';
	}
</script>

<div class="page-pad">
	<div class="mb-3.5">
		<div class="label-tiny">FLEET ROSTER · UNIT WIDE</div>
		<h1 class="h1 mt-1">FLEET · {($query.data ?? []).length} AIRFRAMES</h1>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading fleet..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else}
		<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
			<Panel class="p-3.5">
				<div class="stat-label">READY</div>
				<div class="stat-num mt-1 text-gold">
					{($query.data ?? []).filter((d) => !d.status || d.status === 'ready').length}
				</div>
			</Panel>
			<Panel class="p-3.5">
				<div class="stat-label">MAINTENANCE</div>
				<div class="stat-num mt-1 text-gold">
					{($query.data ?? []).filter((d) => d.status === 'maintenance').length}
				</div>
			</Panel>
			<Panel class="p-3.5">
				<div class="stat-label">GROUNDED</div>
				<div class="stat-num mt-1 text-scarlet-bright">
					{($query.data ?? []).filter((d) => d.status === 'grounded').length}
				</div>
			</Panel>
			<Panel class="p-3.5">
				<div class="stat-label">TOTAL HOURS</div>
				<div class="stat-num mt-1">
					{($query.data ?? []).reduce((s, d) => s + (d.totalFlightHours ?? 0), 0).toFixed(0)}
				</div>
			</Panel>
		</div>

		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
			{#each $query.data ?? [] as drone}
				<a href="/commander/drones/{drone._id}">
					<Panel corner class="cursor-pointer p-2.5 hover:border-gold">
						<div class="flex items-start justify-between">
							<div class="font-display text-base">{drone.name}</div>
							<Chip variant={statusVariant(drone.status)}>{drone.status ?? 'READY'}</Chip>
						</div>
						<div class="mt-0.5 text-[10px] text-text-dim">{drone.manufacturer} {drone.model}</div>
						<div class="mt-2 grid grid-cols-2 gap-1 text-[11px]">
							<div><span class="text-text-dim">CYC</span> {drone.totalCycles ?? 0}</div>
							<div>
								<span class="text-text-dim">HRS</span>
								{(drone.totalFlightHours ?? 0).toFixed(0)}
							</div>
						</div>
					</Panel>
				</a>
			{/each}
		</div>
	{/if}
</div>
