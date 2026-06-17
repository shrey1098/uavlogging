<script lang="ts">
	import { page } from '$app/stores';
	import { useFlightLog, useReparseFlightLog } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { formatDateTime, formatDuration, extractError } from '$lib/utils';
	import { onMount, onDestroy } from 'svelte';

	const id = $derived($page.params.id);
	const query = $derived.by(() => useFlightLog(id));
	const reparse = useReparseFlightLog();

	const log = $derived($query.data);
	const pd = $derived((log as any)?.parsedData);
	const summary = $derived(pd?.summary);
	const telemetry = $derived((pd?.telemetry ?? []) as Array<{
		t: number; lat: number; lng: number; alt: number;
		roll: number; pitch: number; yaw: number;
		speed: number; voltage: number; current: number;
	}>);
	const alerts = $derived((pd?.alerts ?? []) as Array<{
		type: string; severity: string; value?: number; threshold?: number; timestamp?: number;
	}>);
	const flightModes = $derived((pd?.flightModes ?? []) as Array<{
		mode: string; startTime: number; endTime: number; duration: number;
	}>);
	const anomalyScore = $derived(pd?.anomalyScore);
	const coords = $derived((pd?.flightPath?.coordinates ?? []) as [number, number, number][]);

	const durationSeconds = $derived(summary?.flightDuration ?? null);
	const maxAlt = $derived(summary?.maxAltitude ?? null);
	const maxSpeed = $derived(summary?.maxSpeed ?? null);
	const totalDistanceKm = $derived(summary?.totalDistance != null ? summary.totalDistance / 1000 : null);

	const stats = $derived([
		{ label: 'DISTANCE', value: totalDistanceKm?.toFixed(1) ?? '—', unit: 'km' },
		{ label: 'HEIGHT', value: maxAlt?.toFixed(0) ?? '—', unit: 'm' },
		{ label: 'SPEED', value: maxSpeed?.toFixed(1) ?? '—', unit: 'm/s' },
		{ label: 'DURATION', value: formatDuration(durationSeconds), unit: '' },
		{ label: 'ALERTS', value: alerts.length, unit: '' },
		{ label: 'ANOMALY', value: anomalyScore?.toFixed(2) ?? '—', unit: '' }
	]);

	const chartData = $derived(() => {
		if (!telemetry.length) return null;
		const W = 360; const H = 80; const pad = { t: 8, r: 8, b: 20, l: 32 };
		const iW = W - pad.l - pad.r;
		const iH = H - pad.t - pad.b;
		const tMax = telemetry.at(-1)!.t;
		function makeLine(key: keyof typeof telemetry[0]) {
			const vals = telemetry.map(d => d[key] as number);
			const min = Math.min(...vals); const max = Math.max(...vals);
			const pts = telemetry.map(d =>
				`${pad.l + (d.t / tMax) * iW},${pad.t + iH - ((d[key] as number - min) / (max - min || 1)) * iH}`
			).join(' ');
			return { pts, min, max, W, H, pad };
		}
		return {
			altitude: makeLine('alt'),
			speed: makeLine('speed'),
			voltage: makeLine('voltage'),
			current: makeLine('current'),
			tLabels: [0, 0.25, 0.5, 0.75, 1].map(f => ({
				x: pad.l + f * iW,
				label: formatDuration(Math.round(f * tMax))
			}))
		};
	});

	const modeColors: Record<string, string> = {
		STABILIZE: '#888', ALT_HOLD: '#4a9', LOITER: '#59b',
		AUTO: '#a7a', RTL: '#ca5', LAND: '#c55'
	};

let mapEl: HTMLDivElement;
let leafletMap: any;

$effect(() => {
	const el = mapEl;
	const c = coords;
	if (!el || !c.length) return;

	let destroyed = false;

	(async () => {
		const L = (await import('leaflet')).default;
		await import('leaflet/dist/leaflet.css');
		if (destroyed) return;

		leafletMap = L.map(el, { zoomControl: true, attributionControl: false });

		L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
			maxZoom: 19
		}).addTo(leafletMap);

		L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
			maxZoom: 19
		}).addTo(leafletMap);

		const latLngs = c.map(p => [p[1], p[0]] as [number, number]);
		const mid = Math.floor(latLngs.length / 2);

		L.polyline(latLngs.slice(0, mid + 1), { color: '#d4a72c', weight: 3, opacity: 1 }).addTo(leafletMap);
		L.polyline(latLngs.slice(mid), { color: '#ff2d3f', weight: 3, opacity: 0.6 }).addTo(leafletMap);

		L.circleMarker(latLngs[0], { radius: 7, color: '#d4a72c', fillColor: '#d4a72c', fillOpacity: 1 })
			.bindTooltip('TAKEOFF', { permanent: true, direction: 'right', className: 'map-label' })
			.addTo(leafletMap);

		L.circleMarker(latLngs.at(-1)!, { radius: 7, color: '#ff2d3f', fillColor: '#ff2d3f', fillOpacity: 1 })
			.bindTooltip('LANDED', { permanent: true, direction: 'left', className: 'map-label' })
			.addTo(leafletMap);

		leafletMap.fitBounds(L.latLngBounds(latLngs), { padding: [30, 30] });
	})();

	return () => {
		destroyed = true;
		leafletMap?.remove();
		leafletMap = undefined;
	};
});
</script>

