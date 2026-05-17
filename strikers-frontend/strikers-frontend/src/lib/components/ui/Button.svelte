<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Variant = 'default' | 'primary' | 'gold' | 'ghost';
	type Size = 'sm' | 'md' | 'mob';

	interface Props {
		variant?: Variant;
		size?: Size;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		href?: string;
		class?: string;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
	}

	let {
		variant = 'default',
		size = 'md',
		type = 'button',
		disabled = false,
		href,
		class: cls = '',
		onclick,
		children
	}: Props = $props();

const base = $derived(cn(
    'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded border font-semibold uppercase tracking-wider transition-colors',
    size === 'sm' && 'px-2 py-1 text-[10px]',
    size === 'md' && 'px-3.5 py-2 text-[11px]',
    size === 'mob' && 'w-full px-4 py-3.5 text-sm font-bold gap-2 rounded-md',
    variant === 'default' &&
        'border-border-strong bg-bg-elev text-text-primary hover:border-gold hover:text-gold',
    variant === 'primary' &&
        'border-scarlet bg-scarlet text-text-primary font-bold hover:border-scarlet-bright hover:bg-scarlet-bright',
    variant === 'gold' &&
        'border-gold bg-gold text-bg-base font-bold hover:border-gold-bright hover:bg-gold-bright',
    variant === 'ghost' && 'bg-transparent border-transparent',
    disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
    cls
));
</script>

{#if href}
	<a {href} class={base}>
		{#if children}{@render children()}{/if}
	</a>
{:else}
	<button {type} {disabled} {onclick} class={base}>
		{#if children}{@render children()}{/if}
	</button>
{/if}
