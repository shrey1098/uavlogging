<script lang="ts">
	interface Props {
		label?: string;
	}
	let { label = 'Loading...' }: Props = $props();
</script>

<div class="flex items-center justify-center gap-3 py-12 text-text-dim">
	<span class="label-tiny animate-blink">●</span>
	<span class="label-tiny">{label}</span>
</div>
