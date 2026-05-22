<script lang="ts">
	import { page } from '$app/stores';
	import { useDrone } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';
	import { dronesApi } from '$lib/api/drones';
	import { isCommander } from '$lib/stores';
	import { onMount } from 'svelte';

	const id = $derived($page.params.id);
	const DEMO_ID = 'demo-drone';
	const isMock = $derived(id === DEMO_ID);

	// ── Mock data ─────────────────────────────────────────────────────────
	const mockDrone = {
		name: 'RPAV Trinetra',
		model: 'Q5HA Mk-II',
		serialNumber: '024',
		frameType: 'hexacopter',
		flightController: 'Orange Cube+',
		propSize: '18 inch',
		maxTakeoffWeight: 8500,
		payloadCapacity: 2.5,
		range: 12,
		nightCapability: 'Full NVG Compatible',
		ewCompliance: 'AES-256 Encrypted',
		registrationNumber: 'DGCA-UA-2024-0088',
		remarks: 'Primary ISR platform. Deployed Pokhran sector. Cleared for night ops.',
		tags: ['ISR', 'Night Ops'],
		isActive: true,
		totalFlights: 147,
		totalFlightTime: 198000
	};

	const mockSortieBreakdown = [
		{ label: 'ISR / Surveillance', count: 89, color: 'rgb(147 210 255)' },
		{ label: 'Navigation', count: 31, color: 'rgb(212 167 44)' },
		{ label: 'Night Ops', count: 18, color: 'rgb(100 80 200)' },
		{ label: 'Other', count: 9, color: 'rgb(80 80 80)' }
	];

	const mockCondition = [
		{ label: 'Frame', pct: 92 },
		{ label: 'Motors', pct: 88 },
		{ label: 'Electronics', pct: 95 },
		{ label: 'Props', pct: 70 }
	];

	// ── Live API ──────────────────────────────────────────────────────────
	const _liveQuery = useDrone(isMock ? 'skip' : id);
	const drone = $derived(isMock ? mockDrone : ($_liveQuery?.data as any));
	const isLoading = $derived(!isMock && ($_liveQuery?.isLoading ?? false));
