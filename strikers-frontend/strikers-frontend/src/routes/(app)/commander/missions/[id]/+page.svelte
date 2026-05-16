<script lang="ts">
	import { page } from '$app/stores';
	import { useMission } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError, formatDate } from '$lib/utils';
	import type { Drone, Operator } from '$lib/types';

	const id = $derived($page.params.id);
	const query = $derived.by(() => useMission(id));
	const msn = $derived($query.data);

	function statusVariant(s?: string): any {
		if (s === 'verified') return 'ok';
		if (s === 'pending_verification') return 'warn';
		if (s === 'archived') return 'info';
		return 'default';
	}

	const droneName = $derived(
		msn?.drone && typeof msn.drone === 'object' ? (msn.drone as Drone).name : '—'
	);
	const operatorName = $derived(
		msn?.operator && typeof msn.operator === 'object' ? (msn.operator as Operator).name : '—'
	);
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-center gap-2.5">
		<Button href="/commander/missions">← MISSIONS</Button>
		<span class="label-tiny">MISSION FILE</span>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading mission..." />
	{:else if $query.error || !msn}
		<ErrorState
			message={extractError($query.error) || 'Mission not found'}
			onRetry={() => $query.refetch()}
		/>
	{:else}
		<Panel corner class="mb-3.5 p-4">
			<div class="flex flex-wrap items-start gap-3.5">
				<div class="min-w-[200px] flex-1">
					<div class="label-tiny">MSN ID · {msn._id.slice(-8).toUpperCase()}</div>
					<div class="font-display text-[22px]">{msn.name}</div>
					<div class="mt-2 flex flex-wrap gap-1.5">
						<Chip>{msn.missionType.replace('_', ' ').toUpperCase()}</Chip>
						<Chip variant={statusVariant(msn.status)}>{msn.status.toUpperCase()}</Chip>
					</div>
				</div>
				<div class="text-right">
					<div class="label-tiny">DATE</div>
					<div class="font-display text-xl">{formatDate(msn.createdAt)}</div>
				</div>
			</div>
		</Panel>

		<div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">ASSIGNMENT</div>
				<div class="grid grid-cols-1 gap-1.5 text-[13px]">
					<div class="flex justify-between">
						<span class="text-text-dim">DRONE</span><span class="text-gold">{droneName}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">OPERATOR</span><span>{operatorName}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-dim">BATTERIES</span><span>{(msn.batteries ?? []).length}</span>
					</div>
				</div>
			</Panel>

			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">NOTES</div>
				<div class="text-[13px] text-text-secondary">
					{msn.notes || 'No notes recorded.'}
				</div>
			</Panel>
		</div>
	{/if}
</div>
