<script lang="ts">
	import { page } from '$app/stores';
	import { useDrone } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';
	import { dronesApi } from '$lib/api/drones';
	import { isCommander } from '$lib/stores';

	const id = $derived($page.params.id);
	const query = $derived.by(() => useDrone(id));
	const drone = $derived($query.data as any);

	let editing = $state(false);
	let saving = $state(false);
	let saveError = $state<string | null>(null);

	let editName = $state('');
	let editRemarks = $state('');
	let editNightCapability = $state('Nil');
	let editEwCompliance = $state('Nil');
	let editRange = $state<number | null>(null);
	let editIsActive = $state(true);

	function startEdit() {
		editName = drone?.name ?? '';
		editRemarks = drone?.remarks ?? '';
		editNightCapability = drone?.nightCapability ?? 'Nil';
		editEwCompliance = drone?.ewCompliance ?? 'Nil';
		editRange = drone?.range ?? null;
		editIsActive = drone?.isActive !== false;
		editing = true;
		saveError = null;
	}

	async function saveEdit() {
		saving = true;
		saveError = null;
		try {
			await dronesApi.update(id, {
				name: editName,
				remarks: editRemarks || null,
				nightCapability: editNightCapability,
				ewCompliance: editEwCompliance,
				range: editRange,
				isActive: editIsActive
			} as any);
			await $query.refetch();
			editing = false;
		} catch (err) {
			saveError = extractError(err);
		} finally {
			saving = false;
		}
	}

	const frameLabel: Record<string, string> = {
		quadcopter: 'Quad', hexacopter: 'Hexa', octocopter: 'Octo',
		fixed_wing: 'Fixed Wing', vtol: 'VTOL', tricopter: 'Tri',
		fpv_quadcopter: 'FPV Quad', trg: 'Training', other: 'Other'
	};

	const flightHours = $derived(
		drone?.totalFlightTime != null
			? (drone.totalFlightTime / 3600).toFixed(1)
			: '—'
	);
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-center justify-between">
		<div class="flex items-center gap-2.5">
			<Button href="/commander/drones">← FLEET</Button>
			<span class="label-tiny">AIRFRAME FILE</span>
		</div>
		{#if $isCommander && drone && !editing}
			<Button onclick={startEdit} variant="default" size="sm">✎ EDIT</Button>
		{/if}
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
			<div class="flex flex-wrap items-start gap-3.5">
				<div class="text-5xl text-gold opacity-50">▲</div>
				<div class="min-w-[200px] flex-1">
					{#if editing}
						<input bind:value={editName} class="input mb-1 w-full font-display text-[18px]" />
					{:else}
						<div class="font-display text-[22px]">{drone.name}</div>
					{/if}
					<div class="mt-0.5 text-[12px] text-text-secondary">
    {drone.model ?? '—'} · SN {drone.serialNumber ?? '—'}
</div>
					<div class="mt-2 flex flex-wrap items-center gap-1.5">
						{#if editing}
							<select bind:value={editIsActive} class="input text-[11px]">
								<option value={true}>ACTIVE</option>
								<option value={false}>INACTIVE</option>
							</select>
						{:else}
							<Chip variant={drone.isActive !== false ? 'ok' : 'danger'}>
								{drone.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
							</Chip>
						{/if}
						{#each (drone.tags ?? []) as tag}
							<Chip>{tag}</Chip>
						{/each}
					</div>
				</div>
				<div class="text-right">
					<div class="label-tiny">SORTIES</div>
					<div class="font-display text-4xl">{drone.totalFlights ?? 0}</div>
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
				<div class="stat-num mt-1 text-xl">{frameLabel[drone.frameType] ?? drone.frameType ?? '—'}</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">PROP SIZE</div>
				<div class="stat-num mt-1 text-xl">{drone.propSize ?? '—'}</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">RANGE</div>
				{#if editing}
					<input
						bind:value={editRange}
						type="number"
						class="input mt-1 w-full text-[13px]"
						placeholder="km"
					/>
				{:else}
					<div class="stat-num mt-1 text-xl">
						{drone.range != null ? `${drone.range} km` : '—'}
					</div>
				{/if}
			</Panel>
		</div>

		<!-- Spec + Capabilities -->
		<div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">SPECIFICATIONS</div>
				<div class="space-y-1.5 text-[13px]">
					<div class="flex justify-between">
						<span class="text-text-dim">FLIGHT CONTROLLER</span>
						<span>{drone.flightController ?? '—'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">MAX TAKEOFF WT</span>
						<span>{drone.maxTakeoffWeight != null ? `${drone.maxTakeoffWeight}g` : '—'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">PAYLOAD CAPACITY</span>
						<span>{drone.payloadCapacity != null ? `${drone.payloadCapacity} kg` : '—'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">REGISTRATION</span>
						<span>{drone.registrationNumber ?? '—'}</span>
					</div>
				</div>
			</Panel>

			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">CAPABILITIES</div>
				<div class="space-y-2 text-[13px]">
					<div class="flex items-center justify-between gap-3">
						<span class="text-text-dim">NIGHT OPS</span>
						{#if editing}
							<input bind:value={editNightCapability} class="input w-40 text-[11px]" placeholder="Nil" />
						{:else}
							<span class={drone.nightCapability !== 'Nil' ? 'text-gold' : 'text-text-dim'}>
								{drone.nightCapability ?? 'Nil'}
							</span>
						{/if}
					</div>
					<div class="flex items-center justify-between gap-3">
						<span class="text-text-dim">EW COMPLIANCE</span>
						{#if editing}
							<input bind:value={editEwCompliance} class="input w-40 text-[11px]" placeholder="Nil" />
						{:else}
							<span class={drone.ewCompliance !== 'Nil' ? 'text-gold' : 'text-text-dim'}>
								{drone.ewCompliance ?? 'Nil'}
							</span>
						{/if}
					</div>
				</div>

				<div class="label-tiny mb-1.5 mt-3.5">REMARKS</div>
				{#if editing}
					<textarea
						bind:value={editRemarks}
						class="input w-full text-[12px]"
						rows="3"
						placeholder="Freetext remarks..."
					></textarea>
				{:else}
					<div class="text-[12px] text-text-secondary">{drone.remarks || '—'}</div>
				{/if}
			</Panel>
		</div>

		<!-- Edit actions -->
		{#if editing}
			{#if saveError}
				<div class="mt-3 rounded border border-scarlet-bright/40 bg-scarlet-bright/10 p-2.5 text-[11px] text-scarlet-bright">
					⚠ {saveError}
				</div>
			{/if}
			<div class="mt-3.5 flex gap-2.5">
				<Button onclick={saveEdit} variant="primary" disabled={saving}>
					{saving ? 'SAVING...' : '✓ SAVE CHANGES'}
				</Button>
				<Button onclick={() => (editing = false)} variant="default">CANCEL</Button>
			</div>
		{/if}
	{/if}
</div>