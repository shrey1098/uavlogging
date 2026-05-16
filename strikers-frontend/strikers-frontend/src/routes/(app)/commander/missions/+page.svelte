<script lang="ts">
	import { useMissions } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError, formatDate } from '$lib/utils';

	const query = useMissions();

	function statusVariant(s: string): any {
		if (s === 'verified') return 'ok';
		if (s === 'pending_verification') return 'warn';
		if (s === 'archived') return 'info';
		return 'default';
	}
</script>

<div class="page-pad">
	<div class="mb-3.5">
		<div class="label-tiny">MISSION ARCHIVE · UNIT WIDE</div>
		<h1 class="h1 mt-1">MISSIONS · {($query.data ?? []).length} TOTAL</h1>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading missions..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else}
		<Panel>
			<div class="overflow-x-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>ID</th>
							<th>NAME</th>
							<th>TYPE</th>
							<th>STATUS</th>
							<th>DATE</th>
						</tr>
					</thead>
					<tbody>
						{#each $query.data ?? [] as msn}
							<tr
								class="cursor-pointer hover:bg-bg-elevated"
								onclick={() => (window.location.href = `/commander/missions/${msn._id}`)}
							>
								<td class="font-mono text-gold">{msn._id.slice(-8).toUpperCase()}</td>
								<td>{msn.name}</td>
								<td><Chip>{msn.missionType.replace('_', ' ').toUpperCase()}</Chip></td>
								<td><Chip variant={statusVariant(msn.status)}>{msn.status}</Chip></td>
								<td>{formatDate(msn.createdAt)}</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="text-center text-text-dim">No missions yet.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Panel>
	{/if}
</div>
