<script lang="ts">
	import { page } from '$app/stores';
	import { useFlightLog } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError, formatDateTime, formatDuration } from '$lib/utils';
	import type { Mission, Drone } from '$lib/types';
	import { onMount, onDestroy } from 'svelte';

	const id = $derived($page.params.id);
	const query = $derived.by(() => useFlightLog(id));
	const log = $derived($query.data);

	const pd = $derived((log as any)?.parsedData);
	const summary = $derived(pd?.summary);
	const anomalyScore = $derived(pd?.anomalyScore);
	const alerts = $derived((pd?.alerts ?? []) as Array<{ type: string; severity: string }>);
	const telemetry = $derived((pd?.telemetry ?? []) as Array<{
		t: number; alt: number; speed: number; voltage: number; current: number;
	}>);
	const flightModes = $derived((pd?.flightModes ?? []) as Array<{
		mode: string; startTime: number; endTime: number; duration: number;
	}>);
	const coords = $derived((pd?.flightPath?.coordinates ?? []) as [number, number, number][]);

	const durationSeconds = $derived(summary?.flightDuration ?? null);
	const maxAlt = $derived(summary?.maxAltitude ?? null);
	const maxSpeed = $derived(summary?.maxSpeed ?? null);
	const totalDistanceKm = $derived(summary?.totalDistance != null ? summary.totalDistance / 1000 : null);

	const missionName = $derived(
		log?.mission && typeof log.mission === 'object' ? (log.mission as Mission).name : '—'
	);
	const droneName = $derived(
		log?.drone && typeof log.drone === 'object' ? (log.drone as Drone).name : '—'
	);

	function parseVariant(s?: string): any {
		if (s === 'parsed') return 'ok';
		if (s === 'failed') return 'danger';
		return 'warn';
	}

	const chartData = $derived(() => {
		if (!telemetry.length) return null;
		const W = 500; const H = 70; const pad = { t: 6, r: 8, b: 18, l: 30 };
		const iW = W - pad.l - pad.r; const iH = H - pad.t - pad.b;
		const tMax = telemetry.at(-1)!.t;
		function makeLine(key: keyof typeof telemetry[0]) {
			const vals = telemetry.map(d => d[key] as number);
			const min = Math.min(...vals); const max = Math.max(...vals);
			const pts = telemetry.map(d =>
				`${pad.l + (d.t / tMax) * iW},${pad.t + iH - ((d[key] as number - min) / (max - min || 1)) * iH}`
			).join(' ');
			return { pts, min, max, W, H, pad };
		}
		const tLabels = [0, 0.25, 0.5, 0.75, 1].map(f => ({
			x: pad.l + f * iW, label: formatDuration(Math.round(f * tMax))
		}));
		return { altitude: makeLine('alt'), speed: makeLine('speed'), voltage: makeLine('voltage'), current: makeLine('current'), tLabels };
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
	<div class="mb-3.5 flex items-center gap-2.5">
		<Button href="/commander/logs">← LOG FEED</Button>
		<span class="label-tiny">FLIGHT LOG</span>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading log..." />
	{:else if $query.error || !log}
		<ErrorState message={extractError($query.error) || 'Log not found'} onRetry={() => $query.refetch()} />
	{:else}
		<Panel corner class="mb-3.5 p-4">
			<div class="flex flex-wrap items-start gap-3.5">
				<div class="min-w-[200px] flex-1">
					<div class="label-tiny">LOG ID · {log._id.slice(-8).toUpperCase()}</div>
					<div class="font-display text-[18px]">{log.originalFilename}</div>
					<div class="mt-0.5 text-[12px] text-text-dim">Uploaded {formatDateTime(log.createdAt)}</div>
					<div class="mt-2 flex flex-wrap gap-1.5">
						<Chip variant={parseVariant(log.parseStatus)}>{log.parseStatus.toUpperCase()}</Chip>
						{#if (log as any).logType}<Chip>{(log as any).logType.toUpperCase()}</Chip>{/if}
					</div>
				</div>
				<div class="text-right">
					<div class="label-tiny">ANOMALY</div>
					<div class="font-display text-4xl"
						style="color: {(anomalyScore ?? 0) > 0.6 ? 'rgb(255 45 63)' : (anomalyScore ?? 0) > 0.3 ? 'rgb(212 167 44)' : 'rgb(245 235 226)'}">
						{anomalyScore?.toFixed(2) ?? '—'}
					</div>
				</div>
			</div>
		</Panel>

		<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
			<Panel class="p-3"><div class="stat-label">DURATION</div><div class="stat-num mt-1 text-xl">{formatDuration(durationSeconds)}</div></Panel>
			<Panel class="p-3"><div class="stat-label">MAX ALT</div><div class="stat-num mt-1 text-xl">{maxAlt?.toFixed(0) ?? '—'}m</div></Panel>
			<Panel class="p-3"><div class="stat-label">MAX SPEED</div><div class="stat-num mt-1 text-xl">{maxSpeed?.toFixed(1) ?? '—'} m/s</div></Panel>
			<Panel class="p-3"><div class="stat-label">DISTANCE</div><div class="stat-num mt-1 text-xl">{totalDistanceKm?.toFixed(2) ?? '—'} km</div></Panel>
		</div>

		<div class="mb-3.5 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
			<!-- Flight path -->
			<Panel class="p-3.5">
				<div class="label-tiny mb-2">FLIGHT PATH</div>
				<div class="relative overflow-hidden rounded" style="height: 300px">
					<div bind:this={mapEl} class="h-full w-full"></div>
				</div>
				<div class="mt-1.5 flex gap-4 text-[9px]">
					<span style="color: #d4a72c">━ OUTBOUND</span>
					<span style="color: #ff2d3f">━ RETURN</span>
				</div>
			</Panel>

			<!-- Assignment + alerts -->
			<div class="space-y-3.5">
				<Panel class="p-3.5">
					<div class="label-tiny mb-2.5">ASSIGNMENT</div>
					<div class="grid grid-cols-1 gap-1.5 text-[13px]">
						<div class="flex justify-between"><span class="text-text-dim">MISSION</span><span class="text-gold">{missionName}</span></div>
						<div class="flex justify-between"><span class="text-text-dim">DRONE</span><span>{droneName}</span></div>
						<div class="flex justify-between"><span class="text-text-dim">AVG VOLTAGE</span><span>{summary?.avgVoltage?.toFixed(1) ?? '—'} V</span></div>
						<div class="flex justify-between"><span class="text-text-dim">AVG CURRENT</span><span>{summary?.avgCurrent?.toFixed(1) ?? '—'} A</span></div>
					</div>
				</Panel>
				<Panel class="p-3.5">
					<div class="label-tiny mb-2.5">ALERTS · {alerts.length}</div>
					{#if alerts.length === 0}
						<div class="text-[12px] text-text-dim">No alerts.</div>
					{:else}
						<div class="space-y-1.5 text-[12px]">
							{#each alerts.slice(0, 6) as a}
								<div class="flex items-start justify-between gap-2">
									<span>{a.type}</span>
									<Chip variant={a.severity === 'critical' ? 'danger' : 'warn'}>{a.severity}</Chip>
								</div>
							{/each}
						</div>
					{/if}
				</Panel>
			</div>
		</div>

		<!-- Flight modes -->
		{#if flightModes.length > 0}
			<Panel class="mb-3.5 p-3.5">
				<div class="label-tiny mb-2">FLIGHT MODES</div>
				<div class="flex h-5 w-full overflow-hidden rounded">
					{#each flightModes as fm}
						{@const totalDur = flightModes.at(-1)!.endTime || 1}
						{@const pct = ((fm.endTime - fm.startTime) / totalDur) * 100}
						{#if pct > 0}
							<div class="flex items-center justify-center overflow-hidden text-[7px] font-bold text-white"
								style="width: {pct}%; background: {modeColors[fm.mode] ?? '#555'}; min-width: 2px"
								title="{fm.mode}">
								{pct > 6 ? fm.mode : ''}
							</div>
						{/if}
					{/each}
				</div>
				<div class="mt-1.5 flex flex-wrap gap-x-3">
					{#each [...new Set(flightModes.map(f => f.mode))] as mode}
						<span class="text-[9px]" style="color: {modeColors[mode] ?? '#888'}">■ {mode}</span>
					{/each}
				</div>
			</Panel>
		{/if}

		<!-- Telemetry charts -->
		{#if chartData()}
			{@const cd = chartData()!}
			<Panel class="p-3.5">
				<div class="label-tiny mb-3">TELEMETRY</div>
				<div class="space-y-4">
					{#each [
						{ data: cd.altitude, label: 'Altitude (m)', color: 'rgb(212 167 44)' },
						{ data: cd.speed, label: 'Speed (m/s)', color: 'rgb(100 180 255)' },
						{ data: cd.voltage, label: 'Voltage (V)', color: 'rgb(100 220 120)' },
						{ data: cd.current, label: 'Current (A)', color: 'rgb(255 160 60)' }
					] as chart}
						<div>
							<div class="mb-1 text-[9px] uppercase tracking-wider" style="color: {chart.color}">{chart.label}</div>
							<svg viewBox="0 0 {chart.data.W} {chart.data.H}" class="w-full">
								<polyline points={chart.data.pts} fill="none" stroke={chart.color} stroke-width="1.5" stroke-linejoin="round"/>
								<text x={chart.data.pad.l - 2} y={chart.data.pad.t + 4} font-size="7" fill="#666" text-anchor="end">{chart.data.max.toFixed(1)}</text>
								<text x={chart.data.pad.l - 2} y={chart.data.H - chart.data.pad.b} font-size="7" fill="#666" text-anchor="end">{chart.data.min.toFixed(1)}</text>
								{#each cd.tLabels as tl}
									<text x={tl.x} y={chart.data.H - 2} font-size="7" fill="#555" text-anchor="middle">{tl.label}</text>
								{/each}
							</svg>
						</div>
					{/each}
				</div>
			</Panel>
		{/if}

		{#if log.parseError}
			<Panel class="mt-3.5 p-3.5">
				<div class="label-tiny mb-1.5 text-scarlet-bright">PARSE ERROR</div>
				<div class="text-[12px] text-scarlet-bright">{log.parseError}</div>
			</Panel>
		{/if}
	{/if}
</div>