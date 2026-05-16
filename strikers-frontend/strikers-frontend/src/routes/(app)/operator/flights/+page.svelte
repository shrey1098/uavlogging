<script lang="ts">
	import { useFlightLogs } from '$lib/api/queries';
	import { Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { formatDateTime, formatDuration, extractError } from '$lib/utils';
	import { api as _ } from '$lib/api';

	let search = $state('');
	let typeFilter = $state<'all' | 'training' | 'live'>('all');

	const query = useFlightLogs({ sort: '-createdAt' });

	const filtered = $derived(
		($query.data ?? []).filter((l) => {
			if (search && !l.originalFilename.toLowerCase().includes(search.toLowerCase()))
				return false;
			return true;
		})
	);

	function statusVariant(s: string) {
		if (s === 'parsed') return 'ok';
		if (s === 'parsing' || s === 'queued') return 'warn';
		if (s === 'failed') return 'danger';
		return 'default';
	}
</script>

<div class="page-pad">
	<div class="mb-3 flex items-end justify-between lg:hidden">
		<div>
			<div class="label-tiny">YOUR FLIGHTS</div>
			<div class="font-display text-[22px]">FLIGHT LOG</div>
		</div>
	</div>
	<div class="mb-4 hidden items-end justify-between lg:flex">
		<div>
			<div class="label-tiny">FLIGHT LOGS · OPERATOR SCOPE</div>
			<h1 class="h1 mt-1">SORTIE ARCHIVE</h1>
		</div>
		<Button href="/operator/upload" variant="primary">+ UPLOAD LOG</Button>
	</div>

	<input
		bind:value={search}
		class="input mb-2.5"
		placeholder="🔍  Search flights..."
		style="font-size: 12px"
	/>

	<div class="flex gap-1.5 overflow-x-auto pb-1">
		<Button
			variant={typeFilter === 'all' ? 'primary' : 'default'}
			size="sm"
			onclick={() => (typeFilter = 'all')}>ALL</Button
		>
		<Button
			variant={typeFilter === 'training' ? 'primary' : 'default'}
			size="sm"
			onclick={() => (typeFilter = 'training')}>TRAINING</Button
		>
		<Button
			variant={typeFilter === 'live' ? 'primary' : 'default'}
			size="sm"
			onclick={() => (typeFilter = 'live')}>LIVE</Button
		>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading flights..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else if filtered.length === 0}
		<div class="mt-6 rounded-md border border-border bg-bg-panel p-6 text-center">
			<div class="label-tiny">NO FLIGHTS FOUND</div>
			<div class="mt-2 text-xs text-text-dim">Upload your first flight log to get started.</div>
		</div>
	{:else}
		<div class="mt-4 space-y-2">
			{#each filtered as log}
				<a href="/operator/flights/{log._id}" class="tap-row">
					<div
						class="flex h-9 w-9 items-center justify-center rounded-md bg-bg-elev text-base text-gold"
					>
						{log.parseStatus === 'parsed' ? '✓' : log.parseStatus === 'failed' ? '✕' : '⟳'}
					</div>
					<div class="flex-1">
						<div class="text-[13px] font-semibold">{log.originalFilename}</div>
						<div class="mt-0.5 text-[11px] text-text-dim">
							{formatDateTime(log.createdAt)}
							{#if log.durationSeconds}· {formatDuration(log.durationSeconds)}{/if}
							{#if log.alertCount}· {log.alertCount} alerts{/if}
						</div>
					</div>
					<Chip variant={statusVariant(log.parseStatus) as any}>{log.parseStatus}</Chip>
				</a>
			{/each}
		</div>
	{/if}
</div>
