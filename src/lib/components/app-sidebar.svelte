<script lang="ts" module>
	import AudioWaveformIcon from "@lucide/svelte/icons/audio-waveform";
	import BookOpenIcon from "@lucide/svelte/icons/book-open";
	import BotIcon from "@lucide/svelte/icons/bot";
	import ChartPieIcon from "@lucide/svelte/icons/chart-pie";
	import CommandIcon from "@lucide/svelte/icons/command";
	import FrameIcon from "@lucide/svelte/icons/frame";
	import GalleryVerticalEndIcon from "@lucide/svelte/icons/gallery-vertical-end";
	import MapIcon from "@lucide/svelte/icons/map";
	import Settings2Icon from "@lucide/svelte/icons/settings-2";
	import SquareTerminalIcon from "@lucide/svelte/icons/square-terminal";

	// This is sample data.
	const data = {
		user: {
			name: "shadcn",
			email: "m@example.com",
			avatar: "/avatars/shadcn.jpg",
		},
		accounts: [
			{
				name: "Apex Eval",
				logo: GalleryVerticalEndIcon,
				type: "Prop Firm",
			},
			{
				name: "FundedNext Eval",
				logo: AudioWaveformIcon,
				type: "Prop Firm",
			},
			{
				name: "FundedNext Eval 2",
				logo: CommandIcon,
				type: "Prop Firm",
			},
		],
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

<script lang="ts">
	import NavMain from "./nav-main.svelte";
	import NavAnalytics from "./nav-analytics.svelte";
	import NavUser from "./nav-user.svelte";
	import AccountSwitcher from "./account-switcher.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		collapsible = "icon",
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header>
		<AccountSwitcher accounts={data.accounts} />
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={data.navMain} />
		<NavAnalytics analytics={data.analytics} />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser user={data.user} />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
