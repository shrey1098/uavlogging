<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Variant = 'default' | 'gold' | 'ok' | 'warn' | 'danger' | 'info';

	interface Props {
		variant?: Variant;
		class?: string;
		children?: Snippet;
	}

	let { variant = 'default', class: cls = '', children }: Props = $props();

	const v = {
		default: 'border-border-strong text-text-secondary bg-white/[0.03]',
		gold: 'border-gold/40 bg-gold/10 text-gold',
		ok: 'border-gold/40 bg-gold/10 text-gold',
		warn: 'border-gold/40 bg-gold/10 text-gold',
		danger: 'border-scarlet-bright/40 bg-scarlet-bright/10 text-scarlet-bright',
		info: 'border-border-strong bg-white/[0.03] text-text-secondary'
	};
</script>

<span
	class={cn(
		'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
		v[variant],
		cls
	)}
>
	{#if children}{@render children()}{/if}
</span>
