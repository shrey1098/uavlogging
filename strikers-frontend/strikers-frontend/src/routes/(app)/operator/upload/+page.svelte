<script lang="ts">
	import { goto } from '$app/navigation';
	import { useUploadFlightLog, useDrones, useMissions } from '$lib/api/queries';
	import { Panel, Button } from '$lib/components/ui';
	import { extractError, formatBytes } from '$lib/utils';
	import { isCommander } from '$lib/stores';

	const upload = useUploadFlightLog();
	const dronesQuery = useDrones();
	const missionsQuery = useMissions();

	let fileInput: HTMLInputElement;
	let progress = $state(0);
	let selectedFile = $state<File | null>(null);
	let selectedDroneId = $state<string>('');
	let selectedMissionId = $state<string>('');
	let error = $state<string | null>(null);

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			selectedFile = file;
			error = null;
		}
	}

	async function handleUpload() {
		if (!selectedFile) return;
		if (!selectedDroneId) {
			error = 'Please select a drone before uploading.';
			return;
		}
		error = null;
		progress = 0;
		try {
			const result = await $upload.mutateAsync({
				file: selectedFile,
				droneId: selectedDroneId,
				missionId: selectedMissionId || undefined,
				onProgress: (p) => (progress = p)
			});
			goto(`/operator/flights/${result.flightLog._id}`);
		} catch (err) {
			error = extractError(err);
		}
	}

	const drones = $derived($dronesQuery.data ?? []);
	const missions = $derived($missionsQuery.data ?? []);
</script>

<div class="page-pad">
	<div class="text-center">
		<div class="label-tiny">DATA INGESTION</div>
		<div class="mt-1 font-display text-2xl">UPLOAD A LOG</div>
		<div class="mx-auto mt-1.5 max-w-md text-[12px] text-text-secondary">
			Pick the file from your phone or transfer it from the ground station.
		</div>
	</div>

	<!-- Drop zone -->
	<label for="file-input">
		<Panel corner class="mt-6 cursor-pointer p-10 text-center">
			<div class="text-[56px] leading-none text-gold">⬆</div>
			<div class="mt-3.5 text-[15px] font-bold">
				{selectedFile ? selectedFile.name : 'TAP TO PICK FILE'}
			</div>
			<div class="mt-1.5 text-[11px] text-text-secondary">
				{#if selectedFile}
					{formatBytes(selectedFile.size)}
				{:else}
					Supports .BIN, .TLOG, .ULG, .CSV · Max 500MB
				{/if}
			</div>
		</Panel>
	</label>

	<input
		id="file-input"
		bind:this={fileInput}
		type="file"
		accept=".bin,.tlog,.ulg,.csv,.kml,.log"
		onchange={handleFileSelect}
		class="hidden"
	/>

	<!-- Drone selector (required) -->
	<div class="mt-4">
		<div class="label-tiny mb-1.5">DRONE · REQUIRED</div>
		<select
			bind:value={selectedDroneId}
			class="input w-full"
			style="font-size: 12px"
		>
			<option value="">— Select Airframe —</option>
			{#each drones as drone}
				<option value={(drone as any)._id}>
					{(drone as any).name} · SN {(drone as any).serialNumber ?? '—'}
				</option>
			{/each}
		</select>
		{#if $dronesQuery.isLoading}
			<div class="mt-1 text-[10px] text-text-dim">Loading drones...</div>
		{/if}
	</div>

	<!-- Mission selector (optional) -->
	<div class="mt-3">
		<div class="label-tiny mb-1.5">MISSION · OPTIONAL</div>
		<select
			bind:value={selectedMissionId}
			class="input w-full"
			style="font-size: 12px"
		>
			<option value="">— No Mission —</option>
			{#each missions as msn}
				<option value={(msn as any)._id}>{(msn as any).name}</option>
			{/each}
		</select>
		{#if $missionsQuery.isLoading}
			<div class="mt-1 text-[10px] text-text-dim">Loading missions...</div>
		{/if}
	</div>

	{#if selectedFile}
		<Button
			onclick={handleUpload}
			variant="primary"
			size="mob"
			disabled={$upload.isPending || !selectedDroneId}
			class="mt-3.5"
		>
			{#if $upload.isPending}
				UPLOADING {progress}%
			{:else}
				▶ UPLOAD NOW
			{/if}
		</Button>

		{#if $upload.isPending}
			<div class="progress mt-2">
				<span style="width: {progress}%"></span>
			</div>
		{/if}
	{/if}

	{#if error}
		<div class="mt-3 rounded-md border border-scarlet-bright/40 bg-scarlet-bright/10 p-3 text-[11px] text-scarlet-bright">
			⚠ {error}
		</div>
	{/if}

	<!-- Steps -->
	<div class="label-tiny mb-3 mt-7">WHAT HAPPENS NEXT</div>
	<Panel class="p-4">
		{#each ['Upload your log file', 'We read it for you', 'Confirm the details', 'Done'] as step, i}
			<div class="mb-3.5 flex items-start gap-3 last:mb-0">
				<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-scarlet text-[12px] font-extrabold text-text-primary">
					{i + 1}
				</div>
				<div>
					<div class="text-[13px] font-semibold">{step}</div>
					<div class="mt-0.5 text-[11px] text-text-dim">
						{#if i === 0}Pick the file from your phone
						{:else if i === 1}Takes about 1 minute
						{:else if i === 2}Drone, battery, mission type
						{:else}Your flight is recorded{/if}
					</div>
				</div>
			</div>
		{/each}
	</Panel>
</div>