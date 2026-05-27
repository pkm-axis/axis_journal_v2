<script lang="ts" module>
	/**
	 * Module-level open state so the Tools/Settings/Overview collapsibles
	 * remember their open/closed state across remounts (e.g. when the mobile
	 * sidebar Sheet closes and reopens).
	 */
	const sectionOpen = $state<Record<string, boolean>>({});
</script>

<script lang="ts">
	import * as Collapsible from "$lib/components/ui/collapsible/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import { page } from "$app/state";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

	let {
		items,
	}: {
		items: {
			title: string;
			url: string;
			// this should be `Component` after @lucide/svelte updates types
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			icon?: any;
			isActive?: boolean;
			items?: {
				title: string;
				url: string;
			}[];
		}[];
	} = $props();

	const sidebar = useSidebar();

	// Seed each section's open state on first encounter: open if marked active,
	// or if the current route lives inside it. Manual toggles afterwards win.
	$effect(() => {
		for (const item of items) {
			if (sectionOpen[item.title] !== undefined) continue;
			const containsCurrentRoute = (item.items ?? []).some((s) =>
				page.url.pathname.startsWith(s.url)
			);
			sectionOpen[item.title] = !!item.isActive || containsCurrentRoute;
		}
	});

	function closeOnMobile() {
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	}
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Platform</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each items as item (item.title)}
			<Collapsible.Root
				bind:open={() => sectionOpen[item.title] ?? false, (v) => (sectionOpen[item.title] = v)}
				class="group/collapsible"
			>
				{#snippet child({ props })}
					<Sidebar.MenuItem {...props}>
						<Collapsible.Trigger>
							{#snippet child({ props })}
								<Sidebar.MenuButton {...props} tooltipContent={item.title}>
									{#if item.icon}
										<item.icon />
									{/if}
									<span>{item.title}</span>
									<ChevronRightIcon
										class="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
									/>
								</Sidebar.MenuButton>
							{/snippet}
						</Collapsible.Trigger>
						<Collapsible.Content>
							<Sidebar.MenuSub>
								{#each item.items ?? [] as subItem (subItem.title)}
									<Sidebar.MenuSubItem>
										<Sidebar.MenuSubButton>
											{#snippet child({ props })}
												<a href={subItem.url} {...props} onclick={closeOnMobile}>
													<span>{subItem.title}</span>
												</a>
											{/snippet}
										</Sidebar.MenuSubButton>
									</Sidebar.MenuSubItem>
								{/each}
							</Sidebar.MenuSub>
						</Collapsible.Content>
					</Sidebar.MenuItem>
				{/snippet}
			</Collapsible.Root>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
