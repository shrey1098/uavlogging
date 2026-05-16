<script lang="ts">
	import { page } from '$app/stores';
	import { isCommander } from '$lib/stores';
	import { cn } from '$lib/utils';

	type Tab = { href: string; label: string; icon: string };

	const operatorTabs: Tab[] = [
		{ href: '/operator', label: 'Home', icon: '⌂' },
		{ href: '/operator/flights', label: 'Flights', icon: '▤' },
		{ href: '/operator/upload', label: 'Upload', icon: '⊕' },
		{ href: '/operator/drones', label: 'Drones', icon: '▲' },
		{ href: '/operator/profile', label: 'Me', icon: '◉' }
	];

	const commanderTabs: Tab[] = [
		{ href: '/commander', label: 'Dash', icon: '⌂' },
		{ href: '/commander/operators', label: 'Ops', icon: '▤' },
		{ href: '/commander/drones', label: 'Fleet', icon: '▲' },
		{ href: '/commander/missions', label: 'Msn', icon: '◈' },
		{ href: '/commander/logs', label: 'Logs', icon: '▦' }
	];

	const tabs = $derived($isCommander ? commanderTabs : operatorTabs);

	function isActive(href: string) {
		if (href === '/operator' || href === '/commander') {
			return $page.url.pathname === href;
		}
		return $page.url.pathname.startsWith(href);
	}
</script>

<nav
	class="fixed bottom-0 left-0 right-0 z-20 grid h-16 grid-cols-5 items-center border-t border-border bg-bg-panel lg:hidden"
>
	{#each tabs as tab}
		{@const active = isActive(tab.href)}
		<a
			href={tab.href}
			class={cn(
				'flex h-full flex-col items-center justify-center gap-1 text-[9px] font-semibold uppercase tracking-wider transition-colors',
				active ? 'text-gold' : 'text-text-dim'
			)}
		>
			<span class={cn('text-xl leading-none', tab.icon === '⊕' && 'text-[22px]')}>
				{tab.icon}
			</span>
			{tab.label}
		</a>
	{/each}
</nav>
