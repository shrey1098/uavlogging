<script lang="ts">
	import { page } from '$app/stores';
	import { user, isCommander } from '$lib/stores';
	import { cn } from '$lib/utils';

	type NavItem = { href: string; label: string };
	type NavGroup = { title: string; items: NavItem[] };

	const operatorNav: NavGroup[] = [
		{
			title: 'Operations',
			items: [
				{ href: '/operator', label: 'Home' },
				{ href: '/operator/flights', label: 'Flights' },
				{ href: '/operator/upload', label: 'Upload' }
			]
		},
		{
			title: 'Equipment',
			items: [
				{ href: '/operator/drones', label: 'My Drones' },
				{ href: '/operator/batteries', label: 'My Batteries' }
			]
		},
		{
			title: 'Profile',
			items: [{ href: '/operator/profile', label: 'Me' }]
		}
	];

	const commanderNav: NavGroup[] = [
		{
			title: 'Command',
			items: [{ href: '/commander', label: 'Dashboard' }]
		},
		{
			title: 'Personnel',
			items: [{ href: '/commander/operators', label: 'All Operators' }]
		},
		{
			title: 'Fleet',
			items: [{ href: '/commander/drones', label: 'All Drones' }]
		},
		{
			title: 'Operations',
			items: [
				{ href: '/commander/missions', label: 'Missions' },
				{ href: '/commander/logs', label: 'All Flight Logs' }
			]
		},
		{
			title: 'Admin',
			items: [{ href: '/commander/users', label: 'Users' }]
		}
	];

	const nav = $derived($isCommander ? commanderNav : operatorNav);
</script>

<aside class="hidden w-56 shrink-0 flex-col border-r border-border bg-bg-panel lg:flex">
	<div class="border-b border-border px-4 py-3.5">
		<div class="label-tiny mb-1">Unit</div>
		<div class="text-[13px] font-semibold">17 JAK LI · ALPHA</div>
	</div>

	<nav class="flex-1 py-1.5">
		{#each nav as group}
			<div class="label-tiny px-3.5 py-2.5">{group.title}</div>
			{#each group.items as item}
				{@const active = $page.url.pathname === item.href}
				<a
					href={item.href}
					class={cn(
						'flex items-center gap-2.5 border-l-2 border-transparent px-3.5 py-2 text-[11.5px] uppercase tracking-wider transition-colors',
						active
							? 'border-l-gold bg-gradient-to-r from-gold/10 to-transparent text-gold'
							: 'text-text-secondary hover:bg-bg-panel-2 hover:text-text-primary'
					)}
				>
					▸ {item.label}
				</a>
			{/each}
		{/each}
	</nav>

	{#if $user}
		<div class="mt-auto border-t border-border px-3.5 py-3.5">
			<div class="flex items-center gap-2.5">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full bg-scarlet text-[11px] font-extrabold text-text-primary"
				>
					{$user.name
						.split(' ')
						.map((n) => n[0])
						.join('')
						.slice(0, 2)
						.toUpperCase()}
				</div>
				<div class="min-w-0 flex-1">
					<div class="truncate text-[11px] font-semibold">{$user.name}</div>
					<div class="label-tiny mt-0.5">
						{$user.role === 'super_admin' ? 'Commander' : 'Operator'}
					</div>
				</div>
			</div>
		</div>
	{/if}
</aside>
