<script lang="ts">
	import { useSidebar } from "$lib/components/ui/sidebar/context.svelte.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";

	let {
		analytics,
	}: {
		analytics: {
			name: string;
			url: string;
			// This should be `Component` after @lucide/svelte updates types
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			icon: any;
		}[];
	} = $props();

	const sidebar = useSidebar();
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Analytics</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each analytics as item (item.name)}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={item.name}>
					{#snippet child({ props })}
						<a
							href={item.url}
							{...props}
							onclick={() => sidebar.isMobile && sidebar.setOpenMobile(false)}
						>
							<item.icon />
							<span>{item.name}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
