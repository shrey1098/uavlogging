<script lang="ts">
	import { useBatteries } from '$lib/api/queries';
	import { Panel, Button, Chip, Progress, Loading, ErrorState } from '$lib/components/ui';
	import { extractError } from '$lib/utils';

	const query = useBatteries();

	function healthLabel(p: number) {
		if (p >= 85) return { label: 'healthy', variant: 'ok' as const };
		if (p >= 65) return { label: 'watch it', variant: 'warn' as const };
		return { label: 'stop using', variant: 'danger' as const };
	}

	const summary = $derived.by(() => {
		const data = $query.data ?? [];
		let ready = 0;
		let check = 0;
		let retire = 0;
		data.forEach((b) => {
			const p = b.healthPercent ?? 100;
			if (p >= 85) ready++;
			else if (p >= 65) check++;
			else retire++;
		});
		return { ready, check, retire };
	});
</script>

<div class="page-pad">
	<div class="mb-3.5 flex items-end justify-between">
		<div>
			<div class="label-tiny">YOUR EQUIPMENT</div>
			<div class="mt-0.5 font-display text-2xl">MY BATTERIES</div>
		</div>
		<Button>＋ ADD</Button>
	</div>

	{#if $query.isLoading}
		<Loading label="Loading batteries..." />
	{:else if $query.error}
		<ErrorState message={extractError($query.error)} onRetry={() => $query.refetch()} />
	{:else}
		<Panel class="mb-3.5 p-3.5 text-center">
			<div class="grid grid-cols-3 gap-2">
				<div>
					<div class="med-num text-gold" style="font-size: 24px">{summary.ready}</div>
					<div class="label-tiny">READY</div>
				</div>
				<div>
					<div class="med-num text-gold" style="font-size: 24px">{summary.check}</div>
					<div class="label-tiny">CHECK</div>
				</div>
				<div>
					<div class="med-num text-scarlet-bright" style="font-size: 24px">{summary.retire}</div>
					<div class="label-tiny">RETIRE</div>
				</div>
			</div>
		</Panel>

		{#if ($query.data ?? []).length === 0}
			<Panel class="p-6 text-center">
				<div class="label-tiny">NO BATTERIES REGISTERED</div>
			</Panel>
		{:else}
			<div class="space-y-2">
				{#each $query.data ?? [] as bat}
					{@const p = bat.healthPercent ?? Math.max(20, 100 - (bat.cyclesUsed ?? 0) / 2)}
					{@const h = healthLabel(p)}
					<div
						class="tap-row"
						style="border-left: 3px solid {h.variant === 'danger'
							? 'rgb(255 45 63)'
							: h.variant === 'warn'
								? 'rgb(212 167 44)'
								: 'transparent'}"
					>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-md text-[22px]"
							style="background: {h.variant === 'danger'
								? 'rgba(255,45,63,0.15)'
								: h.variant === 'warn'
									? 'rgba(212,167,44,0.1)'
									: 'rgba(212,167,44,0.1)'}; color: {h.variant === 'danger'
								? 'rgb(255 45 63)'
								: 'rgb(212 167 44)'}"
						>
							⚡
						</div>
						<div class="flex-1">
							<div class="text-[14px] font-bold">
								{bat.name}
								{#if h.variant !== 'ok'}
									<Chip variant={h.variant as any} class="ml-1.5">{h.label.toUpperCase()}</Chip>
								{/if}
							</div>
							<div class="text-[11px] text-text-dim">
								{bat.cellCount}S {bat.capacity}mAh · {bat.cyclesUsed ?? 0} flights
							</div>
							<Progress
								value={p}
								variant={h.variant === 'danger' ? 'scarlet' : 'gold'}
								class="mt-1"
							/>
						</div>
						<div class="text-right">
							<div
								class="font-bold"
								style="color: {h.variant === 'danger'
									? 'rgb(255 45 63)'
									: 'rgb(212 167 44)'}"
							>
								{p.toFixed(0)}%
							</div>
							<div class="text-[10px] text-text-dim">{h.label}</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
