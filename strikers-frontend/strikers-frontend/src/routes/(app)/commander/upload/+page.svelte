<script lang="ts">
	import { goto } from '$app/navigation';
	import { useUploadFlightLog, useDrones, useMissions, useUnitReadiness } from '$lib/api/queries';
	import { Panel, Button, Chip } from '$lib/components/ui';
	import { extractError, formatBytes } from '$lib/utils';

	const upload = useUploadFlightLog();
	const dronesQuery = useDrones();
	const missionsQuery = useMissions();
	const readinessQuery = useUnitReadiness();

	let fileInput: HTMLInputElement;
	let progress = $state(0);
	let selectedFile = $state<File | null>(null);
	let selectedDroneId = $state('');
	let selectedMissionId = $state('');
	let selectedOperatorUserId = $state('');
	let timeClass = $state<'day' | 'night'>('day');
	let typeClass = $state('surveillance');
	let isRealOps = $state(false);
	let error = $state<string | null>(null);
	let successMsg = $state<string | null>(null);

	const typeOptions = [
		{ value: 'surveillance', label: 'Surveillance' },
		{ value: 'drop', label: 'Drop' },
		{ value: 'obstacle', label: 'Obstacle Training' },
		{ value: 'navigation', label: 'Navigation / Waypoint' },
		{ value: 'fpv', label: 'FPV' },
		{ value: 'maintenance_test', label: 'Maintenance Test Flight' }
	];

	const drones = $derived($dronesQuery.data ?? []);
	const missions = $derived($missionsQuery.data ?? []);
	const operators = $derived(($readinessQuery.data ?? []) as any[]);

	const selectedOperatorName = $derived(
		operators.find(r => r.user?._id === selectedOperatorUserId)?.user?.name ?? null
	);

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) { selectedFile = file; error = null; successMsg = null; }
	}

	async function handleUpload() {
		if (!selectedFile) return;
		if (!selectedDroneId) { error = 'Please select a drone.'; return; }
		error = null; successMsg = null; progress = 0;

		try {
			const result = await $upload.mutateAsync({
				file: selectedFile,
				droneId: selectedDroneId,
				missionId: selectedMissionId || undefined,
				timeClass,
				typeClass,
				isRealOps,
				assignToOperatorUserId: selectedOperatorUserId || undefined,
				onProgress: (p) => (progress = p)
			});

			const logId = result.flightLog._id;
			const opName = selectedOperatorName;
			successMsg = opName
				? `Log uploaded and attributed to ${opName}. Their readiness will update shortly.`
				: 'Log uploaded successfully.';

			// Reset form
			selectedFile = null;
			selectedDroneId = '';
			selectedMissionId = '';
			selectedOperatorUserId = '';
			timeClass = 'day';
			typeClass = 'surveillance';
			isRealOps = false;

		} catch (err) {
			const raw = err as any;
			const code = raw?.response?.data?.error?.code;
			if (code === 'invalid_assignee') {
				error = 'Selected operator does not exist.';
			} else if (code === 'invalid_assignee_role') {
				error = 'Selected user is not an operator.';
			} else {
				error = extractError(err);
			}
		}
	}
</script>

