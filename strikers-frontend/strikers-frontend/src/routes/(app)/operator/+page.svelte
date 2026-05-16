<script lang="ts">
	import { user } from '$lib/stores';
	import { useDrones, useFlightLogs } from '$lib/api/queries';
	import { Panel, Button, Chip, Progress, Loading } from '$lib/components/ui';
	import { formatDateTime, formatHours } from '$lib/utils';

	const dronesQuery = useDrones();
	const logsQuery = useFlightLogs({ limit: 1, sort: '-createdAt' });

	const initials = $derived(
		($user?.name || '')
			.split(' ')
			.map((n) => n[0])
			.join('')
			.slice(0, 2)
			.toUpperCase() || 'OP'
	);

	// Placeholder readiness - backend doesn't expose this yet, calc from logs later
	const readiness = $derived(87);
	const totalHours = $derived(($dronesQuery.data ?? []).reduce((s, d) => s + (d.totalFlightHours ?? 0), 0));
</script>

<!-- Mobile personal header -->
<div class="flex items-center justify-between p-3.5 lg:hidden">
	<div>
		<div class="text-[10px] uppercase tracking-widest text-text-secondary">Good morning</div>
		<div class="mt-0.5 font-display text-xl">{$user?.name?.toUpperCase()}</div>
	</div>
	<div
		class="flex h-10 w-10 items-center justify-center rounded-full bg-scarlet font-extrabold text-text-primary"
	>
		{initials}
	</div>
</div>

<div class="page-pad">
	<div class="mb-4 hidden lg:block">
		<div class="label-tiny">OPERATOR DASHBOARD · {$user?.name}</div>
		<h1 class="h1 mt-1">SITUATIONAL OVERVIEW</h1>
	</div>

	<!-- Readiness Hero -->
	<Panel corner scan class="relative p-5 text-center">
		<div class="label-tiny">YOUR READINESS</div>
		<div class="big-num mt-2 text-gold">{readiness}</div>
		<div class="mt-1 text-[11px] text-text-secondary">out of 100</div>
		<div class="mt-2.5 inline-block">
			<Chip variant="ok">▲ UP 4 POINTS THIS MONTH</Chip>
		</div>
		<Progress value={readiness} class="mt-3.5" />
	</Panel>

	<Button href="/operator/upload" variant="primary" size="mob" class="mt-3.5">
		<span class="text-lg">＋</span> UPLOAD FLIGHT LOG
	</Button>

	<!-- Stats grid -->
	<div class="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
		<div class="stat-card">
			<div class="label-tiny">FLIGHT HOURS</div>
			<div class="med-num mt-1">{formatHours(totalHours * 3600).replace('h', '')}<span class="text-sm text-text-dim">h</span></div>
		</div>
		<div class="stat-card">
			<div class="label-tiny">THIS MONTH</div>
			<div class="med-num mt-1">{($logsQuery.data ?? []).length}<span class="ml-1 text-xs text-text-dim">flights</span></div>
		</div>
		<div class="stat-card">
			<div class="label-tiny">YOUR DRONES</div>
			<div class="med-num mt-1">{($dronesQuery.data ?? []).length}</div>
		</div>
		<div class="stat-card">
			<div class="label-tiny">CERTIFIED FOR</div>
			<div class="mt-1.5"><Chip variant="gold">NIGHT OPS</Chip></div>
		</div>
	</div>

	<!-- Last flight -->
	<div class="label-tiny mb-2 mt-5">YOUR LAST FLIGHT</div>
	{#if $logsQuery.isLoading}
		<Loading label="Loading last flight..." />
	{:else if ($logsQuery.data ?? []).length === 0}
		<Panel class="p-4 text-center text-[12px] text-text-dim">
			No flights yet. Upload your first log to get started.
		</Panel>
	{:else}
		{@const log = $logsQuery.data![0]}
		<a href="/operator/flights/{log._id}" class="tap-row">
			<div
				class="flex h-9 w-9 items-center justify-center rounded-md bg-bg-elev text-gold"
			>
				▲
			</div>
			<div class="flex-1">
				<div class="text-[13px] font-semibold">{log.originalFilename}</div>
				<div class="mt-0.5 text-[11px] text-text-dim">
					{formatDateTime(log.createdAt)} · {log.parseStatus}
				</div>
			</div>
			<span class="text-lg text-text-dim">›</span>
		</a>
	{/if}
</div>
