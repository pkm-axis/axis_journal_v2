<script lang="ts">
	import { page } from '$app/state';

	const label = $derived(page.url.searchParams.get('section') ?? 'This section');
</script>

<div class="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-6 px-6 text-center">
	<div class="flex flex-col items-center gap-4">
		<div class="flex size-16 items-center justify-center rounded-none border border-warm-gray bg-sage-light">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-sage"
			>
				<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
			</svg>
		</div>

		<div class="flex flex-col gap-1.5">
			<h1 class="text-xl font-semibold tracking-tight text-foreground">{label} is coming soon</h1>
			<p class="max-w-sm text-sm text-muted-foreground">
				This section is currently under construction. Check back soon — we're actively working on it.
			</p>
		</div>
	</div>

	<div class="flex items-center gap-2">
		<a href="/dashboard" class="inline-flex h-8 items-center gap-1.5 border border-warm-gray bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-sage-light">
			← Back to Dashboard
		</a>
	</div>
</div>
