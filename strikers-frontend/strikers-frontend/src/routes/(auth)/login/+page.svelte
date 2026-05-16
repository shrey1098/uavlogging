<script lang="ts">
	import { goto } from '$app/navigation';
	import { authApi, extractError } from '$lib/api';
	import { user } from '$lib/stores';
	import { Panel, Button } from '$lib/components/ui';

	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		loading = true;
		error = null;
		try {
			const result = await authApi.login({ email, password });
			user.set(result.user);
			goto(result.user.role === 'super_admin' ? '/commander' : '/operator', {
				replaceState: true
			});
		} catch (err) {
			error = extractError(err);
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center p-5">
	<Panel corner class="w-full max-w-md p-7">
		<div class="text-center">
			<div class="font-display text-3xl tracking-wider text-gold">▲ STRIKERS</div>
			<div class="label-tiny mt-1.5">UAV PERFORMANCE SYSTEM</div>
			<div class="label-tiny mt-4 text-text-secondary">SIGN IN TO YOUR ACCOUNT</div>
		</div>

		<form onsubmit={handleSubmit} class="mt-9 space-y-4">
			<div>
				<div class="label-tiny mb-1.5">EMAIL</div>
				<input
					bind:value={email}
					type="email"
					autocomplete="email"
					required
					placeholder="operator@unit.mil"
					class="input"
				/>
			</div>

			<div>
				<div class="label-tiny mb-1.5">PASSWORD</div>
				<input
					bind:value={password}
					type="password"
					autocomplete="current-password"
					required
					placeholder="••••••••"
					class="input"
				/>
			</div>

			{#if error}
				<div
					class="rounded-md border border-scarlet-bright/40 bg-scarlet-bright/10 px-3 py-2 text-[11px] text-scarlet-bright"
				>
					⚠ {error}
				</div>
			{/if}

			<Button type="submit" variant="primary" size="mob" disabled={loading}>
				{loading ? 'SIGNING IN...' : 'SIGN IN ▸'}
			</Button>

			<div class="text-center">
				<span class="text-[11px] text-text-secondary">
					Forgot password? Ask your commander.
				</span>
			</div>
		</form>

		<div class="mt-10 border-t border-border pt-5 text-center">
			<div class="label-tiny">PRODUCED BY · STIFF</div>
			<div class="label-tiny mt-1 text-gold">17 JAK LI · ALPHA COY</div>
		</div>
	</Panel>
</div>
