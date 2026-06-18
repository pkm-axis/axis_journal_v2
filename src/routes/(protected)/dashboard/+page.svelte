<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Button } from "$lib/components/ui/button";
	import { ArrowRightIcon, ChartLineDownIcon, ChartLineUpIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { toast } from "svelte-sonner";
	import PropFirmRules from "$lib/components/dashboard/prop-firm-rules.svelte";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input";

	let session = $state<{ user: { id: string } } | null>(null);
	const loading = $derived(tradeStore.loading);
	const trades = $derived(tradeStore.trades);

	function num(v: unknown): number | null {
		if (v == null || v === "") return null;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : null;
	}

	function fmtUsd(v: number | null, sign = false) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD",
			signDisplay: sign ? "exceptZero" : "auto",
		}).format(v);
	}

	function fmtWhen(iso: string | null | undefined) {
		if (!iso) return "—";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "—";
		return new Intl.DateTimeFormat(undefined, {
			month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
		}).format(d);
	}

	function normalizeSide(side: string | null | undefined): "long" | "short" | null {
		if (!side) return null;
		const s = String(side).toLowerCase();
		return s === "long" || s === "short" ? s : null;
	}

	const stats = $derived.by(() => {
		const closed = trades.filter((t) => t.status === "closed");
		const open = trades.filter((t) => t.status === "open");
		const netPnl = closed.reduce((a, t) => a + (num(t.pnl) ?? 0), 0);
		const wins = closed.filter((t) => (num(t.pnl) ?? 0) > 0).length;
		const winRate = closed.length > 0 ? wins / closed.length : null;
		return {
			total: trades.length,
			closedCount: closed.length,
			openCount: open.length,
			netPnl,
			winRate,
		};
	});

	/** Cumulative P&L by close date — sorted oldest → newest. */
	const equityCurve = $derived.by(() => {
		const closed = trades
			.filter((t) => t.status === "closed" && t.closed_at)
			.map((t) => ({ at: new Date(t.closed_at!).getTime(), pnl: num(t.pnl) ?? 0 }))
			.filter((p) => Number.isFinite(p.at))
			.sort((a, b) => a.at - b.at);

		let cum = 0;
		const points = closed.map((p) => {
			cum += p.pnl;
			return { at: p.at, cum };
		});
		return points;
	});

	/** Build SVG path data from equityCurve points; returns null if too few points. */
	const equityPath = $derived.by(() => {
		const pts = equityCurve;
		if (pts.length < 2) return null;
		const minCum = Math.min(0, ...pts.map((p) => p.cum));
		const maxCum = Math.max(0, ...pts.map((p) => p.cum));
		const range = maxCum - minCum || 1;
		const w = 100;
		const h = 40;
		// X by index for even spacing, more honest for sparse data
		const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
		const ys = pts.map((p) => h - ((p.cum - minCum) / range) * h);
		const d = pts.map((_, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(2)},${ys[i].toFixed(2)}`).join(" ");
		const zeroY = h - ((0 - minCum) / range) * h;
		// Area fill path
		const area = `${d} L${w},${h} L0,${h} Z`;
		const finalCum = pts[pts.length - 1].cum;
		return { d, area, zeroY, finalCum };
	});

	const activeAccount = $derived(
		accountStore.accounts.find((a) => a.id === accountStore.activeAccountId) ?? null
	);

	let graduateOpen = $state(false);
	let graduateName = $state("");
	let graduatePhase = $state("Funded");
	let graduateBalance = $state("");
	let graduateMaxDrawdown = $state("");
	let graduateDailyLoss = $state("");
	let graduateMaxContracts = $state("");
	let graduateConsistency = $state("");
	let graduateMinPayout = $state("");
	let graduateProfitSplit = $state("");
	let graduateSaving = $state(false);
	let graduateError = $state<string | null>(null);

	function openGraduate() {
		if (!activeAccount) return;
		graduateName = `${activeAccount.name} (Funded)`;
		graduatePhase = "Funded";
		graduateBalance = activeAccount.starting_balance != null ? String(activeAccount.starting_balance) : "";
		graduateMaxDrawdown = activeAccount.prop_firm_max_drawdown != null ? String(activeAccount.prop_firm_max_drawdown) : "";
		graduateDailyLoss = activeAccount.prop_firm_daily_loss_limit != null ? String(activeAccount.prop_firm_daily_loss_limit) : "";
		graduateMaxContracts = activeAccount.prop_firm_max_contracts ?? "";
		graduateConsistency = activeAccount.prop_firm_consistency_rule ?? "";
		graduateMinPayout = "";
		graduateProfitSplit = "";
		graduateError = null;
		graduateOpen = true;
	}

	function numOrNull(v: unknown): number | null {
		const n = parseFloat(String(v));
		return Number.isFinite(n) ? n : null;
	}

	function strOrNull(v: unknown): string | null {
		const t = String(v ?? "").trim();
		return t ? t : null;
	}

	async function submitGraduate() {
		if (!activeAccount) return;
		const name = graduateName.trim();
		if (!name) {
			graduateError = "Name is required.";
			return;
		}
		graduateSaving = true;
		graduateError = null;
		try {
			await accountStore.createAccount(supabase, {
				name,
				account_type: "prop firm",
				starting_balance: numOrNull(graduateBalance),
				prop_firm_name: activeAccount.prop_firm_name ?? null,
				prop_firm_type: strOrNull(graduatePhase),
				prop_firm_profit_target: numOrNull(graduateMinPayout),
				prop_firm_max_drawdown: numOrNull(graduateMaxDrawdown),
				prop_firm_daily_loss_limit: numOrNull(graduateDailyLoss),
				prop_firm_consistency_rule: strOrNull(graduateConsistency),
				prop_firm_max_contracts: strOrNull(graduateMaxContracts),
				parent_account_id: activeAccount.id,
				profit_split: graduateProfitSplit ? parseFloat(String(graduateProfitSplit)) / 100 : null,
			});
			const newest = accountStore.accounts[accountStore.accounts.length - 1];
			if (newest) accountStore.setActiveAccountId(newest.id);
			graduateOpen = false;
			toast.success(`${name} created. Welcome to funded!`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to create funded account.");
			graduateError = e instanceof Error ? e.message : "Failed to create funded account.";
		} finally {
			graduateSaving = false;
		}
	}

	const recentTrades = $derived.by(() => {
		return [...trades]
			.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
			.slice(0, 5);
	});

	onMount(async () => {
		const { data: { session: s } } = await supabase.auth.getSession();
		session = s;
	});

	$effect(() => {
		if (!session?.user?.id) return;
		void accountStore.activeAccountId;
		void tradeStore.getTradesByAccount(supabase);
	});
</script>

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Page>Dashboard</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">The Dashboard gives you a real-time overview of your active trading account.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Switch between accounts using the account selector in the sidebar.</li>
			<li>The top cards show today's P&L, total trades, win rate, and average R.</li>
			<li>Recent trades are listed below — click any trade to view its details.</li>
			<li>Prop firm rules (if applicable) are displayed as a live progress tracker.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-8xl space-y-4 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
			<p class="text-sm text-muted-foreground">Overview of the active account.</p>
		</div>

		{#if !loading && !accountStore.activeAccountId}
			<div class="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
				Choose an account from the sidebar to load its dashboard.
			</div>
		{/if}

		<!-- Prop firm rules (also shown for paper trading accounts) -->
		{#if activeAccount && (activeAccount.account_type === "prop firm" || activeAccount.account_type === "paper trading") && !loading}
			{@const isPropFirm = activeAccount.account_type === "prop firm"}
			{@const fundedChild = accountStore.accounts.find((a) => a.parent_account_id === activeAccount.id) ?? null}
			<PropFirmRules
				account={activeAccount}
				{trades}
				onGraduate={isPropFirm && !fundedChild ? openGraduate : undefined}
				graduatedTo={isPropFirm ? fundedChild : null}
				onSwitchToGraduated={() => fundedChild && accountStore.setActiveAccountId(fundedChild.id)}
			/>
		{/if}

		<!-- Stat cards -->
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#if loading}
				{#each [0, 1, 2, 3] as _}
					<div class="rounded-md border bg-background p-4">
						<Skeleton class="h-3 w-24" />
						<Skeleton class="mt-2 h-7 w-28" />
					</div>
				{/each}
			{:else}
				<div class={[
					"rounded-md border p-4",
					stats.netPnl > 0 && "border-emerald-700/30 bg-emerald-700/5",
					stats.netPnl < 0 && "border-rose-700/30 bg-rose-700/5",
				]}>
					<div class="text-xs text-muted-foreground">Net P&L</div>
					<div class={[
						"mt-1 text-2xl font-semibold tabular-nums",
						stats.netPnl > 0 && "text-emerald-700 dark:text-emerald-400",
						stats.netPnl < 0 && "text-rose-700 dark:text-rose-400",
					]}>
						{stats.closedCount === 0 ? "—" : fmtUsd(stats.netPnl)}
					</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Win rate</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">
						{stats.winRate == null ? "—" : `${Math.round(stats.winRate * 100)}%`}
					</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Total trades</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">{stats.total}</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Open positions</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">{stats.openCount}</div>
				</div>
			{/if}
		</div>

		<!-- Equity curve -->
		<div class="rounded-md border bg-background">
			<div class="flex items-center justify-between border-b px-4 py-3">
				<div>
					<div class="text-sm font-medium">Equity curve</div>
					<div class="text-xs text-muted-foreground">Cumulative P&L from closed trades.</div>
				</div>
				{#if !loading && equityPath}
					<div class={[
						"text-sm font-semibold tabular-nums",
						equityPath.finalCum > 0 && "text-emerald-700 dark:text-emerald-400",
						equityPath.finalCum < 0 && "text-rose-700 dark:text-rose-400",
					]}>
						{fmtUsd(equityPath.finalCum, true)}
					</div>
				{/if}
			</div>

			{#if loading}
				<div class="p-4">
					<Skeleton class="h-40 w-full" />
				</div>
			{:else if !equityPath}
				<div class="p-10 text-center text-sm text-muted-foreground">
					Need at least two closed trades to plot a curve.
				</div>
			{:else}
				<div class="p-4">
					<svg viewBox="0 0 100 40" preserveAspectRatio="none" class="h-48 w-full">
						<line
							x1="0" x2="100"
							y1={equityPath.zeroY} y2={equityPath.zeroY}
							stroke="currentColor"
							stroke-opacity="0.15"
							stroke-width="0.3"
							stroke-dasharray="0.6 0.6"
						/>
						<path
							d={equityPath.area}
							fill={equityPath.finalCum >= 0 ? "rgb(4 120 87 / 0.15)" : "rgb(190 18 60 / 0.15)"}
						/>
						<path
							d={equityPath.d}
							fill="none"
							stroke={equityPath.finalCum >= 0 ? "rgb(4 120 87)" : "rgb(190 18 60)"}
							stroke-width="0.5"
							stroke-linejoin="round"
							vector-effect="non-scaling-stroke"
						/>
					</svg>
				</div>
			{/if}
		</div>

		<!-- Recent trades -->
		<div class="rounded-md border bg-background">
			<div class="flex items-center justify-between border-b px-4 py-3">
				<div class="text-sm font-medium">Recent trades</div>
				<a href="/trades" class="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
					View all <ArrowRightIcon size={12} />
				</a>
			</div>

			{#if loading}
				<div class="divide-y">
					{#each [0, 1, 2, 3, 4] as _}
						<div class="flex items-center gap-4 px-4 py-3">
							<Skeleton class="h-3.5 w-14" />
							<Skeleton class="h-5 w-12 rounded-md" />
							<Skeleton class="h-5 w-14 rounded-md" />
							<Skeleton class="ml-auto h-3.5 w-20" />
							<Skeleton class="h-3.5 w-16" />
						</div>
					{/each}
				</div>
			{:else if recentTrades.length === 0}
				<div class="p-10 text-center text-sm text-muted-foreground">
					No trades yet. <a href="/trades" class="text-primary hover:underline">Create one</a>.
				</div>
			{:else}
				<ul class="divide-y">
					{#each recentTrades as t (t.id)}
						{@const side = normalizeSide(t.side)}
						{@const pnl = num(t.pnl)}
						<li class="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
							<div class="text-sm font-medium w-16">{t.symbol}</div>
							<div class="w-16">
								{#if side === "long"}
									<span class="inline-flex items-center gap-1 rounded-md bg-emerald-700/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
										<ChartLineUpIcon size={12} /> Long
									</span>
								{:else if side === "short"}
									<span class="inline-flex items-center gap-1 rounded-md bg-rose-700/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">
										<ChartLineDownIcon size={12} /> Short
									</span>
								{/if}
							</div>
							<span class={[
								"inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize",
								t.status === "open"
									? "bg-amber-700/10 text-amber-700 dark:text-amber-400"
									: "bg-muted text-muted-foreground",
							]}>
								{t.status}
							</span>
							<div class="ml-auto text-xs tabular-nums text-muted-foreground">
								{fmtWhen(t.opened_at)}
							</div>
							<div class={[
								"text-sm font-semibold tabular-nums w-20 text-right",
								pnl != null && pnl > 0 && "text-emerald-700 dark:text-emerald-400",
								pnl != null && pnl < 0 && "text-rose-700 dark:text-rose-400",
								(pnl == null || pnl === 0) && "text-muted-foreground",
							]}>
								{t.status === "closed" ? fmtUsd(pnl) : "—"}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Quick links -->
		<div class="grid gap-3 sm:grid-cols-3">
			<a href="/tools/pnl-calendar" class="rounded-md border bg-background p-4 hover:border-foreground/30 cursor-pointer transition-colors">
				<div class="text-sm font-medium">P&L Calendar</div>
				<div class="mt-1 text-xs text-muted-foreground">See daily performance month over month.</div>
			</a>
			<a href="/tools/expectancy" class="rounded-md border bg-background p-4 hover:border-foreground/30 cursor-pointer transition-colors">
				<div class="text-sm font-medium">Expectancy</div>
				<div class="mt-1 text-xs text-muted-foreground">What your edge is worth per trade.</div>
			</a>
			<a href="/analytics" class="rounded-md border bg-background p-4 hover:border-foreground/30 cursor-pointer transition-colors">
				<div class="text-sm font-medium">Analytics</div>
				<div class="mt-1 text-xs text-muted-foreground">Symbol, side, strategy, mistake breakdowns.</div>
			</a>
		</div>
	</div>
</ScrollArea>

<Dialog.Root bind:open={graduateOpen}>
	<Dialog.Content class="sm:max-w-lg max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Graduate to funded</Dialog.Title>
			<Dialog.Description>
				Create a new funded account linked to this evaluation. Adjust the rules to match your funded contract.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Account name</div>
				<Input bind:value={graduateName} class="rounded-md" />
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Phase</div>
					<Input bind:value={graduatePhase} placeholder="Funded" class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Starting balance</div>
					<Input bind:value={graduateBalance} type="number" inputmode="decimal" class="rounded-md" />
				</div>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Max drawdown ($)</div>
					<Input bind:value={graduateMaxDrawdown} type="number" inputmode="decimal" class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Daily loss limit ($)</div>
					<Input bind:value={graduateDailyLoss} type="number" inputmode="decimal" class="rounded-md" />
				</div>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Max contracts</div>
					<Input bind:value={graduateMaxContracts} class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Consistency rule</div>
					<Input bind:value={graduateConsistency} placeholder="e.g. 30%" class="rounded-md" />
				</div>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Min. payout threshold ($)</div>
					<Input bind:value={graduateMinPayout} type="number" inputmode="decimal" placeholder="e.g. 2000" class="rounded-md" />
					<p class="text-[11px] text-muted-foreground">Minimum profit before you can request a payout.</p>
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Profit split (%)</div>
					<Input bind:value={graduateProfitSplit} type="number" inputmode="decimal" placeholder="e.g. 80" class="rounded-md" />
					<p class="text-[11px] text-muted-foreground">Your share of profits on payouts.</p>
				</div>
			</div>
			<p class="text-[11px] text-muted-foreground">
				The new account will be linked to "{activeAccount?.name}".
			</p>

			{#if graduateError}
				<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{graduateError}
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (graduateOpen = false)}>Cancel</Button>
			<Button class="rounded-md cursor-pointer bg-emerald-700 hover:bg-emerald-800 text-white" disabled={graduateSaving || !graduateName.trim()} onclick={submitGraduate}>
				{graduateSaving ? "Creating…" : "Create funded account"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
