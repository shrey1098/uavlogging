<script lang="ts">
	import { goto } from '$app/navigation';
	import { Panel, Button } from '$lib/components/ui';
	import { dronesApi } from '$lib/api/drones';
	import { extractError } from '$lib/utils';

	let saving = $state(false);
	let error = $state<string | null>(null);

	let name = $state('');
	let serialNumber = $state('');
	let manufacturer = $state('');
	let model = $state('');
	let frameType = $state('quadcopter');
	let propSize = $state('');
	let flightController = $state('');
	let maxTakeoffWeight = $state<number | null>(null);
	let payloadCapacity = $state<number | null>(null);
	let range = $state<number | null>(null);
	let nightCapability = $state('Nil');
	let ewCompliance = $state('Nil');
	let registrationNumber = $state('');
	let remarks = $state('');

	const frameTypes = [
		{ value: 'quadcopter', label: 'Quadcopter' },
		{ value: 'hexacopter', label: 'Hexacopter' },
		{ value: 'octocopter', label: 'Octocopter' },
		{ value: 'fixed_wing', label: 'Fixed Wing' },
		{ value: 'vtol', label: 'VTOL' },
		{ value: 'tricopter', label: 'Tricopter' },
		{ value: 'fpv_quadcopter', label: 'FPV Quadcopter' },
		{ value: 'trg', label: 'Training' },
		{ value: 'other', label: 'Other' }
	];

	async function handleCreate() {
		if (!name) { error = 'Name is required.'; return; }
		saving = true; error = null;
		try {
			const drone = await dronesApi.create({
				name, serialNumber, manufacturer, model,
				frameType: frameType as any,
				propSize: propSize || null,
				flightController,
				maxTakeoffWeight,
				payloadCapacity,
				range,
				nightCapability,
				ewCompliance,
				registrationNumber,
				remarks: remarks || null
			} as any);
			goto(`/commander/drones/${(drone as any)._id}`);
		} catch (err) {
			error = extractError(err);
		} finally {
			saving = false;
		}
	}
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-center gap-2.5">
		<Button href="/commander/drones">← FLEET</Button>
		<span class="label-tiny">NEW AIRFRAME</span>
	</div>

	<Panel corner class="p-4">
		<div class="label-tiny mb-4">AIRFRAME DETAILS</div>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div>
				<div class="label-tiny mb-1">NAME · REQUIRED</div>
				<input bind:value={name} class="input w-full" placeholder="e.g. RPAV Trinetra" />
			</div>
			<div>
				<div class="label-tiny mb-1">SERIAL NUMBER</div>
				<input bind:value={serialNumber} class="input w-full" placeholder="e.g. 029" />
			</div>
			<div>
				<div class="label-tiny mb-1">MANUFACTURER</div>
				<input bind:value={manufacturer} class="input w-full" placeholder="e.g. Idea Forge" />
			</div>
			<div>
				<div class="label-tiny mb-1">MODEL</div>
				<input bind:value={model} class="input w-full" placeholder="e.g. Q5HA" />
			</div>
			<div>
				<div class="label-tiny mb-1">FRAME TYPE</div>
				<select bind:value={frameType} class="input w-full">
					{#each frameTypes as ft}
						<option value={ft.value}>{ft.label}</option>
					{/each}
				</select>
			</div>
			<div>
				<div class="label-tiny mb-1">PROP SIZE</div>
				<input bind:value={propSize} class="input w-full" placeholder="e.g. 10 inch" />
			</div>
			<div>
				<div class="label-tiny mb-1">FLIGHT CONTROLLER</div>
				<input bind:value={flightController} class="input w-full" placeholder="e.g. Orange Cube+" />
			</div>
			<div>
				<div class="label-tiny mb-1">REGISTRATION NO</div>
				<input bind:value={registrationNumber} class="input w-full" placeholder="Optional" />
			</div>
			<div>
				<div class="label-tiny mb-1">MAX TAKEOFF WEIGHT (g)</div>
				<input bind:value={maxTakeoffWeight} type="number" class="input w-full" placeholder="grams" />
			</div>
			<div>
				<div class="label-tiny mb-1">PAYLOAD CAPACITY (kg)</div>
				<input bind:value={payloadCapacity} type="number" step="0.1" class="input w-full" placeholder="kilograms" />
			</div>
			<div>
				<div class="label-tiny mb-1">RANGE (km)</div>
				<input bind:value={range} type="number" class="input w-full" placeholder="kilometres" />
			</div>
			<div>
				<div class="label-tiny mb-1">NIGHT CAPABILITY</div>
				<input bind:value={nightCapability} class="input w-full" placeholder="Nil" />
			</div>
			<div>
				<div class="label-tiny mb-1">EW COMPLIANCE</div>
				<input bind:value={ewCompliance} class="input w-full" placeholder="Nil" />
			</div>
		</div>
		<div class="mt-3">
			<div class="label-tiny mb-1">REMARKS</div>
			<textarea bind:value={remarks} class="input w-full text-[12px]" rows="3" placeholder="Freetext remarks..."></textarea>
		</div>

		{#if error}
			<div class="mt-3 rounded border border-scarlet-bright/40 bg-scarlet-bright/10 p-2.5 text-[11px] text-scarlet-bright">
				⚠ {error}
			</div>
		{/if}

		<div class="mt-4 flex gap-2.5">
			<Button onclick={handleCreate} variant="primary" disabled={saving}>
				{saving ? 'SAVING...' : '+ ADD TO FLEET'}
			</Button>
			<Button href="/commander/drones" variant="default">CANCEL</Button>
		</div>
	</Panel>
</div>