<div class="page-pad">
	<div class="mb-4">
		<div class="label-tiny">COMMANDER · DATA INGESTION</div>
		<h1 class="h1 mt-1">UPLOAD A LOG</h1>
		<div class="mt-1 text-[12px] text-text-secondary">
			Upload on behalf of any operator. Log will be attributed to the selected operator.
		</div>
	</div>

	<!-- File picker -->
	<label for="file-input">
		<Panel corner class="cursor-pointer p-8 text-center hover:border-gold/40 transition-colors">
			<div class="text-[48px] leading-none text-gold">⬆</div>
			<div class="mt-3 text-[14px] font-bold">
				{selectedFile ? selectedFile.name : 'CLICK TO PICK FILE'}
			</div>
			<div class="mt-1 text-[11px] text-text-secondary">
				{#if selectedFile}
					{formatBytes(selectedFile.size)}
				{:else}
					.BIN · .TLOG · .ULG · .CSV · Max 500MB
				{/if}
			</div>
		</Panel>
	</label>
	<input id="file-input" bind:this={fileInput} type="file"
		accept=".bin,.tlog,.ulg,.csv,.kml,.log" onchange={handleFileSelect} class="hidden" />

	<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
		<!-- Operator selector -->
		<div>
			<div class="label-tiny mb-1.5">OPERATOR · ATTRIBUTION</div>
			<select bind:value={selectedOperatorUserId} class="input w-full" style="font-size: 12px">
				<option value="">— Self (Commander) —</option>
				{#each operators as r}
					<option value={r.user?._id}>{r.user?.name ?? '—'}</option>
				{/each}
			</select>
			{#if selectedOperatorName}
				<div class="mt-1 text-[10px] text-gold">Attributed to: {selectedOperatorName}</div>
			{/if}
		</div>

		<!-- Drone selector -->
		<div>
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

		<!-- Time class -->
		<div>
			<div class="label-tiny mb-1.5">TIME OF FLIGHT · REQUIRED</div>
			<div class="grid grid-cols-2 gap-2">
				{#each ['day', 'night'] as t}
					<button
						type="button"
						onclick={() => (timeClass = t as 'day' | 'night')}
						class="rounded border py-2 text-[11px] font-bold uppercase tracking-wider transition-colors"
						style="border-color: {timeClass === t ? 'rgb(212 167 44)' : 'rgba(255,255,255,0.1)'}; color: {timeClass === t ? 'rgb(212 167 44)' : 'rgba(255,255,255,0.4)'}; background: {timeClass === t ? 'rgba(212,167,44,0.1)' : 'transparent'}"
					>
						{t === 'day' ? '☀ DAY' : '☽ NIGHT'}
					</button>
				{/each}
			</div>
		</div>

		<!-- Type class -->
		<div>
			<div class="label-tiny mb-1.5">SORTIE TYPE · REQUIRED</div>
			<select bind:value={typeClass} class="input w-full" style="font-size: 12px">
				{#each typeOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		<!-- Mission -->
		<div>
			<div class="label-tiny mb-1.5">MISSION · OPTIONAL</div>
			<select bind:value={selectedMissionId} class="input w-full" style="font-size: 12px">
				<option value="">— No Mission —</option>
				{#each missions as msn}
					<option value={(msn as any)._id}>{(msn as any).name}</option>
				{/each}
			</select>
		</div>

		<!-- Real Ops -->
		<div>
			<div class="label-tiny mb-1.5">REAL OPS FLAG</div>
			<div
				class="flex cursor-pointer items-center gap-2.5 rounded border p-2.5 transition-colors"
				style="border-color: {isRealOps ? 'rgba(255,45,63,0.4)' : 'rgba(255,255,255,0.1)'}; background: {isRealOps ? 'rgba(255,45,63,0.08)' : 'transparent'}"
				onclick={() => (isRealOps = !isRealOps)}
			>
				<div
					class="flex h-4 w-4 items-center justify-center rounded border text-[10px]"
					style="border-color: {isRealOps ? 'rgb(255 45 63)' : 'rgba(255,255,255,0.3)'}; background: {isRealOps ? 'rgb(255 45 63)' : 'transparent'}"
				>
					{isRealOps ? '✓' : ''}
				</div>
				<span class="text-[12px]" style="color: {isRealOps ? 'rgb(255 45 63)' : 'rgba(255,255,255,0.5)'}">
					🎖 Mark as Real Operation
				</span>
			</div>
			{#if isRealOps}
				<div class="mt-1 text-[10px] text-scarlet-bright">
					This flight will count toward the operator's Real Ops badge.
				</div>
			{/if}
		</div>
	</div>

	{#if selectedFile}
		<Button
			onclick={handleUpload}
			variant="primary"
			size="mob"
			disabled={$upload.isPending || !selectedDroneId}
			class="mt-4"
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

	{#if successMsg}
		<div class="mt-3 rounded-md border border-green-500/40 bg-green-500/10 p-3 text-[11px] text-green-400">
			✓ {successMsg}
		</div>
	{/if}
</div>