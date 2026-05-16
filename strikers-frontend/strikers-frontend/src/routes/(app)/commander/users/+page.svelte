<script lang="ts">
	import { Panel, Button, Chip } from '$lib/components/ui';
</script>

<div class="page-pad">
	<div class="mb-3.5">
		<div class="label-tiny">SYSTEM ADMINISTRATION</div>
		<h1 class="h1 mt-1">USER MANAGEMENT</h1>
	</div>

	<Panel class="p-5">
		<div class="flex flex-col items-start gap-3">
			<Chip variant="warn">⚠ PLANNED FEATURE</Chip>
			<div class="text-[13px] text-text-secondary">
				The user management API is planned but not yet implemented in the backend.
				Per the Access Control specification, super admins are currently created by:
			</div>
			<ol class="ml-4 list-decimal space-y-1 text-[12px] text-text-secondary">
				<li>Running <code class="text-gold">npm run seed</code> (creates default admin)</li>
				<li>Directly updating a user's role in MongoDB Atlas</li>
				<li>A future admin management API (planned)</li>
			</ol>
			<div class="text-[11px] text-text-dim">
				This screen will be wired up once the backend endpoints are available.
			</div>
		</div>
	</Panel>
</div>
