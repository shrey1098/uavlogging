<script lang="ts">
	import { useDroneCategoryTraining } from '$lib/api/queries';
	import { Panel, Button, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';

	const query = useDroneCategoryTraining();
	const categories = $derived(($query.data ?? []) as any[]);

	let expanded = $state<Record<string, boolean>>({});
	function toggle(ft: string) { expanded[ft] = !expanded[ft]; expanded = { ...expanded }; }

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
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-center gap-2.5">
		<Button href="/commander">← DASHBOARD</Button>
		<span class="label-tiny">ANALYTICS · DRONE CLASS TRAINING</span>
	</div>

	<div class="mb-4">
		<div class="label-tiny">FLEET READINESS</div>
		<h1 class="h1 mt-1">TRAINING BY DRONE CLASS</h1>
		<div class="mt-1 text-[12px] text-text-secondary">Who is qualified on which airframe class.</div>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading analytics..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else if categories.length === 0}
		<Panel class="p-6 text-center text-[12px] text-text-dim">
			No flight data yet. Analytics will populate as flights are logged.
		</Panel>
	{:else}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			{#each categories as cat}
				<Panel class="overflow-hidden p-0">
					<div class="flex items-center gap-3 border-b border-border p-3.5">
						<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[22px]"
							style="background: rgba(212,167,44,0.08); border: 1px solid rgba(212,167,44,0.2); color: rgba(212,167,44,0.9)">
							{frameIcon[cat.frameType] ?? '◆'}
						</div>
						<div class="flex-1">
							<div class="font-display text-[16px]">{frameLabel[cat.frameType] ?? cat.frameType}</div>
							<div class="text-[10px] text-text-dim">{cat.operatorCount} operators · {cat.totalFlightHours.toFixed(1)}h total</div>
						</div>
					</div>

					<div class="divide-y divide-border/40">
						{#each (expanded[cat.frameType] ? cat.operators : cat.operators.slice(0, 3)) as op}
							<div
								class="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-bg-elevated"
								onclick={() => window.location.href = `/commander/operators/${op.operatorId}`}
							>
								<div class="flex-1 text-[12px] font-semibold">{op.name}</div>
								<div class="text-right">
									<div class="text-[11px]" style="color: rgb(212 167 44)">{op.flightHours.toFixed(1)}h</div>
									<div class="text-[9px] text-text-dim">{op.sorties} sorties</div>
								</div>
							</div>
						{/each}
					</div>

					{#if cat.operators.length > 3}
						<button onclick={() => toggle(cat.frameType)}
							class="w-full border-t border-border/40 py-2 text-[10px] text-text-dim transition-colors hover:text-text-primary">
							{expanded[cat.frameType] ? '▲ SHOW LESS' : `▼ SHOW ${cat.operators.length - 3} MORE`}
						</button>
					{/if}
				</Panel>
			{/each}
		</div>
	{/if}
</div>