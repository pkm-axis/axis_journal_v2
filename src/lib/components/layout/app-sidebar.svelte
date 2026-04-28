<script lang="ts">
	import NavMain from "./nav-main.svelte";
	import NavAnalytics from "./nav-analytics.svelte";
	import NavUser from "./nav-user.svelte";
	import AccountSwitcher from "./account-switcher.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import { onMount, type ComponentProps } from "svelte";
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import ChartPieIcon from "@lucide/svelte/icons/chart-pie";
	import FrameIcon from "@lucide/svelte/icons/frame";
	import MapIcon from "@lucide/svelte/icons/map";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import SquareTerminalIcon from "@lucide/svelte/icons/square-terminal";
    import { accountStore } from "$lib/stores/accounts.svelte";
    import { instrumentStore } from "$lib/stores/instruments.svelte";
    import { strategyStore } from "$lib/stores/strategies.svelte";
    import { mistakeStore } from "$lib/stores/mistakes.svelte";
	import { supabase } from "$lib/supabase/client";

    let { user, ref = $bindable(null), collapsible = "icon", ...restProps }: ComponentProps<typeof Sidebar.Root> & {
		user: { id: string; name: string; email: string; avatar: string };
	} = $props();

	const sidebar = useSidebar();

    onMount(() => {
        if(!user) return;
        instrumentStore.getInstruments(supabase);
        strategyStore.getStrategies(supabase);
        mistakeStore.getMistakes(supabase);
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
						url: "/coming-soon?section=Analytics",
					},
                    {
						title: "Strategies & Mistakes",
						url: "/playbook",
					},
				],
			},
			{
				title: "Tools",
				url: "#",
				icon: BookOpenIcon,
				items: [
					{
						title: "P&L Calendar",
						url: "/tools/pnl-calendar",
					},
                    {
                        title: "Expectancy Calculator",
                        url: "/tools/expectancy",
                    },
                    {
						title: "Trade Duration Analyzer",
						url: "/tools/duration",
					},
					{
						title: "Risk Calculator",
						url: "/coming-soon?section=Risk+Calculator",
					},
					{
						title: "Position Size Calculator",
						url: "/coming-soon?section=Position+Size+Calculator",
					},
					{
						title: "R-Multiple Calculator",
						url: "/coming-soon?section=R-Multiple+Calculator",
					},
					{
						title: "Drawdown Calculator",
						url: "/coming-soon?section=Drawdown+Calculator",
					},
                    {
						title: "Compounding Calculator",
						url: "/coming-soon?section=Compounding+Calculator",
					},
                    {
                        title: "Risk-to-Reward Planner",
                        url: "/coming-soon?section=Risk-to-Reward+Planner",
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
						url: "/coming-soon?section=Settings",
					},
				],
			},
		],
		analytics: [
			{
				name: "Account Performance",
				url: "/coming-soon?section=Account+Performance",
				icon: FrameIcon,
			},
			{
				name: "Cross-account Analysis",
				url: "/coming-soon?section=Cross-account+Analysis",
				icon: ChartPieIcon,
			},
			{
				name: "Strategy & Mistake Performance",
				url: "/coming-soon?section=Strategy+%26+Mistake+Performance",
				icon: MapIcon,
			},
		],
	};

</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<div class={sidebar.state === "collapsed" ? "flex items-center justify-center py-2.5" : "flex items-center gap-2.5 px-2 py-2.5"}>
			<div class="flex size-7 shrink-0 items-center justify-center bg-sage">
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M7 1L13 13H1L7 1Z" fill="white" />
				</svg>
			</div>
			{#if sidebar.state !== "collapsed"}
				<span class="text-sm font-semibold tracking-widest text-sidebar-foreground">AXIS</span>
			{/if}
		</div>
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
