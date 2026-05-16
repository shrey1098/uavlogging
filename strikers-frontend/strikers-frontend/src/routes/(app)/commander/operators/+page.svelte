<script lang="ts">
	import { useOperators } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError, formatDate } from '$lib/utils';

	const query = useOperators();
	let search = $state('');

	const filtered = $derived(
		($query.data ?? []).filter((o) =>
			search ? o.name.toLowerCase().includes(search.toLowerCase()) : true
		)
	);
</script>

<div class="page-pad">
	<div class="mb-3.5">
		<div class="label-tiny">PERSONNEL ROSTER · UNIT WIDE</div>
		<h1 class="h1 mt-1">ALL OPERATORS · {($query.data ?? []).length}</h1>
	</div>

	<div class="mb-3.5 flex gap-2 overflow-x-auto">
		<input
			bind:value={search}
			class="input"
			placeholder="Search by name..."
			style="max-width: 240px"
		/>
		<Button class="whitespace-nowrap">CLEARANCE: ALL</Button>
		<Button class="whitespace-nowrap">SORT: READINESS ↓</Button>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading roster..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else}
		<Panel>
			<div class="overflow-x-auto">
				<table class="tbl">
					<thead>
						<tr>
							<th>NAME</th>
							<th>EMAIL</th>
							<th>LICENSE</th>
							<th>EXPIRY</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each filtered as op}
							<tr
								class="cursor-pointer hover:bg-bg-elevated"
								onclick={() => (window.location.href = `/commander/operators/${op._id}`)}
							>
								<td>{op.name}</td>
								<td class="text-text-dim">{op.email}</td>
								<td class="font-mono text-gold">{op.licenseNumber}</td>
								<td>{formatDate(op.licenseExpiry)}</td>
								<td>
									<Button size="sm" href="/commander/operators/{op._id}">FILE ▸</Button>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="text-center text-text-dim">No operators registered.</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Panel>
	{/if}
</div>
