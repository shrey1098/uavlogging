<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface Props {
		corner?: boolean;
		scan?: boolean;
		class?: string;
		children?: Snippet;
	}

	let { corner = false, scan = false, class: cls = '', children }: Props = $props();
</script>

<div
	class={cn(
		'relative rounded border border-border bg-bg-panel',
		corner && 'corner',
		scan && 'scan',
		cls
	)}
>
	{#if corner}
		<span class="c-tr"></span>
		<span class="c-bl"></span>
	{/if}
	{#if children}{@render children()}{/if}
</div>
