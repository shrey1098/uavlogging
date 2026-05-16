<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		value: number;
		max?: number;
		variant?: 'gold' | 'scarlet' | 'ok';
		class?: string;
	}

	let { value, max = 100, variant = 'gold', class: cls = '' }: Props = $props();

	const percent = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
	const color = $derived(
		variant === 'scarlet' ? 'bg-scarlet-bright' : variant === 'ok' ? 'bg-gold' : 'bg-gold'
	);
</script>

<div class={cn('relative h-1.5 overflow-hidden rounded-sm bg-bg-elev', cls)}>
	<span class={cn('block h-full rounded-sm', color)} style="width: {percent}%"></span>
</div>
