<script lang="ts">
	import { page } from '$app/stores';
	import { useDrone } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';

	const id = $derived($page.params.id);
	const query = $derived.by(() => useDrone(id));
	const drone = $derived($query.data);

	const frameLabel = $derived(() => {
		const map: Record<string, string> = {
			quadcopter: 'Quad',
			hexacopter: 'Hexa',
			octocopter: 'Octo',
			fixed_wing: 'Fixed Wing',
			vtol: 'VTOL',
			tricopter: 'Tri',
			fpv_quadcopter: 'FPV Quad',
			trg: 'Training',
			other: 'Other'
		};
		return map[(drone as any)?.frameType] ?? (drone as any)?.frameType ?? '—';
	});

	const flightHours = $derived(
		(drone as any)?.totalFlightTime != null
			? ((drone as any).totalFlightTime / 3600).toFixed(1)
			: '—'
	);
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
					<div class="font-display text-[22px]">{(drone as any).name}</div>
					<div class="mt-0.5 text-[12px] text-text-secondary">
						{(drone as any).manufacturer ?? '—'} {(drone as any).model ?? ''} · SN {(drone as any).serialNumber ?? '—'}
					</div>
					<div class="mt-2 flex flex-wrap gap-1.5">
						<Chip variant={(drone as any).status === 'inactive' ? 'danger' : 'ok'}>
							{(drone as any).status?.toUpperCase() ?? 'ACTIVE'}
						</Chip>
						{#if (drone as any).tags?.length}
							{#each (drone as any).tags as tag}
								<Chip>{tag}</Chip>
							{/each}
						{/if}
					</div>
				</div>
				<div class="text-right">
					<div class="label-tiny">SORTIES</div>
					<div class="font-display text-4xl">{(drone as any).totalFlights ?? 0}</div>
				</div>
			</div>
		</Panel>

		<!-- Quick stats -->
		<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
			<Panel class="p-3">
				<div class="stat-label">HOURS</div>
				<div class="stat-num mt-1 text-xl">{flightHours}h</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">FRAME</div>
				<div class="stat-num mt-1 text-xl">{frameLabel()}</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">PROP SIZE</div>
				<div class="stat-num mt-1 text-xl">{(drone as any).propSize ?? '—'}</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">RANGE</div>
				<div class="stat-num mt-1 text-xl">
					{(drone as any).range != null ? `${(drone as any).range} km` : '—'}
				</div>
			</Panel>
		</div>

		<!-- Spec table -->
		<div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">SPECIFICATIONS</div>
				<div class="space-y-1.5 text-[13px]">
					<div class="flex justify-between">
						<span class="text-text-dim">FLIGHT CONTROLLER</span>
						<span>{(drone as any).flightController ?? '—'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">MAX TAKEOFF WT</span>
						<span>{(drone as any).maxTakeoffWeight != null ? `${(drone as any).maxTakeoffWeight}g` : '—'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">PAYLOAD CAPACITY</span>
						<span>{(drone as any).payloadCapacity != null ? `${(drone as any).payloadCapacity} kg` : '—'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">REGISTRATION</span>
						<span>{(drone as any).registrationNumber ?? '—'}</span>
					</div>
				</div>
			</Panel>

			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">CAPABILITIES</div>
				<div class="space-y-1.5 text-[13px]">
					<div class="flex justify-between">
						<span class="text-text-dim">NIGHT OPS</span>
						<span class={(drone as any).nightCapability !== 'Nil' ? 'text-gold' : 'text-text-dim'}>
							{(drone as any).nightCapability ?? 'Nil'}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">EW COMPLIANCE</span>
						<span class={(drone as any).ewCompliance !== 'Nil' ? 'text-gold' : 'text-text-dim'}>
							{(drone as any).ewCompliance ?? 'Nil'}
						</span>
					</div>
				</div>
				{#if (drone as any).remarks}
					<div class="label-tiny mb-1.5 mt-3.5">REMARKS</div>
					<div class="text-[12px] text-text-secondary">{(drone as any).remarks}</div>
				{/if}
			</Panel>
		</div>
	{/if}
</div>