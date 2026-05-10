<script lang="ts">
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { QuestionMark, Bell, Book } from 'phosphor-svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	// import { notificationsStore } from '$lib/stores/notifications.svelte.js';
	// import NotificationSheet from './notification-sheet.svelte';

	let { children, links = false, helpContent }: { children: Snippet; links?: boolean; helpContent?: Snippet } = $props();

	let helpOpen = $state(false);
</script>

<header class="flex h-14 shrink-0 items-center gap-2 border-b">
	<div class="flex w-full items-center gap-2 px-4">
		<Sidebar.Trigger class="-ms-1" />
		<Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
		<div class="relative flex w-full items-center justify-between gap-2">
			{@render children()}
			{#if links}
				<div class="flex items-center gap-2">
					{#if helpContent}
						<Button variant="outline" size="sm" onclick={() => helpOpen = true}><QuestionMark />Help</Button>
					{/if}
					<Button variant="outline" size="sm"><Book />Docs</Button>
					<Button
						variant="outline"
						size="icon"
						class="relative"
						// onclick={() => notificationsStore.openSheet()}
					>
						<Bell />
						<!-- {#if notificationsStore.hasUnread}
							<span class="absolute top-1 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background"></span>
						{/if} -->
					</Button>
				</div>
			{/if}
		</div>
	</div>
</header>

{#if helpContent}
	<Dialog.Root bind:open={helpOpen}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>How to use this page</Dialog.Title>
			</Dialog.Header>
			{@render helpContent()}
		</Dialog.Content>
	</Dialog.Root>
{/if}

{#if links}
	<!-- <NotificationSheet /> -->
{/if}
