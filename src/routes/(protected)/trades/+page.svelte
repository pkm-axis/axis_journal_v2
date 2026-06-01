<script lang="ts">
	import { onMount } from "svelte";
	import type { Session } from "@supabase/supabase-js";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import {
		CaretDownIcon,
		CaretUpIcon,
		ChartLineDownIcon,
		ChartLineUpIcon,
		FunnelIcon,
		MagnifyingGlassIcon,
		PlusIcon,
		PulseIcon
	} from "phosphor-svelte";
	import * as Select from "$lib/components/ui/select/index.js";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { payoutStore } from "$lib/stores/payouts.svelte";
	import PnlShareDialog from "$lib/components/pnl-share-sheet/pnl-share-dialog.svelte";
	import TradesList from "$lib/components/trades/trades-list.svelte";
	import TradeStatsCards from "$lib/components/trades/trade-stats-cards.svelte";
	import DailyLossBanner from "$lib/components/trades/daily-loss-banner.svelte";
	import PropFirmPanel from "$lib/components/trades/prop-firm-panel.svelte";
	import PayoutSheet from "$lib/components/trades/payout-sheet.svelte";
	import TradeDetailSheet from "$lib/components/trades/trade-detail-sheet.svelte";
	import TradeFormDialog from "$lib/components/trades/trade-form-dialog.svelte";
	import { rowRiskReward, type TradeRow } from "$lib/components/trades/trade-utils";
	import { num, normalizeSide, riskRewardRatio } from "$lib/utils/number";

	type SideFilter = "all" | "long" | "short";
	type StatusFilter = "all" | "open" | "closed";

	let session = $state<Session | null>(null);
	let viewMode = $state<"table" | "gallery">("table");

	let shareSheetOpen = $state(false);
	let sharingTrade = $state<TradeRow | null>(null);

	function openShareSheet(t: TradeRow) {
		sharingTrade = t;
		shareSheetOpen = true;
	}

	let detailSheetOpen = $state(false);
	let detailTrade = $state<TradeRow | null>(null);

	function openDetailSheet(t: TradeRow) {
		detailTrade = t;
		detailSheetOpen = true;
	}

	let tradeFormOpen = $state(false);
	let editingTrade = $state<TradeRow | null>(null);

	function openCreate() {
		editingTrade = null;
		tradeFormOpen = true;
	}

	function openEdit(t: TradeRow) {
		editingTrade = t;
		tradeFormOpen = true;
	}

	let payoutSheetOpen = $state(false);

	const trades = $derived.by((): TradeRow[] => (tradeStore.trades ?? []) as TradeRow[]);
	const loading = $derived(tradeStore.loading);
	const filteredTrades = $derived(tradeStore.trades as TradeRow[]);

	let searchQuery = $state("");
	let directionFilter = $state<SideFilter>("all");
	let statusFilter = $state<StatusFilter>("all");
	let currentPage = $state(1);
	const PAGE_SIZE = 10;
	let debouncedSearch = $state("");
	let _searchTimer: ReturnType<typeof setTimeout>;

	function goToPage(p: number) {
		currentPage = p;
		void tradeStore.getTradesByAccount(supabase, {
			page: p,
			pageSize: PAGE_SIZE,
			search: debouncedSearch,
			side: directionFilter as "long" | "short" | "all",
			status: statusFilter as "open" | "closed" | "all",
		});
	}

	const stats = $derived.by(() => {
		const rows = filteredTrades;
		const closed = rows.filter((t) => t.status === "closed");
		const netPnl = closed.reduce((acc, t) => acc + (num(t.pnl) ?? 0), 0);
		const wins = closed.filter((t) => (num(t.pnl) ?? 0) > 0).length;
		const winRate = closed.length ? wins / closed.length : null;
		const rrValues: number[] = [];
		for (const t of rows) {
			const e = num(t.entry_price);
			const sl = num(t.stop_loss);
			const tp = num(t.take_profit);
			const s = normalizeSide(t.side);
			if (e != null && sl != null && tp != null && (s === "long" || s === "short")) {
				const rr = riskRewardRatio(e, sl, tp, s);
				if (rr != null) rrValues.push(rr);
			}
		}
		const avgRr =
			rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : null;
		return { count: rows.length, netPnl, winRate, avgRr };
	});

	const activeAccount = $derived(
		accountStore.accounts.find((a) => a.id === accountStore.activeAccountId) ?? null
	);

	// Today's loss buffer (only relevant when prop firm with daily loss limit configured).
	const dailyLossStatus = $derived.by(() => {
		const limit = activeAccount?.prop_firm_daily_loss_limit ?? null;
		if (!limit || limit <= 0) return null;
		const start = new Date(); start.setHours(0, 0, 0, 0);
		const startMs = start.getTime();
		const endMs = startMs + 24 * 60 * 60 * 1000;
		let todayPnl = 0;
		for (const t of trades) {
			if (t.status !== "closed" || !t.closed_at) continue;
			const at = new Date(t.closed_at).getTime();
			if (at < startMs || at >= endMs) continue;
			const n = num(t.pnl);
			if (n != null) todayPnl += n;
		}
		const lossUsed = todayPnl < 0 ? Math.abs(todayPnl) : 0;
		const buffer = Math.max(0, limit - lossUsed);
		const pct = Math.min(100, (lossUsed / limit) * 100);
		const breached = lossUsed >= limit;
		const danger = pct >= 70 && !breached;
		if (!breached && !danger) return null;
		return { limit, todayPnl, lossUsed, buffer, pct, breached, danger };
	});

	const isFundedPropFirm = $derived(
		activeAccount?.account_type === "prop firm" && !!activeAccount?.parent_account_id
	);

	const propFirmStats = $derived.by(() => {
		if (!isFundedPropFirm || !activeAccount) return null;
		const parentAccount = accountStore.accounts.find((a) => a.id === activeAccount.parent_account_id);
		const cost = parentAccount?.challenge_cost;
		const totalPayouts = payoutStore.payouts.filter((p) => p.status === "received").reduce((sum, p) => sum + p.amount, 0);
		const roi = cost && cost > 0 ? (totalPayouts / cost) * 100 : null;
		const remaining = cost && cost > 0 ? Math.max(0, cost - totalPayouts) : null;
		return { cost: cost ?? null, totalPayouts, roi, remaining, breakEvenReached: remaining !== null && remaining === 0 };
	});

	async function refreshSession() {
		const {
			data: { session: s }
		} = await supabase.auth.getSession();
		session = s;
	}

	onMount(() => {
		void refreshSession();
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange(() => {
			void refreshSession();
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		const q = searchQuery;
		clearTimeout(_searchTimer);
		_searchTimer = setTimeout(() => { debouncedSearch = q; }, 300);
		return () => clearTimeout(_searchTimer);
	});

	$effect(() => {
		void accountStore.activeAccountId;
		void debouncedSearch;
		void directionFilter;
		void statusFilter;
		currentPage = 1;
		void tradeStore.getTradesByAccount(supabase, {
			page: 1,
			pageSize: PAGE_SIZE,
			search: debouncedSearch,
			side: directionFilter as "long" | "short" | "all",
			status: statusFilter as "open" | "closed" | "all",
		});
	});

	$effect(() => {
		const id = accountStore.activeAccountId;
		const account = accountStore.accounts.find((a) => a.id === id);
		if (id && account?.account_type === "prop firm" && account?.parent_account_id) {
			void payoutStore.getPayoutsByAccount(supabase, id);
		} else {
			payoutStore.clear();
		}
	});
</script>

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Page>Trades</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">The Trades page is your full trade journal. Log, filter, and review every trade across your accounts.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Use the <strong>+ Add Trade</strong> button to log a new trade manually.</li>
			<li>Filter by date, strategy, mistake, or instrument using the filter bar.</li>
			<li>Switch between card view and list view using the icons in the toolbar.</li>
			<li>Click the share icon on a trade card to generate a shareable P&L image.</li>
			<li>Edit or delete a trade by opening it and using the action buttons.</li>
		</ul>
	</div>
{/snippet}
<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-8xl space-y-4 p-4 md:p-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Trades</h1>
				<p class="text-sm text-muted-foreground">Create and manage your trades.</p>
			</div>
			<Button
				onclick={openCreate}
				variant="default"
				class="cursor-pointer rounded-md"
				disabled={!session || !accountStore.activeAccountId}
			>
				<PlusIcon />
				New Trade
			</Button>
		</div>

		{#if !loading && !session}
			<div class="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
				Sign in with Supabase Auth to load and create trades. Your user must have a row in
				<code class="rounded bg-muted px-1">app.profiles</code> for inserts (FK).
			</div>
		{/if}

		{#if !loading && session && !accountStore.activeAccountId}
			<div class="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
				Choose an account from the sidebar to load and create trades for that account.
			</div>
		{/if}

		{#if dailyLossStatus}
			<DailyLossBanner status={dailyLossStatus} />
		{/if}

		<div class="flex flex-wrap items-center gap-3">
			<div class="relative w-full max-w-sm">
				<Input
					type="text"
					placeholder="Search trades..."
					class="pl-9 rounded-md"
					bind:value={searchQuery}
					disabled={!session || !accountStore.activeAccountId}
				/>
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<MagnifyingGlassIcon size={16} class="text-muted-foreground" />
				</div>
			</div>
			<Select.Root type="single" bind:value={directionFilter}>
				<Select.Trigger class="w-[160px] rounded-md cursor-pointer" disabled={!session || !accountStore.activeAccountId}>
					<FunnelIcon size={16} class="text-muted-foreground" />
					<span class="capitalize">{directionFilter === "all" ? "All sides" : directionFilter}</span>
				</Select.Trigger>
				<Select.Content class="rounded-md">
					<Select.Item value="all" class="cursor-pointer">All sides</Select.Item>
					<Select.Item value="long" class="cursor-pointer">
						<ChartLineUpIcon class="mr-2 h-4 w-4" />
						Long
					</Select.Item>
					<Select.Item value="short" class="cursor-pointer">
						<ChartLineDownIcon class="mr-2 h-4 w-4" />
						Short
					</Select.Item>
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={statusFilter}>
				<Select.Trigger class="w-[160px] rounded-md cursor-pointer" disabled={!session || !accountStore.activeAccountId}>
					<PulseIcon class="mr-2 h-4 w-4" />
					<span class="capitalize">
						{statusFilter === "all" ? "All statuses" : statusFilter}
					</span>
				</Select.Trigger>
				<Select.Content class="rounded-md">
					<Select.Item value="all" class="cursor-pointer">All statuses</Select.Item>
					<Select.Item value="open" class="cursor-pointer">
						<CaretUpIcon size={16} />
						Open
					</Select.Item>
					<Select.Item value="closed" class="cursor-pointer">
						<CaretDownIcon size={16} />
						Closed
					</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>

		<TradeStatsCards {stats} total={tradeStore.total} {loading} />

		{#if isFundedPropFirm}
			<PropFirmPanel {propFirmStats} onaddpayout={() => (payoutSheetOpen = true)} />
		{/if}

		<TradesList
			trades={filteredTrades}
			{loading}
			{session}
			bind:viewMode
			total={tradeStore.total}
			pageSize={PAGE_SIZE}
			{currentPage}
			onview={openDetailSheet}
			onshare={openShareSheet}
			onedit={openEdit}
			onpage={goToPage}
		/>

		<TradeFormDialog bind:open={tradeFormOpen} editingTrade={editingTrade} {session} />

		<TradeDetailSheet bind:open={detailSheetOpen} trade={detailTrade} onedit={openEdit} />

		{#if sharingTrade}
			{@const t = sharingTrade}
			<PnlShareDialog
				variant="trade"
				bind:open={shareSheetOpen}
				symbol={t.symbol}
				side={normalizeSide(t.side)}
				status={t.status}
				pnl={num(t.pnl) ?? null}
				entryPrice={num(t.entry_price) ?? null}
				exitPrice={num(t.exit_price) ?? null}
				quantity={num(t.quantity) ?? null}
				rr={rowRiskReward(t)}
				openedAt={t.opened_at}
				closedAt={t.closed_at}
			/>
		{/if}
	</div>
</ScrollArea>

<PayoutSheet bind:open={payoutSheetOpen} />
