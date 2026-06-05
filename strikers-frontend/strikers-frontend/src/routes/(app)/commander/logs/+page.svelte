<script lang="ts">
	import { useFlightLogs } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError, formatDateTime, formatDuration } from '$lib/utils';

	const query = useFlightLogs({ sort: '-createdAt', limit: 100 });
</script>

<div class="page-pad">
	<div class="mb-3.5">
		<div class="label-tiny">FULL ARCHIVE · ALL OPERATORS, ALL DRONES</div>
		<h1 class="h1 mt-1">UNIT LOG FEED · {($query.data ?? []).length}</h1>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading log feed..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else}
		<Panel>
			<div class="overflow-x-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>LOG ID</th>
							<th>UPLOADED</th>
							<th>FILENAME</th>
							<th>DUR</th>
							<th>STATUS</th>
							<th>ANOM</th>
						</tr>
					</thead>
					<tbody>
						{#each $query.data ?? [] as log}
							<tr
								class="cursor-pointer hover:bg-bg-elevated"
								onclick={() => (window.location.href = `/commander/logs/${log._id}`)}
							>
								<td class="font-mono text-gold">{log._id.slice(-8).toUpperCase()}</td>
								<td>{formatDateTime(log.createdAt)}</td>
								<td>{(log as any).originalName ?? (log as any).originalFilename ?? '—'}</td>
								<td>{formatDuration(log.durationSeconds)}</td>
								<td>
									<Chip
										variant={log.parseStatus === 'completed'
    ? 'ok'
    : log.parseStatus === 'failed'
        ? 'danger'
        : log.parseStatus === 'skipped'
            ? 'info'
            : 'warn'}
									>
										{log.parseStatus}
									</Chip>
								</td>
								<td
									style="color: {(log.anomalyScore ?? 0) > 0.6
										? 'rgb(255 45 63)'
										: (log.anomalyScore ?? 0) > 0.3
											? 'rgb(212 167 44)'
											: ''}"
								>
									{log.anomalyScore?.toFixed(2) ?? '—'}
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="6" class="text-center text-text-dim">No flight logs yet.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Panel>
	{/if}
</div>
