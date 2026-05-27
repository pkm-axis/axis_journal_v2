<script lang="ts">
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/context.svelte.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import FolderIcon from "@lucide/svelte/icons/folder";
	import ForwardIcon from "@lucide/svelte/icons/forward";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

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
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuAction showOnHover {...props}>
								<EllipsisIcon />
								<span class="sr-only">More</span>
							</Sidebar.MenuAction>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						class="w-48 rounded-lg"
						side={sidebar.isMobile ? "bottom" : "right"}
						align={sidebar.isMobile ? "end" : "start"}
					>
						<DropdownMenu.Item>
							<FolderIcon class="text-muted-foreground" />
							<span>View Analytics</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<ForwardIcon class="text-muted-foreground" />
							<span>Share Analytics</span>
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item>
							<Trash2Icon class="text-muted-foreground" />
							<span>Delete Analytics</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
