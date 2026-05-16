<script lang="ts">
	import { page } from '$app/stores';
	import { useOperator } from '$lib/api/queries';
	import { Panel, Button, Chip, Loading, ErrorState } from '$lib/components/ui';
	import { extractError, formatDate } from '$lib/utils';

	const id = $derived($page.params.id);
	const query = $derived.by(() => useOperator(id));
	const op = $derived($query.data);

	const initials = $derived(
		(op?.name || '')
			.split(' ')
			.map((n) => n[0])
			.join('')
			.slice(0, 2)
			.toUpperCase() || '??'
	);
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-center gap-2.5">
		<Button href="/commander/operators">← ROSTER</Button>
		<span class="label-tiny">PERSONNEL FILE</span>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading file..." />
	{:else if $query.error || !op}
		<ErrorState
			message={extractError($query.error) || 'Operator not found'}
			onRetry={() => $query.refetch()}
		/>
	{:else}
		<Panel corner class="mb-3.5 p-4">
			<div class="flex flex-wrap items-center gap-3.5">
				<div
					class="flex h-16 w-16 items-center justify-center rounded bg-scarlet font-display text-2xl text-text-primary"
				>
					{initials}
				</div>
				<div class="min-w-[200px] flex-1">
					<div class="font-display text-[22px]">{op.name}</div>
					<div class="mt-0.5 text-[12px] text-text-secondary">{op.email}</div>
					<div class="mt-2 flex flex-wrap gap-1.5">
						<Chip variant="gold">LICENSE {op.licenseNumber}</Chip>
						<Chip>EXPIRES {formatDate(op.licenseExpiry)}</Chip>
					</div>
				</div>
				<div class="text-right">
					<div class="label-tiny">READINESS</div>
					<div class="font-display text-5xl text-gold">87</div>
					<div class="text-[11px] text-text-dim">↑ +4 (30d)</div>
				</div>
			</div>
		</Panel>

		<div class="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">CAREER STATS</div>
				<div class="grid grid-cols-2 gap-1.5 text-[12px]">
					<div class="flex justify-between"><span class="text-text-dim">HOURS</span><span class="text-gold">—</span></div>
					<div class="flex justify-between"><span class="text-text-dim">SORTIES</span><span>—</span></div>
					<div class="flex justify-between"><span class="text-text-dim">LIVE OPS</span><span>—</span></div>
					<div class="flex justify-between"><span class="text-text-dim">NIGHT</span><span>—</span></div>
				</div>
			</Panel>
			<Panel class="p-3.5">
				<div class="label-tiny mb-2.5">COMMANDER NOTES</div>
				<textarea class="input text-[12px]" rows="5" placeholder="Notes for this operator..."></textarea>
				<div class="mt-2 flex gap-2">
					<Button class="flex-1">SAVE NOTE</Button>
					<Button>⚐ FLAG</Button>
				</div>
			</Panel>
		</div>
	{/if}
</div>