<div class="page-pad">
	<div class="mb-3 flex items-center justify-between lg:hidden">
		<Button href="/operator/flights" variant="default" size="sm">‹ BACK</Button>
		<span class="label-tiny">FLIGHT DETAIL</span>
		<span class="w-[60px]"></span>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading flight..." />
	{:else if $query.error || !log}
		<ErrorState
			message={extractError($query.error) || 'Flight log not found'}
			onRetry={() => $query.refetch()}
		/>
	{:else}
		<div class="label-tiny">FLIGHT LOG · {formatDateTime(log.createdAt)}</div>
		<div class="mt-1 font-display text-[24px]">{log.originalFilename}</div>
		<div class="mt-1.5 flex flex-wrap gap-1.5">
			<Chip variant={log.parseStatus === 'parsed' ? 'ok' : log.parseStatus === 'failed' ? 'danger' : 'warn'}>
				{log.parseStatus}
			</Chip>
			{#if durationSeconds}<Chip>{formatDuration(durationSeconds)}</Chip>{/if}
			{#if (log as any).logType}<Chip>{(log as any).logType.toUpperCase()}</Chip>{/if}
		</div>

		<!-- Quick stats -->
		<div class="mt-3.5 grid grid-cols-3 gap-2 sm:grid-cols-6">
			{#each stats as s}
				<div class="rounded-lg border border-border bg-bg-panel p-2.5 text-center">
					<div class="label-tiny" style="font-size: 8.5px">{s.label}</div>
					<div class="med-num mt-0.5 truncate" style="font-size: 18px">
						{s.value}{#if s.unit}<span class="text-[10px] text-text-dim">{s.unit}</span>{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Drop Score -->
		{#if log.typeClass === 'drop'}
		<Panel class="mb-3.5 p-3.5">
		<div class="label-tiny mb-2">DROP SCORE</div>
		{#if log.dropScore != null}
			<div class="flex items-baseline gap-2">
				<span class="font-display text-4xl" style="color: {log.dropScore >= 50 ? 'rgb(100 220 120)' : log.dropScore >= 25 ? 'rgb(212 167 44)' : 'rgb(255 45 63)'}">{log.dropScore}</span>
				<span class="text-[11px] text-text-dim">/ 75</span>
			</div>
		{:else}
			<div class="text-[13px] text-text-dim">NOT SCORED</div>
		{/if}
	</Panel>
	{/if}

		<!-- Flight path map -->
		<div class="label-tiny mb-2 mt-5">FLIGHT PATH</div>
		<div class="corner relative overflow-hidden rounded-lg" style="height: 280px">
			<div bind:this={mapEl} class="h-full w-full"></div>
		</div>
		<div class="mt-1.5 flex gap-4 text-[9px]">
			<span style="color: #d4a72c">━ OUTBOUND</span>
			<span style="color: #ff2d3f">━ RETURN</span>
		</div>

		<!-- Flight mode timeline -->
		{#if flightModes.length > 0}
			<div class="label-tiny mb-2 mt-4">FLIGHT MODES</div>
			<div class="flex h-6 w-full overflow-hidden rounded">
				{#each flightModes as fm}
					{@const totalDur = flightModes.at(-1)!.endTime || 1}
					{@const pct = ((fm.endTime - fm.startTime) / totalDur) * 100}
					{#if pct > 0}
						<div
							class="flex items-center justify-center overflow-hidden text-[8px] font-bold text-white"
							style="width: {pct}%; background: {modeColors[fm.mode] ?? '#555'}; min-width: 2px"
							title="{fm.mode} ({formatDuration(fm.duration)})"
						>
							{pct > 8 ? fm.mode : ''}
						</div>
					{/if}
				{/each}
			</div>
			<div class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
				{#each [...new Set(flightModes.map(f => f.mode))] as mode}
					<span class="text-[9px]" style="color: {modeColors[mode] ?? '#888'}">■ {mode}</span>
				{/each}
			</div>
		{/if}

		<!-- Telemetry charts -->
		{#if chartData()}
			{@const cd = chartData()!}
			<div class="label-tiny mb-2 mt-5">TELEMETRY</div>
			<Panel class="p-3">
				<div class="space-y-4">
					<div>
						<div class="mb-1 text-[9px] uppercase tracking-wider text-gold">Altitude (m)</div>
						<svg viewBox="0 0 {cd.altitude.W} {cd.altitude.H}" class="w-full">
							<polyline points={cd.altitude.pts} fill="none" stroke="rgb(212 167 44)" stroke-width="1.5" stroke-linejoin="round"/>
							<text x={cd.altitude.pad.l - 2} y={cd.altitude.pad.t + 4} font-size="7" fill="#666" text-anchor="end">{cd.altitude.max.toFixed(0)}</text>
							<text x={cd.altitude.pad.l - 2} y={cd.altitude.H - cd.altitude.pad.b} font-size="7" fill="#666" text-anchor="end">{cd.altitude.min.toFixed(0)}</text>
							{#each cd.tLabels as tl}
								<text x={tl.x} y={cd.altitude.H - 2} font-size="7" fill="#555" text-anchor="middle">{tl.label}</text>
							{/each}
						</svg>
					</div>
					<div>
						<div class="mb-1 text-[9px] uppercase tracking-wider text-text-secondary">Speed (m/s)</div>
						<svg viewBox="0 0 {cd.speed.W} {cd.speed.H}" class="w-full">
							<polyline points={cd.speed.pts} fill="none" stroke="rgb(100 180 255)" stroke-width="1.5" stroke-linejoin="round"/>
							<text x={cd.speed.pad.l - 2} y={cd.speed.pad.t + 4} font-size="7" fill="#666" text-anchor="end">{cd.speed.max.toFixed(1)}</text>
							<text x={cd.speed.pad.l - 2} y={cd.speed.H - cd.speed.pad.b} font-size="7" fill="#666" text-anchor="end">{cd.speed.min.toFixed(1)}</text>
							{#each cd.tLabels as tl}
								<text x={tl.x} y={cd.speed.H - 2} font-size="7" fill="#555" text-anchor="middle">{tl.label}</text>
							{/each}
						</svg>
					</div>
					<div>
						<div class="mb-1 text-[9px] uppercase tracking-wider text-text-secondary">Battery Voltage (V)</div>
						<svg viewBox="0 0 {cd.voltage.W} {cd.voltage.H}" class="w-full">
							<polyline points={cd.voltage.pts} fill="none" stroke="rgb(100 220 120)" stroke-width="1.5" stroke-linejoin="round"/>
							<text x={cd.voltage.pad.l - 2} y={cd.voltage.pad.t + 4} font-size="7" fill="#666" text-anchor="end">{cd.voltage.max.toFixed(1)}</text>
							<text x={cd.voltage.pad.l - 2} y={cd.voltage.H - cd.voltage.pad.b} font-size="7" fill="#666" text-anchor="end">{cd.voltage.min.toFixed(1)}</text>
							{#each cd.tLabels as tl}
								<text x={tl.x} y={cd.voltage.H - 2} font-size="7" fill="#555" text-anchor="middle">{tl.label}</text>
							{/each}
						</svg>
					</div>
					<div>
						<div class="mb-1 text-[9px] uppercase tracking-wider text-text-secondary">Current Draw (A)</div>
						<svg viewBox="0 0 {cd.current.W} {cd.current.H}" class="w-full">
							<polyline points={cd.current.pts} fill="none" stroke="rgb(255 160 60)" stroke-width="1.5" stroke-linejoin="round"/>
							<text x={cd.current.pad.l - 2} y={cd.current.pad.t + 4} font-size="7" fill="#666" text-anchor="end">{cd.current.max.toFixed(1)}</text>
							<text x={cd.current.pad.l - 2} y={cd.current.H - cd.current.pad.b} font-size="7" fill="#666" text-anchor="end">{cd.current.min.toFixed(1)}</text>
							{#each cd.tLabels as tl}
								<text x={tl.x} y={cd.current.H - 2} font-size="7" fill="#555" text-anchor="middle">{tl.label}</text>
							{/each}
						</svg>
					</div>
				</div>
			</Panel>
		{/if}

		<!-- Alerts -->
		{#if alerts.length > 0}
			<div class="label-tiny mb-2 mt-5">⚠ ISSUES TO REVIEW · {alerts.length}</div>
			<div class="space-y-2">
				{#each alerts as alert}
					<div
						class="rounded-lg border border-border bg-bg-panel p-3.5"
						style="border-left: 3px solid {alert.severity === 'critical' ? 'rgb(255 45 63)' : 'rgb(212 167 44)'}"
					>
						<div class="flex items-start justify-between">
							<div class="text-[13px] font-bold"
								style="color: {alert.severity === 'critical' ? 'rgb(255 45 63)' : 'rgb(212 167 44)'}">
								{alert.type}
							</div>
							{#if alert.timestamp != null}
								<span class="text-[10px] text-text-dim">{formatDuration(alert.timestamp)}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if log.parseStatus === 'failed'}
			<div class="mt-4 flex gap-2">
				<Button onclick={() => $reparse.mutate(id)} variant="default">⟳ RETRY PARSE</Button>
			</div>
			{#if log.parseError}
				<div class="mt-2 rounded-md border border-scarlet-bright/40 bg-scarlet-bright/10 p-2.5 text-[11px] text-scarlet-bright">
    				{typeof log.parseError === 'object' ? (log.parseError as any)?.message ?? JSON.stringify(log.parseError) : log.parseError}
				</div>
			{/if}
		{/if}
	{/if}
</div>