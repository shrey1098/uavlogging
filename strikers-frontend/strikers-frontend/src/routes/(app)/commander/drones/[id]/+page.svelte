<script lang="ts">
	import { page } from '$app/stores';
	import { useDrone } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';

	const id = $derived($page.params.id);
	const query = $derived.by(() => useDrone(id));
	const drone = $derived($query.data);
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-center gap-2.5">
		<Button href="/commander/drones">← FLEET</Button>
		<span class="label-tiny">AIRFRAME FILE</span>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading drone..." />
	{:else if $query.error || !drone}
		<ErrorState
			message={extractError($query.error) || 'Drone not found'}
			onRetry={() => $query.refetch()}
		/>
	{:else}
		<Panel corner class="mb-3.5 p-4">
			<div class="flex flex-wrap items-center gap-3.5">
				<div class="text-5xl text-gold opacity-50">▲</div>
				<div class="min-w-[200px] flex-1">
					<div class="font-display text-[22px]">{drone.name}</div>
					<div class="mt-0.5 text-[12px] text-text-secondary">
						{drone.manufacturer} {drone.model} · SN {drone.serialNumber}
					</div>
					<div class="mt-2">
						<Chip variant={drone.status === 'grounded' ? 'danger' : 'ok'}>
							{drone.status?.toUpperCase() ?? 'READY'}
						</Chip>
					</div>
				</div>
				<div class="text-right">
					<div class="label-tiny">CYCLES</div>
					<div
						class="font-display text-4xl"
						style="color: {(drone.totalCycles ?? 0) > 180
							? 'rgb(255 45 63)'
							: 'rgb(245 235 226)'}"
					>
						{drone.totalCycles ?? 0}
					</div>
					<div class="text-[11px] text-text-dim">limit: 200</div>
				</div>
			</div>
		</Panel>

		<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
			<Panel class="p-3">
				<div class="stat-label">HOURS</div>
				<div class="stat-num mt-1 text-xl">{(drone.totalFlightHours ?? 0).toFixed(1)}h</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">FRAME</div>
				<div class="stat-num mt-1 text-xl">{drone.frameType.replace('_', ' ')}</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">FC</div>
				<div class="stat-num mt-1 text-xl uppercase">{drone.flightController}</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">WEIGHT</div>
				<div class="stat-num mt-1 text-xl">{drone.maxTakeoffWeight}g</div>
			</Panel>
		</div>
	{/if}
</div>
