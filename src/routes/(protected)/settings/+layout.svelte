<script lang="ts">
	import { page } from "$app/state";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";

	let { children } = $props();

	const NAV = [
		{ href: "/settings/profile", label: "Profile" },
		{ href: "/settings/accounts", label: "Trading accounts" },
		{ href: "/settings/instruments", label: "Instruments" },
		{ href: "/settings/appearance", label: "Appearance" },
		{ href: "/settings/data", label: "Data" },
	];

	const currentLabel = $derived(
		NAV.find((n) => page.url.pathname.startsWith(n.href))?.label ?? "Settings"
	);
</script>

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Settings</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>{currentLabel}</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl p-4 md:p-6">
		<div class="mb-6">
			<h1 class="text-2xl font-bold tracking-tight">Settings</h1>
			<p class="text-sm text-muted-foreground">Manage your profile, accounts, and preferences.</p>
		</div>

		<div class="grid gap-6 md:grid-cols-[200px_1fr]">
			<!-- Sub-nav -->
			<nav class="space-y-1 text-sm">
				{#each NAV as item}
					{@const active = page.url.pathname.startsWith(item.href)}
					<a
						href={item.href}
						class={[
							"block rounded-md px-3 py-2 cursor-pointer transition-colors",
							active
								? "bg-muted font-medium text-foreground"
								: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
						]}
					>
						{item.label}
					</a>
				{/each}
			</nav>

			<!-- Page content -->
			<div>
				{@render children()}
			</div>
		</div>
	</div>
</ScrollArea>
