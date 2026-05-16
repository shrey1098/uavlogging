<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores';
	import { getAccessToken } from '$lib/api';

	onMount(() => {
		const token = getAccessToken();
		if (!token) {
			goto('/login', { replaceState: true });
			return;
		}
		// Wait for user hydration then route
		const unsub = user.subscribe((u) => {
			if (u) {
				goto(u.role === 'super_admin' ? '/commander' : '/operator', { replaceState: true });
				unsub();
			}
		});
		// Fallback in case user is null after hydration
		setTimeout(() => {
			if (!getAccessToken()) goto('/login', { replaceState: true });
		}, 1500);
	});
</script>

<div class="flex min-h-screen items-center justify-center">
	<div class="label-tiny animate-blink">● LOADING</div>
</div>
