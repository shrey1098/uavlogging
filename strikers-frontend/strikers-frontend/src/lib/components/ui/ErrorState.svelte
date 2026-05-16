<script lang="ts">
	interface Props {
		message?: string;
		onRetry?: () => void;
	}
	let { message = 'Something went wrong', onRetry }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center gap-3 py-12">
	<div class="text-2xl text-scarlet-bright">⚠</div>
	<div class="text-sm text-text-secondary">{message}</div>
	{#if onRetry}
		<button onclick={onRetry} class="btn"> Retry </button>
	{/if}
</div>