const hasError = $derived(!isMock && (!!$_liveQuery?.error || (!drone && !$_liveQuery?.isLoading)));

	// ── Edit state ────────────────────────────────────────────────────────
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
		saving = true; saveError = null;
		try {
			await dronesApi.update(id, {
				name: editName, remarks: editRemarks || null,
				nightCapability: editNightCapability,
				ewCompliance: editEwCompliance,
				range: editRange, isActive: editIsActive
			} as any);
			await $_liveQuery?.refetch();
			editing = false;
		} catch (err) {
			saveError = extractError(err);
		} finally {
			saving = false;
		}
	}

	// ── Lookups ───────────────────────────────────────────────────────────
	const frameLabel: Record<string, string> = {
		quadcopter: 'Quadcopter', hexacopter: 'Hexacopter', octocopter: 'Octocopter',
		fixed_wing: 'Fixed Wing', vtol: 'VTOL', tricopter: 'Tricopter',
		fpv_quadcopter: 'FPV Quad', trg: 'Training', other: 'Other'
	};

	const frameIcon: Record<string, string> = {
		quadcopter: '✦', hexacopter: '✦', octocopter: '✦',
		fixed_wing: '▶', vtol: '◈', tricopter: '△',
		fpv_quadcopter: '◉', trg: '◌', other: '◆'
	};

	const flightHours = $derived(
		drone?.totalFlightTime != null ? (drone.totalFlightTime / 3600).toFixed(1) : '—'
	);

	// ── Animation ─────────────────────────────────────────────────────────
	let sorties = $state(0);
	let hours = $state(0);
	let animated = $state(false);

	onMount(() => {
		setTimeout(() => { animated = true; }, 100);
		const targetSorties = drone?.totalFlights ?? 0;
		const targetHours = parseFloat(flightHours as string) || 0;
		const duration = 1200;
		const start = performance.now();
		function tick(now: number) {
			const t = Math.min((now - start) / duration, 1);
			const ease = 1 - Math.pow(1 - t, 3);
			sorties = Math.round(ease * targetSorties);
			hours = parseFloat((ease * targetHours).toFixed(1));
			if (t < 1) requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);
	});
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-center justify-between">
		<div class="flex items-center gap-2.5">
			<Button href="/commander/drones">← FLEET</Button>
			<span class="label-tiny">AIRFRAME FILE{isMock ? ' · DEMO' : ''}</span>
		</div>
		{#if $isCommander && drone && !editing && !isMock}
			<Button onclick={startEdit} variant="default" size="sm">✎ EDIT</Button>
		{/if}
	</div>

	{#if isLoading}
		<Loading label="Loading drone..." />
	{:else if hasError}
		<ErrorState message={extractError($_liveQuery?.error) || 'Drone not found'} onRetry={() => $_liveQuery?.refetch()} />
	{:else if drone}

		<!-- ── Hero panel ─────────────────────────────────────────────────── -->
		<Panel corner class="mb-3.5 overflow-hidden p-0">
			<div
				class="h-[3px] w-full"
				style="background: linear-gradient(90deg, transparent, {drone.isActive !== false ? 'rgb(100 220 120)' : 'rgb(255 45 63)'}, rgb(212 167 44), transparent)"
			></div>
			<div class="p-4">
				<div class="flex flex-wrap items-start gap-4">
					<!-- Frame icon -->
					<div
						class="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-lg text-[40px]"
						style="background: rgba(212,167,44,0.08); border: 1px solid rgba(212,167,44,0.2)"
					>
						<div class="absolute inset-0 rounded-lg opacity-20" style="background: radial-gradient(circle at 50% 30%, rgb(212 167 44), transparent 70%)"></div>
						<span class="relative" style="color: rgba(212,167,44,0.9)">{frameIcon[drone.frameType] ?? '◆'}</span>
					</div>

					<div class="min-w-[180px] flex-1">
						{#if editing}
							<input bind:value={editName} class="input mb-1 w-full font-display text-[18px]" />
						{:else}
							<div class="font-display text-[24px]">{drone.name}</div>
						{/if}
						<div class="mt-0.5 text-[12px] text-text-secondary">
							{frameLabel[drone.frameType] ?? drone.frameType ?? '—'} · {drone.model ?? '—'} · SN {drone.serialNumber ?? '—'}
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

					<!-- Counters -->
					<div class="flex gap-5 text-right">
						<div>
							<div class="label-tiny">SORTIES</div>
							<div
								class="font-display text-4xl"
								style="color: rgb(212 167 44); text-shadow: 0 0 24px rgba(212,167,44,0.35)"
							>{sorties}</div>
						</div>
						<div>
							<div class="label-tiny">HOURS</div>
							<div class="font-display text-4xl">{hours}h</div>
						</div>
					</div>
				</div>
			</div>
		</Panel>

		<!-- ── Quick stats ────────────────────────────────────────────────── -->
		<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
			<Panel class="p-3">
				<div class="stat-label">PROP SIZE</div>
				<div class="stat-num mt-1 text-xl">{drone.propSize ?? '—'}</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">RANGE</div>
				{#if editing}
					<input bind:value={editRange} type="number" class="input mt-1 w-full text-[13px]" placeholder="km" />
				{:else}
					<div class="stat-num mt-1 text-xl">{drone.range != null ? `${drone.range} km` : '—'}</div>
				{/if}
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">PAYLOAD</div>
				<div class="stat-num mt-1 text-xl">{drone.payloadCapacity != null ? `${drone.payloadCapacity} kg` : '—'}</div>
			</Panel>
			<Panel class="p-3">
				<div class="stat-label">MTOW</div>
				<div class="stat-num mt-1 text-xl">{drone.maxTakeoffWeight != null ? `${drone.maxTakeoffWeight}g` : '—'}</div>
			</Panel>
		</div>

		<!-- ── Sortie breakdown + Condition ──────────────────────────────── -->
		{#if isMock}
			<div class="mb-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
				<!-- Sortie breakdown -->
				<Panel class="p-3.5">
					<div class="label-tiny mb-3">SORTIE BREAKDOWN</div>
					<div class="space-y-2.5">
						{#each mockSortieBreakdown as s}
							<div class="flex items-center gap-2 text-[11px]">
								<span class="w-28 shrink-0 text-text-dim">{s.label}</span>
								<div class="flex-1 overflow-hidden rounded-full bg-white/10" style="height: 5px">
									<div
										class="h-full rounded-full"
										style="width: {animated ? (s.count / 147) * 100 : 0}%; background: {s.color}; transition: width 1s cubic-bezier(0.16,1,0.3,1)"
									></div>
								</div>
								<span class="w-6 text-right font-semibold" style="color: {s.color}">{s.count}</span>
							</div>
						{/each}
					</div>
				</Panel>

				<!-- Airframe condition -->
				<Panel class="p-3.5">
					<div class="label-tiny mb-3">AIRFRAME CONDITION</div>
					<div class="flex items-start gap-3">
						<div class="text-center">
							<div
								class="font-display text-5xl"
								style="color: rgb(100 220 120); text-shadow: 0 0 20px rgba(100,220,120,0.3)"
							>A</div>
							<div class="text-[9px] text-text-dim">GRADE</div>
						</div>
						<div class="flex-1 space-y-2">
							{#each mockCondition as c}
								<div class="flex items-center gap-2 text-[10px]">
									<span class="w-16 shrink-0 text-text-dim">{c.label}</span>
									<div class="flex-1 overflow-hidden rounded-full bg-white/10" style="height: 4px">
										<div
											class="h-full rounded-full"
											style="width: {animated ? c.pct : 0}%; background: {c.pct >= 85 ? 'rgb(100 220 120)' : c.pct >= 65 ? 'rgb(212 167 44)' : 'rgb(255 45 63)'}; transition: width 0.9s cubic-bezier(0.16,1,0.3,1)"
										></div>
									</div>
									<span class="text-text-dim">{c.pct}%</span>
								</div>
							{/each}
						</div>
					</div>
					<div class="mt-2 text-[9px] text-text-dim">Last inspection: 12 May 2026</div>
				</Panel>
			</div>
		{/if}

		<!-- ── Capabilities ───────────────────────────────────────────────── -->
		<div class="mb-3.5 grid grid-cols-2 gap-2.5">
			<div
				class="relative overflow-hidden rounded-lg border p-3.5"
				style="border-color: {drone.nightCapability !== 'Nil' ? 'rgba(147,210,255,0.3)' : 'rgba(255,255,255,0.06)'}; background: {drone.nightCapability !== 'Nil' ? 'rgba(147,210,255,0.05)' : 'transparent'}"
			>
				{#if drone.nightCapability !== 'Nil'}
					<div class="absolute inset-x-0 top-0 h-[2px]" style="background: linear-gradient(90deg, transparent, rgb(147 210 255), transparent)"></div>
				{/if}
				<div class="flex items-start gap-2.5">
					<span class="text-[22px]">{drone.nightCapability !== 'Nil' ? '🌙' : '🌑'}</span>
					<div>
						<div class="label-tiny">NIGHT OPS</div>
						{#if editing}
							<input bind:value={editNightCapability} class="input mt-1 w-full text-[11px]" placeholder="Nil" />
						{:else}
							<div class="mt-0.5 text-[12px]" style="color: {drone.nightCapability !== 'Nil' ? 'rgb(147 210 255)' : 'rgb(80 80 80)'}">
								{drone.nightCapability ?? 'Nil'}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<div
				class="relative overflow-hidden rounded-lg border p-3.5"
				style="border-color: {drone.ewCompliance !== 'Nil' ? 'rgba(212,167,44,0.3)' : 'rgba(255,255,255,0.06)'}; background: {drone.ewCompliance !== 'Nil' ? 'rgba(212,167,44,0.05)' : 'transparent'}"
			>
				{#if drone.ewCompliance !== 'Nil'}
					<div class="absolute inset-x-0 top-0 h-[2px]" style="background: linear-gradient(90deg, transparent, rgb(212 167 44), transparent)"></div>
				{/if}
				<div class="flex items-start gap-2.5">
					<span class="text-[22px]">{drone.ewCompliance !== 'Nil' ? '🔒' : '🔓'}</span>
					<div>
						<div class="label-tiny">EW COMPLIANCE</div>
						{#if editing}
							<input bind:value={editEwCompliance} class="input mt-1 w-full text-[11px]" placeholder="Nil" />
						{:else}
							<div class="mt-0.5 text-[12px]" style="color: {drone.ewCompliance !== 'Nil' ? 'rgb(212 167 44)' : 'rgb(80 80 80)'}">
								{drone.ewCompliance ?? 'Nil'}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- ── Specs + Remarks ────────────────────────────────────────────── -->
		<div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">SPECIFICATIONS</div>
				<div class="space-y-2 text-[13px]">
					{#each [
						['FLIGHT CONTROLLER', drone.flightController ?? '—'],
						['REGISTRATION', drone.registrationNumber ?? '—']
					] as [label, val]}
						<div class="flex items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
							<span class="text-text-dim">{label}</span>
							<span class="text-right font-mono text-[12px]">{val}</span>
						</div>
					{/each}
				</div>
			</Panel>

			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">REMARKS</div>
				{#if editing}
					<textarea bind:value={editRemarks} class="input w-full text-[12px]" rows="3" placeholder="Freetext remarks..."></textarea>
				{:else}
					<div class="text-[12px] leading-relaxed text-text-secondary">{drone.remarks || '—'}</div>
				{/if}
			</Panel>
		</div>

		<!-- ── Edit actions ───────────────────────────────────────────────── -->
		{#if editing}
			{#if saveError}
				<div class="mt-3 rounded border border-scarlet-bright/40 bg-scarlet-bright/10 p-2.5 text-[11px] text-scarlet-bright">⚠ {saveError}</div>
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