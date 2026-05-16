<script lang="ts">
	import { useDrones } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';

	const query = useDrones();

	function statusVariant(s?: string) {
		if (s === 'maintenance') return 'warn';
		if (s === 'grounded') return 'danger';
		if (s === 'new') return 'info';
		return 'ok';
	}

	function statusLabel(s?: string) {
		const map: Record<string, string> = {
			ready: 'READY',
			maintenance: 'NEEDS SERVICE',
			grounded: 'GROUNDED',
			new: 'NEW'
		};
		return map[s ?? 'ready'] ?? 'READY';
	}
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-end justify-between">
		<div>
			<div class="label-tiny">YOUR EQUIPMENT</div>
			<div class="mt-0.5 font-display text-2xl">MY DRONES</div>
		</div>
		<Button variant="default">＋ ADD</Button>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading drones..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else if ($query.data ?? []).length === 0}
		<Panel class="p-6 text-center">
			<div class="label-tiny">NO DRONES REGISTERED</div>
			<div class="mt-2 text-xs text-text-dim">Register your first drone to get started.</div>
		</Panel>
	{:else}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each $query.data ?? [] as drone}
				<Panel corner class="p-4">
					<div class="flex items-start justify-between">
						<div>
							<div class="font-display text-2xl">{drone.name}</div>
							<div class="mt-0.5 text-[11px] text-text-dim">
								{drone.manufacturer} {drone.model} · SN {drone.serialNumber}
							</div>
						</div>
						<Chip variant={statusVariant(drone.status) as any}>{statusLabel(drone.status)}</Chip>
					</div>

					{#if drone.status === 'maintenance'}
						<div
							class="mt-2.5 rounded-md border border-gold/30 bg-gold/10 p-2.5 text-[12px]"
						>
							<span class="text-gold">⚠</span> Maintenance due based on cycle count.
						</div>
					{/if}

					<div
						class="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-2.5 text-center"
					>
						<div>
							<div class="label-tiny">FLIGHTS</div>
							<div class="med-num mt-0.5" style="font-size: 18px">{drone.totalCycles ?? 0}</div>
						</div>
						<div>
							<div class="label-tiny">HOURS</div>
							<div class="med-num mt-0.5" style="font-size: 18px">
								{(drone.totalFlightHours ?? 0).toFixed(0)}
							</div>
						</div>
						<div>
							<div class="label-tiny">FRAME</div>
							<div class="mt-1 text-[11px]">{drone.frameType.replace('_', ' ')}</div>
						</div>
					</div>
				</Panel>
			{/each}
		</div>
	{/if}
</div>
