<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Input } from "$lib/components/ui/input";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";

	let session = $state<{ user: { id: string } } | null>(null);
	const loading = $derived(tradeStore.loading);

	function num(v: unknown): number | null {
		if (v == null || v === "") return null;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : null;
	}

	const realStats = $derived.by(() => {
		const closed = tradeStore.trades.filter((t) => t.status === "closed");
		const wins: number[] = [];
		const losses: number[] = []; // stored as positive magnitudes
		let breakeven = 0;

		for (const t of closed) {
			const pnl = num(t.pnl) ?? 0;
			if (pnl > 0) wins.push(pnl);
			else if (pnl < 0) losses.push(Math.abs(pnl));
			else breakeven++;
		}

		const total = closed.length;
		const winCount = wins.length;
		const lossCount = losses.length;
		const winRate = total > 0 ? winCount / total : 0;
		const lossRate = total > 0 ? lossCount / total : 0;
		const avgWin = winCount > 0 ? wins.reduce((a, b) => a + b, 0) / winCount : 0;
		const avgLoss = lossCount > 0 ? losses.reduce((a, b) => a + b, 0) / lossCount : 0;
		const expectancy = winRate * avgWin - lossRate * avgLoss;
		const grossProfit = wins.reduce((a, b) => a + b, 0);
		const grossLoss = losses.reduce((a, b) => a + b, 0);
		const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
		const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : null;

		return {
			total, winCount, lossCount, breakeven,
			winRate, avgWin, avgLoss,
			expectancy, profitFactor, payoffRatio,
		};
	});

	// Simulator inputs — initialize from real stats once loaded
	let simWinRate = $state("50");
	let simAvgWin = $state("200");
	let simAvgLoss = $state("100");
	let simTradesPerMonth = $state("20");

	function fillFromRealStats() {
		if (realStats.total === 0) return;
		simWinRate = (realStats.winRate * 100).toFixed(1);
		simAvgWin = realStats.avgWin.toFixed(2);
		simAvgLoss = realStats.avgLoss.toFixed(2);
	}

	const simExpectancy = $derived.by(() => {
		const wr = num(simWinRate);
		const aw = num(simAvgWin);
		const al = num(simAvgLoss);
		if (wr == null || aw == null || al == null) return null;
		const p = Math.max(0, Math.min(100, wr)) / 100;
		return p * aw - (1 - p) * al;
	});

	const simMonthly = $derived.by(() => {
		const trades = num(simTradesPerMonth);
		if (simExpectancy == null || trades == null) return null;
		return simExpectancy * trades;
	});

	const simRR = $derived.by(() => {
		const aw = num(simAvgWin);
		const al = num(simAvgLoss);
		if (aw == null || al == null || al <= 0) return null;
		return aw / al;
	});

	function fmtUsd(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD", signDisplay: "exceptZero",
		}).format(v);
	}

	function fmtUsdPlain(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v);
	}

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

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Tools</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Expectancy</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Expectancy</h1>
			<p class="text-sm text-muted-foreground">
				What you can expect to make per trade, on average. Computed as
				<code class="rounded bg-muted px-1 text-[11px]">(win rate × avg win) − (loss rate × avg loss)</code>.
			</p>
		</div>

		<!-- From real trades -->
		<section class="space-y-3">
			<div class="flex items-end justify-between">
				<div>
					<h2 class="text-lg font-semibold">From your closed trades</h2>
					<p class="text-xs text-muted-foreground">
						{loading
							? "Loading…"
							: realStats.total === 0
								? "No closed trades yet — try the simulator below."
								: `Based on ${realStats.total} closed trade${realStats.total === 1 ? "" : "s"}.`}
					</p>
				</div>
				{#if !loading && realStats.total > 0}
					<button
						type="button"
						class="text-xs text-primary underline-offset-2 hover:underline cursor-pointer"
						onclick={fillFromRealStats}
					>
						Use these in simulator
					</button>
				{/if}
			</div>

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
						realStats.expectancy > 0 && "border-emerald-700/30 bg-emerald-700/5",
						realStats.expectancy < 0 && "border-rose-700/30 bg-rose-700/5",
					]}>
						<div class="text-xs text-muted-foreground">Expectancy / trade</div>
						<div class={[
							"mt-1 text-2xl font-semibold tabular-nums",
							realStats.expectancy > 0 && "text-emerald-700 dark:text-emerald-400",
							realStats.expectancy < 0 && "text-rose-700 dark:text-rose-400",
						]}>
							{realStats.total === 0 ? "—" : fmtUsd(realStats.expectancy)}
						</div>
					</div>
					<div class="rounded-md border bg-background p-4">
						<div class="text-xs text-muted-foreground">Win rate</div>
						<div class="mt-1 text-2xl font-semibold tabular-nums">
							{realStats.total === 0 ? "—" : `${(realStats.winRate * 100).toFixed(1)}%`}
						</div>
					</div>
					<div class="rounded-md border bg-background p-4">
						<div class="text-xs text-muted-foreground">Avg win</div>
						<div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
							{realStats.winCount === 0 ? "—" : fmtUsdPlain(realStats.avgWin)}
						</div>
					</div>
					<div class="rounded-md border bg-background p-4">
						<div class="text-xs text-muted-foreground">Avg loss</div>
						<div class="mt-1 text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
							{realStats.lossCount === 0 ? "—" : fmtUsdPlain(realStats.avgLoss)}
						</div>
					</div>
				{/if}
			</div>

			<div class="grid gap-3 sm:grid-cols-3">
				{#if loading}
					{#each [0, 1, 2] as _}
						<div class="rounded-md border bg-background p-4">
							<Skeleton class="h-3 w-24" />
							<Skeleton class="mt-2 h-6 w-20" />
							<Skeleton class="mt-2 h-2.5 w-40" />
						</div>
					{/each}
				{:else if realStats.total > 0}
					<div class="rounded-md border bg-background p-4">
						<div class="text-xs text-muted-foreground">Profit factor</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{realStats.profitFactor == null ? "—" : realStats.profitFactor.toFixed(2)}
						</div>
						<div class="mt-1 text-[11px] text-muted-foreground">Gross profit ÷ gross loss. &gt; 1 is profitable.</div>
					</div>
					<div class="rounded-md border bg-background p-4">
						<div class="text-xs text-muted-foreground">Payoff ratio</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							{realStats.payoffRatio == null ? "—" : `1:${realStats.payoffRatio.toFixed(2)}`}
						</div>
						<div class="mt-1 text-[11px] text-muted-foreground">Avg win ÷ avg loss.</div>
					</div>
					<div class="rounded-md border bg-background p-4">
						<div class="text-xs text-muted-foreground">Wins / losses / BE</div>
						<div class="mt-1 text-xl font-semibold tabular-nums">
							<span class="text-emerald-700 dark:text-emerald-400">{realStats.winCount}</span>
							<span class="text-muted-foreground"> · </span>
							<span class="text-rose-700 dark:text-rose-400">{realStats.lossCount}</span>
							<span class="text-muted-foreground"> · </span>
							<span class="text-muted-foreground">{realStats.breakeven}</span>
						</div>
					</div>
				{/if}
			</div>
		</section>

		<!-- Simulator -->
		<section class="space-y-3">
			<div>
				<h2 class="text-lg font-semibold">Simulator</h2>
				<p class="text-xs text-muted-foreground">
					Try different win rates and risk/reward profiles to see what they imply.
				</p>
			</div>

			<div class="grid gap-4 lg:grid-cols-[1fr_1fr]">
				<!-- Inputs -->
				<div class="rounded-md border bg-background p-4 space-y-4">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Win rate (%)</div>
						<Input bind:value={simWinRate} inputmode="decimal" placeholder="e.g. 50" class="rounded-md" />
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Avg win ($)</div>
							<Input bind:value={simAvgWin} inputmode="decimal" placeholder="e.g. 200" class="rounded-md" />
						</div>
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Avg loss ($)</div>
							<Input bind:value={simAvgLoss} inputmode="decimal" placeholder="e.g. 100" class="rounded-md" />
						</div>
					</div>
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Trades per month</div>
						<Input bind:value={simTradesPerMonth} inputmode="decimal" placeholder="e.g. 20" class="rounded-md" />
					</div>
				</div>

				<!-- Outputs -->
				<div class="rounded-md border bg-muted/20 p-4 space-y-4">
					<div>
						<div class="text-xs text-muted-foreground">Expectancy / trade</div>
						<div class={[
							"mt-1 text-3xl font-bold tabular-nums",
							simExpectancy != null && simExpectancy > 0 && "text-emerald-700 dark:text-emerald-400",
							simExpectancy != null && simExpectancy < 0 && "text-rose-700 dark:text-rose-400",
						]}>
							{fmtUsd(simExpectancy)}
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div>
							<div class="text-xs text-muted-foreground">Risk/Reward</div>
							<div class="mt-1 text-lg font-semibold tabular-nums">
								{simRR == null ? "—" : `1:${simRR.toFixed(2)}`}
							</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Expected monthly</div>
							<div class={[
								"mt-1 text-lg font-semibold tabular-nums",
								simMonthly != null && simMonthly > 0 && "text-emerald-700 dark:text-emerald-400",
								simMonthly != null && simMonthly < 0 && "text-rose-700 dark:text-rose-400",
							]}>
								{fmtUsd(simMonthly)}
							</div>
						</div>
					</div>

					{#if simExpectancy != null && simExpectancy < 0}
						<div class="rounded-md border border-rose-700/30 bg-rose-700/5 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-400">
							Negative expectancy — at this win rate and R:R, you lose money over time.
						</div>
					{:else if simExpectancy != null && simExpectancy === 0}
						<div class="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
							Break-even — no edge.
						</div>
					{/if}
				</div>
			</div>
		</section>
	</div>
</ScrollArea>
