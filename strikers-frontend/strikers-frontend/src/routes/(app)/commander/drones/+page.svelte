<script lang="ts">
	import { useDrones } from '$lib/api/queries';
	import { extractError } from '$lib/utils';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	const query = useDrones();

	const drones = $derived($query.data ?? []);
	const active = $derived((drones as any[]).filter(d => d.isActive !== false));
	const inactive = $derived((drones as any[]).filter(d => d.isActive === false));
	const totalHours = $derived(
		(drones as any[]).reduce((s, d) => s + (d.totalFlightTime ?? 0) / 3600, 0).toFixed(0)
	);

	function statusVariant(drone: any): any {
		return drone.isActive !== false ? 'ok' : 'danger';
	}

	function statusLabel(drone: any): string {
		return drone.isActive !== false ? 'ACTIVE' : 'INACTIVE';
	}
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-end justify-between">
    <div>
        <div class="label-tiny">FLEET ROSTER · UNIT WIDE</div>
        <h1 class="h1 mt-1">FLEET · {drones.length} AIRFRAMES</h1>
    </div>
    <Button href="/commander/drones/new" variant="primary" size="sm">+ ADD DRONE</Button>
</div>

	{#if $query.isLoading}
		<Loading label="Loading fleet..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else}
		<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
			<Panel class="p-3.5">
				<div class="stat-label">ACTIVE</div>
				<div class="stat-num mt-1 text-gold">{active.length}</div>
			</Panel>
			<Panel class="p-3.5">
				<div class="stat-label">INACTIVE</div>
				<div class="stat-num mt-1 text-scarlet-bright">{inactive.length}</div>
			</Panel>
			<Panel class="p-3.5">
				<div class="stat-label">TOTAL HOURS</div>
				<div class="stat-num mt-1">{totalHours}h</div>
			</Panel>
		</div>

		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
			{#each drones as drone}
				<a href="/commander/drones/{(drone as any)._id}">
					<Panel corner class="cursor-pointer p-2.5 hover:border-gold">
						<div class="flex items-start justify-between gap-1">
							<div class="font-display text-base leading-tight">{(drone as any).name}</div>
<Chip variant={statusVariant(drone)}>{statusLabel(drone)}</Chip>
</div>
<div class="mt-0.5 text-[10px] text-text-dim">
    SN {(drone as any).serialNumber ?? '—'} · {(drone as any).model ?? '—'}
</div>
						<div class="mt-2 grid grid-cols-2 gap-1 text-[11px]">
							<div>
								<span class="text-text-dim">SORTIES</span>
								{(drone as any).totalFlights ?? 0}
							</div>
							<div>
								<span class="text-text-dim">HRS</span>
								{((drone as any).totalFlightTime ?? 0 / 3600).toFixed(0)}
							</div>
						</div>
						{#if (drone as any).propSize}
							<div class="mt-1 text-[10px] text-text-dim">
								{(drone as any).frameType?.replace('_', ' ').toUpperCase()} · {(drone as any).propSize}
							</div>
						{/if}
					</Panel>
				</a>
			{/each}
		</div>
	{/if}
</div>