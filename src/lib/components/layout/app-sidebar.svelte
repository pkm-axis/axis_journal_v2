<script lang="ts">
	import NavMain from "./nav-main.svelte";
	import NavAnalytics from "./nav-analytics.svelte";
	import NavUser from "./nav-user.svelte";
	import AccountSwitcher from "./account-switcher.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { onMount, type ComponentProps } from "svelte";
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import ChartPieIcon from "@lucide/svelte/icons/chart-pie";
	import FrameIcon from "@lucide/svelte/icons/frame";
	import MapIcon from "@lucide/svelte/icons/map";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import SquareTerminalIcon from "@lucide/svelte/icons/square-terminal";
    import { accountStore } from "$lib/stores/accounts.svelte";
    import { instrumentStore } from "$lib/stores/instruments.svelte";
	import { supabase } from "$lib/supabase/client";

    let { user, ref = $bindable(null), collapsible = "icon", ...restProps }: ComponentProps<typeof Sidebar.Root> & {
		user: { id: string; name: string; email: string; avatar: string };
	} = $props();

    onMount(() => {
        if(!user) return;
        instrumentStore.getInstruments(supabase);
    });

    const sidebarData = {
		navMain: [
			{
				title: "Overview",
				url: "#",
				icon: SquareTerminalIcon,
				isActive: true,
				items: [
					{
						title: "Dashboard",
						url: "/dashboard",
					},
					{
						title: "Trades",
						url: "/trades",
					},
					{
						title: "Analytics",
						url: "#",
					},
                    {
						title: "Strategies & Mistakes",
						url: "#",
					},
				],
			},
			{
				title: "Tools",
				url: "#",
				icon: BookOpenIcon,
				items: [
					{
						title: "Risk Calculator",
						url: "#",
					},
					{
						title: "Position Size Calculator",
						url: "#",
					},
					{
						title: "R-Multiple Calculator",
						url: "#",
					},
					{
						title: "Drawdown Calculator",
						url: "#",
					},
                    {
						title: "Compounding Calculator",
						url: "#",
					},
                    {
						title: "Trade Duration Analyzer",
						url: "#",
					},
                    {
                        title: "Expectancy Calculator",
                        url: "#",
                    },
                    {
                        title: "Risk-to-Reward Planner",
                        url: "#",
                    },
				],
			},
			{
				title: "Settings",
				url: "#",
				icon: Settings2Icon,
				items: [
					{
						title: "General",
						url: "#",
					},
					{
						title: "Team",
						url: "#",
					},
					{
						title: "Billing",
						url: "#",
					},
					{
						title: "Limits",
						url: "#",
					},
				],
			},
		],
		analytics: [
			{
				name: "Account Performance",
				url: "#",
				icon: FrameIcon,
			},
			{
				name: "Cross-account Analysis",
				url: "#",
				icon: ChartPieIcon,
			},
			{
				name: "Strategy & Mistake Performance",
				url: "#",
				icon: MapIcon,
			},
		],
	};

</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<AccountSwitcher accounts={accountStore.accounts} />
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={sidebarData.navMain} />
		<NavAnalytics analytics={sidebarData.analytics} />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser {user} />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
