<script lang="ts">
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores';
	import { authApi } from '$lib/api';
	import { useFlightLogs, useDrones } from '$lib/api/queries';
	import { Panel, Button, Chip, Progress } from '$lib/components/ui';

	const logsQuery = useFlightLogs();
	const dronesQuery = useDrones();

	const initials = $derived(
		($user?.name || '')
			.split(' ')
			.map((n) => n[0])
			.join('')
			.slice(0, 2)
			.toUpperCase() || 'OP'
	);

	const totalHours = $derived(
		($dronesQuery.data ?? []).reduce((s, d) => s + (d.totalFlightHours ?? 0), 0)
	);
	const totalFlights = $derived(($logsQuery.data ?? []).length);

	async function signOut() {
		await authApi.logout();
		user.set(null);
		goto('/login', { replaceState: true });
	}

	const skills = [
		{ label: 'Flying control', value: 92, rating: 'EXCELLENT' },
		{ label: 'Following orders', value: 94, rating: 'EXCELLENT' },
		{ label: 'Quick reactions', value: 78, rating: 'GOOD' },
		{ label: 'Handling problems', value: 81, rating: 'GOOD' }
	];
</script>

<div class="page-pad">
	<!-- Profile header -->
	<div class="py-2.5 text-center">
		<div
			class="inline-flex h-20 w-20 items-center justify-center rounded-full bg-scarlet font-display text-3xl text-text-primary"
		>
			{initials}
		</div>
		<div class="mt-3 font-display text-[22px]">{$user?.name?.toUpperCase()}</div>
		<div class="text-[11px] text-text-dim">{$user?.email}</div>
		<div class="mt-2 flex justify-center gap-1.5">
			<Chip>17 JAK LI · ALPHA</Chip>
			<Chip variant="gold">NIGHT OPS</Chip>
		</div>
	</div>

	<!-- Readiness Hero -->
	<Panel corner scan class="relative mb-4 p-5 text-center">
		<div class="label-tiny">YOUR READINESS SCORE</div>
		<div class="big-num mt-1.5 text-gold">87</div>
		<div class="mt-2 inline-block"><Chip variant="ok">▲ UP 4 THIS MONTH</Chip></div>
	</Panel>

	<!-- Stats -->
	<div class="mb-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
		<div class="stat-card">
			<div class="label-tiny">TOTAL HOURS</div>
			<div class="med-num mt-1">
				{totalHours.toFixed(0)}<span class="text-sm text-text-dim">h</span>
			</div>
		</div>
		<div class="stat-card">
			<div class="label-tiny">TOTAL FLIGHTS</div>
			<div class="med-num mt-1">{totalFlights}</div>
		</div>
		<div class="stat-card">
			<div class="label-tiny">LIVE OPS</div>
			<div class="med-num mt-1">—</div>
		</div>
		<div class="stat-card">
			<div class="label-tiny">NIGHT HOURS</div>
			<div class="med-num mt-1">—</div>
		</div>
	</div>

	<!-- Skills -->
	<div class="label-tiny mb-2.5">HOW YOU'RE DOING</div>
	<Panel class="p-3.5">
		{#each skills as skill}
			<div class="mb-3.5 last:mb-0">
				<div class="mb-1 flex justify-between text-[12px]">
					<span>{skill.label}</span>
					<span class="font-bold text-gold">{skill.rating}</span>
				</div>
				<Progress value={skill.value} />
			</div>
		{/each}
	</Panel>

	<!-- Achievements -->
	<div class="label-tiny mb-2.5 mt-5">RECENT ACHIEVEMENTS</div>
	<div class="space-y-2">
		<div class="tap-row">
			<div class="text-2xl">🏅</div>
			<div class="flex-1">
				<div class="text-[13px] font-semibold">Cleared for Night Operations</div>
				<div class="text-[11px] text-text-dim">3 May 2026</div>
			</div>
		</div>
		<div class="tap-row">
			<div class="text-2xl">🎖</div>
			<div class="flex-1">
				<div class="text-[13px] font-semibold">First Live Deployment</div>
				<div class="text-[11px] text-text-dim">12 Apr 2026</div>
			</div>
		</div>
	</div>

	<Button
		onclick={signOut}
		variant="default"
		size="mob"
		class="mt-6 border-scarlet-bright/40 text-scarlet-bright"
	>
		⏻ SIGN OUT
	</Button>
</div>
