<script lang="ts">
	import '$lib/styles/app.css';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authApi } from '$lib/api';
	import { user } from '$lib/stores';
	import { getAccessToken } from '$lib/api';

	let { children } = $props();

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser,
				retry: 1,
				staleTime: 60 * 1000,
				refetchOnWindowFocus: false
			}
		}
	});

	onMount(async () => {
		// Hydrate user if we have a token
		if (getAccessToken()) {
			try {
				const me = await authApi.me();
				user.set(me);
			} catch {
				user.set(null);
			}
		}
	});
</script>

<svelte:head>
	<title>STRIKERS · UAV Performance System</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
	{@render children?.()}
</QueryClientProvider>
