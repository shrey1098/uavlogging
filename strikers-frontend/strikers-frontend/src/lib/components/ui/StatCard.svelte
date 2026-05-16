<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface Props {
		label: string;
		value: string | number;
		hint?: string;
		variant?: 'default' | 'gold' | 'scarlet';
		class?: string;
	}

	let { label, value, hint, variant = 'default', class: cls = '' }: Props = $props();
</script>

<div class={cn('rounded-lg border border-border bg-bg-panel p-3.5', cls)}>
	<div class="label-tiny">{label}</div>
	<div
		class={cn(
			'mt-1 font-display text-[28px] leading-none tracking-tight',
			variant === 'gold' && 'text-gold',
			variant === 'scarlet' && 'text-scarlet-bright'
		)}
	>
		{value}
	</div>
	{#if hint}
		<div class="mt-1 text-[11px] text-text-dim">{hint}</div>
	{/if}
</div>
