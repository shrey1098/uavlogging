<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user, isCommander, isOperator } from '$lib/stores';
	import { getAccessToken, authApi } from '$lib/api';
	import TopBar from '$lib/components/layout/TopBar.svelte';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import TabBar from '$lib/components/layout/TabBar.svelte';

	let { children } = $props();
	let ready = $state(false);

	onMount(async () => {
		const token = getAccessToken();
		if (!token) {
			goto('/login', { replaceState: true });
			return;
		}
		try {
			const me = await authApi.me();
			user.set(me);

			// Role-based route guard
			const path = $page.url.pathname;
			if (path.startsWith('/commander') && me.role !== 'super_admin') {
				goto('/operator', { replaceState: true });
				return;
			}
			if (path.startsWith('/operator') && me.role === 'super_admin') {
				// Commanders can browse operator views if they want; allow it
			}
			ready = true;
		} catch {
			user.set(null);
			goto('/login', { replaceState: true });
		}
	});
</script>

{#if ready && $user}
	<div class="flex h-screen flex-col overflow-hidden">
    <TopBar />
    <div class="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />
        <main class="main-content flex-1 overflow-y-auto pb-20 lg:pb-0">
				{@render children?.()}
			</main>
		</div>
		<TabBar />
	</div>
{:else}
	<div class="flex min-h-screen items-center justify-center">
		<div class="label-tiny animate-blink">● AUTHENTICATING</div>
	</div>
{/if}
