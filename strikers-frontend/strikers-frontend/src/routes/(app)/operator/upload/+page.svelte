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
	let selectedDroneId = $state('');
	let selectedMissionId = $state('');
	let timeClass = $state<'day' | 'night'>('day');
	let typeClass = $state('surveillance');
	let error = $state<string | null>(null);
	let dropScore = $state<number | null>(null);
	const DROP_VALUES = [0, 10, 25, 50, 75];

	const typeOptions = [
		{ value: 'surveillance', label: 'Surveillance' },
		{ value: 'drop', label: 'Drop' },
		{ value: 'obstacle', label: 'Obstacle Training' },
		{ value: 'navigation', label: 'Navigation / Waypoint' },
		{ value: 'fpv', label: 'FPV' },
		{ value: 'maintenance_test', label: 'Maintenance Test Flight' }
	];

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) { selectedFile = file; error = null; }
	}

	async function handleUpload() {
		if (!selectedFile) return;
		if (!selectedDroneId) { error = 'Please select a drone before uploading.'; return; }
		error = null; progress = 0;
		try {
			const result = await $upload.mutateAsync({
				file: selectedFile,
				droneId: selectedDroneId,
				missionId: selectedMissionId || undefined,
				timeClass,
				typeClass,
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
	<input id="file-input" bind:this={fileInput} type="file"
		accept=".bin,.tlog,.ulg,.csv,.kml,.log" onchange={handleFileSelect} class="hidden" />

	<!-- Drone selector (required) -->
	<div class="mt-4">
		<div class="label-tiny mb-1.5">DRONE · REQUIRED</div>
		<select bind:value={selectedDroneId} class="input w-full" style="font-size: 12px">
			<option value="">— Select Airframe —</option>
			{#each drones as drone}
				<option value={(drone as any)._id}>
					{(drone as any).name} · SN {(drone as any).serialNumber ?? '—'}
				</option>
			{/each}
		</select>
	</div>

	<!-- Time class (required) -->
	<div class="mt-3">
		<div class="label-tiny mb-1.5">TIME OF FLIGHT · REQUIRED</div>
		<div class="grid grid-cols-2 gap-2">
			{#each ['day', 'night'] as t}
				<button
					type="button"
					onclick={() => (timeClass = t as 'day' | 'night')}
					class="rounded border py-2 text-[11px] font-bold uppercase tracking-wider transition-colors"
					style="border-color: {timeClass === t ? 'rgb(212 167 44)' : 'rgba(255,255,255,0.1)'};
						   color: {timeClass === t ? 'rgb(212 167 44)' : 'rgba(255,255,255,0.4)'};
						   background: {timeClass === t ? 'rgba(212,167,44,0.1)' : 'transparent'}"
				>
					{t === 'day' ? '☀ DAY' : '☽ NIGHT'}
				</button>
			{/each}
		</div>
	</div>

	<!-- Type class (required) -->
	<div class="mt-3">
		<div class="label-tiny mb-1.5">SORTIE TYPE · REQUIRED</div>
		<select bind:value={typeClass} class="input w-full" style="font-size: 12px">
			{#each typeOptions as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
		{#if typeClass === 'maintenance_test'}
			<div class="mt-1 text-[10px] text-gold">
				⚠ Maintenance Test Flights are not counted toward readiness or badges.
			</div>
		{/if}
	</div>
	{#if typeClass === 'drop'}
	<div class="mt-3">
		<div class="label-tiny mb-1.5">DROP SCORE · OPTIONAL</div>
		<div class="grid grid-cols-6 gap-1.5">
			{#each DROP_VALUES as v}
				<button
					type="button"
					onclick={() => (dropScore = v)}
					class="rounded border py-2 text-[12px] font-bold transition-colors"
					style="border-color: {dropScore === v ? 'rgb(212 167 44)' : 'rgba(255,255,255,0.1)'}; color: {dropScore === v ? 'rgb(212 167 44)' : 'rgba(255,255,255,0.4)'}; background: {dropScore === v ? 'rgba(212,167,44,0.1)' : 'transparent'}"
				>{v}</button>
			{/each}
			<button
				type="button"
				onclick={() => (dropScore = null)}
				class="rounded border py-2 text-[12px] font-bold transition-colors"
				style="border-color: {dropScore === null ? 'rgb(110 92 88)' : 'rgba(255,255,255,0.1)'}; color: {dropScore === null ? 'rgb(168 150 144)' : 'rgba(255,255,255,0.4)'}; background: {dropScore === null ? 'rgba(255,255,255,0.05)' : 'transparent'}"
			>—</button>
		</div>
		<div class="mt-1 text-[10px] text-text-dim">Score the drop accuracy, or leave unscored.</div>
	</div>
	{/if}

	<!-- Mission selector (optional, commander only for create — operators just pick existing) -->
	<div class="mt-3">
		<div class="label-tiny mb-1.5">MISSION · OPTIONAL</div>
		<select bind:value={selectedMissionId} class="input w-full" style="font-size: 12px">
			<option value="">— No Mission —</option>
			{#each missions as msn}
				<option value={(msn as any)._id}>{(msn as any).name}</option>
			{/each}
		</select>
	</div>

	{#if selectedFile}
		<Button
			onclick={handleUpload}
			variant="primary"
			size="mob"
			disabled={$upload.isPending || !selectedDroneId}
			class="mt-3.5"
		>
			{$upload.isPending ? `UPLOADING ${progress}%` : '▶ UPLOAD NOW'}
		</Button>
		{#if $upload.isPending}
			<div class="progress mt-2"><span style="width: {progress}%"></span></div>
		{/if}
	{/if}

	{#if error}
		<div class="mt-3 rounded-md border border-scarlet-bright/40 bg-scarlet-bright/10 p-3 text-[11px] text-scarlet-bright">
			⚠ {error}
		</div>
	{/if}

	<div class="label-tiny mb-3 mt-7">WHAT HAPPENS NEXT</div>
	<Panel class="p-4">
		{#each ['Upload your log file', 'We read it for you', 'Parser extracts telemetry', 'Readiness updated'] as step, i}
			<div class="mb-3.5 flex items-start gap-3 last:mb-0">
				<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-scarlet text-[12px] font-extrabold text-text-primary">
					{i + 1}
				</div>
				<div>
					<div class="text-[13px] font-semibold">{step}</div>
					<div class="mt-0.5 text-[11px] text-text-dim">
						{#if i === 0}Pick the file from your phone
						{:else if i === 1}Takes about 1 minute
						{:else if i === 2}Flight path, telemetry, alerts extracted
						{:else}Your score and badges reflect this flight{/if}
					</div>
				</div>
			</div>
		{/each}
	</Panel>
</div>