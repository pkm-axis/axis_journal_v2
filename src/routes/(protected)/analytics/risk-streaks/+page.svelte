<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { Button } from "$lib/components/ui/button";
	import { PnlShareDialog } from "$lib/components/pnl-share-sheet";
	import { ShareNetworkIcon } from "phosphor-svelte";

	let shareOpen = $state(false);

	function fmtUsdShare(v: number) {
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD", signDisplay: "exceptZero",
		}).format(v);
	}

	let session = $state<{ user: { id: string } } | null>(null);
	const loading = $derived(tradeStore.loading);

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

	function fmtPct(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return `${v.toFixed(2)}%`;
	}

	/** Closed trades, oldest → newest by close time. */
	const closedSorted = $derived.by(() => {
		return tradeStore.trades
			.filter((t) => t.status === "closed" && t.closed_at)
			.map((t) => ({
				closedAt: new Date(t.closed_at!).getTime(),
				openedAt: new Date(t.opened_at).getTime(),
				pnl: num(t.pnl) ?? 0,
				symbol: t.symbol,
			}))
			.filter((p) => Number.isFinite(p.closedAt))
			.sort((a, b) => a.closedAt - b.closedAt);
	});

	/** Drawdown & equity stats from cumulative P&L sequence. */
	const drawdown = $derived.by(() => {
		const rows = closedSorted;
		if (rows.length === 0) {
			return { maxDD: 0, maxDDPct: null, peak: 0, current: 0, currentDD: 0 };
		}
		let cum = 0;
		let peak = 0;
		let maxDD = 0;
		let peakAtMaxDD = 0;
		for (const r of rows) {
			cum += r.pnl;
			if (cum > peak) peak = cum;
			const dd = peak - cum;
			if (dd > maxDD) {
				maxDD = dd;
				peakAtMaxDD = peak;
			}
		}
		const maxDDPct = peakAtMaxDD > 0 ? (maxDD / peakAtMaxDD) * 100 : null;
		const currentDD = peak - cum;
		return { maxDD, maxDDPct, peak, current: cum, currentDD };
	});

	type Streak = { length: number; pnl: number; startedAt: number; endedAt: number };

	/** All winning and losing streaks, plus the current streak. */
	const streakInfo = $derived.by(() => {
		const rows = closedSorted;
		const wins: Streak[] = [];
		const losses: Streak[] = [];
		let active: Streak | null = null;
		let activeKind: "win" | "loss" | null = null;

		for (const r of rows) {
			const kind: "win" | "loss" | null = r.pnl > 0 ? "win" : r.pnl < 0 ? "loss" : null;
			if (kind == null) continue; // breakeven trades don't break streaks here
			if (activeKind === kind && active) {
				active.length++;
				active.pnl += r.pnl;
				active.endedAt = r.closedAt;
			} else {
				if (active && activeKind === "win") wins.push(active);
				if (active && activeKind === "loss") losses.push(active);
				active = { length: 1, pnl: r.pnl, startedAt: r.closedAt, endedAt: r.closedAt };
				activeKind = kind;
			}
		}
		if (active && activeKind === "win") wins.push(active);
		if (active && activeKind === "loss") losses.push(active);

		const longestWin = wins.reduce((max, s) => (s.length > max.length ? s : max), { length: 0, pnl: 0, startedAt: 0, endedAt: 0 });
		const longestLoss = losses.reduce((max, s) => (s.length > max.length ? s : max), { length: 0, pnl: 0, startedAt: 0, endedAt: 0 });
		const current = active != null ? { kind: activeKind, ...active } : null;

		return { wins, losses, longestWin, longestLoss, current };
	});

	/** Aggregate by month using close date. */
	const monthlyReturns = $derived.by(() => {
		const map = new Map<string, { pnl: number; count: number; wins: number; losses: number }>();
		for (const r of closedSorted) {
			const d = new Date(r.closedAt);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
			if (!map.has(key)) map.set(key, { pnl: 0, count: 0, wins: 0, losses: 0 });
			const b = map.get(key)!;
			b.count++;
			b.pnl += r.pnl;
			if (r.pnl > 0) b.wins++;
			else if (r.pnl < 0) b.losses++;
		}
		return Array.from(map.entries())
			.sort((a, b) => b[0].localeCompare(a[0])) // newest first
			.map(([key, v]) => ({ key, ...v }));
	});

	function fmtMonth(key: string) {
		const [y, m] = key.split("-").map(Number);
		const d = new Date(y, m - 1, 1);
		return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(d);
	}

	function fmtRange(startedAt: number, endedAt: number) {
		const s = new Date(startedAt);
		const e = new Date(endedAt);
		const fmt = (d: Date) =>
			new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d);
		return startedAt === endedAt ? fmt(s) : `${fmt(s)} → ${fmt(e)}`;
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

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Analytics</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Risk & Streaks</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">Risk & Streaks helps you understand your drawdown behaviour and win/loss streaks over time.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Charts are built from all closed trades on the selected account.</li>
			<li>The streak section shows your current and longest consecutive winning and losing runs.</li>
			<li>Use this page to assess whether your risk management holds up over a large sample of trades.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
		<div class="flex items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Risk & Streaks</h1>
				<p class="text-sm text-muted-foreground">
					Drawdown depth, winning and losing runs, and month-over-month returns.
				</p>
			</div>
			<Button
				variant="outline"
				size="sm"
				class="rounded-md cursor-pointer"
				onclick={() => (shareOpen = true)}
				disabled={loading || closedSorted.length === 0}
			>
				<ShareNetworkIcon size={16} />
				Share
			</Button>
		</div>

		<!-- Top-level stats -->
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#if loading}
				{#each [0, 1, 2, 3] as _}
					<div class="rounded-md border bg-background p-4">
						<Skeleton class="h-3 w-24" />
						<Skeleton class="mt-2 h-7 w-28" />
						<Skeleton class="mt-1 h-2.5 w-32" />
					</div>
				{/each}
			{:else}
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Max drawdown</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
						{drawdown.maxDD > 0 ? fmtUsd(-drawdown.maxDD, true) : "—"}
					</div>
					<div class="mt-1 text-[11px] text-muted-foreground">
						{drawdown.maxDDPct == null ? "" : `${fmtPct(-drawdown.maxDDPct)} of peak equity`}
					</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Current drawdown</div>
					<div class={[
						"mt-1 text-2xl font-semibold tabular-nums",
						drawdown.currentDD > 0 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400",
					]}>
						{drawdown.currentDD > 0 ? fmtUsd(-drawdown.currentDD, true) : "At highs"}
					</div>
					<div class="mt-1 text-[11px] text-muted-foreground">
						Peak: {fmtUsd(drawdown.peak)}
					</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Longest win streak</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
						{streakInfo.longestWin.length || "—"}
					</div>
					<div class="mt-1 text-[11px] text-muted-foreground">
						{streakInfo.longestWin.length > 0 ? `${fmtUsd(streakInfo.longestWin.pnl, true)} total` : ""}
					</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Longest loss streak</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
						{streakInfo.longestLoss.length || "—"}
					</div>
					<div class="mt-1 text-[11px] text-muted-foreground">
						{streakInfo.longestLoss.length > 0 ? `${fmtUsd(streakInfo.longestLoss.pnl, true)} total` : ""}
					</div>
				</div>
			{/if}
		</div>

		<!-- Current streak banner -->
		{#if !loading && streakInfo.current}
			{@const c = streakInfo.current}
			<div class={[
				"rounded-md border px-4 py-3 text-sm",
				c.kind === "win"
					? "border-emerald-700/30 bg-emerald-700/5 text-emerald-700 dark:text-emerald-400"
					: "border-rose-700/30 bg-rose-700/5 text-rose-700 dark:text-rose-400",
			]}>
				Current streak: <strong>{c.length} {c.kind === "win" ? "winners" : "losers"}</strong> in a row · {fmtUsd(c.pnl, true)} · since {fmtRange(c.startedAt, c.startedAt)}.
			</div>
		{/if}

		<!-- Monthly returns -->
		<section class="space-y-2">
			<div>
				<h2 class="text-lg font-semibold">Monthly returns</h2>
				<p class="text-xs text-muted-foreground">P&L grouped by close month, newest first.</p>
			</div>
			<div class="rounded-md border bg-background">
				{#if loading}
					<div class="divide-y">
						{#each [0, 1, 2, 3, 4] as _}
							<div class="flex items-center gap-4 px-4 py-3">
								<Skeleton class="h-3.5 w-32" />
								<Skeleton class="h-3.5 w-20" />
								<Skeleton class="h-3.5 w-12" />
								<Skeleton class="ml-auto h-3.5 w-16" />
							</div>
						{/each}
					</div>
				{:else if monthlyReturns.length === 0}
					<div class="p-10 text-center text-sm text-muted-foreground">
						No closed trades yet.
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead class="bg-muted/30 text-muted-foreground">
								<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
									<th class="text-left whitespace-nowrap">Month</th>
									<th class="text-left whitespace-nowrap">Trades</th>
									<th class="text-left whitespace-nowrap">Wins / Losses</th>
									<th class="text-left whitespace-nowrap">Win rate</th>
									<th class="text-left whitespace-nowrap">Net P&amp;L</th>
								</tr>
							</thead>
							<tbody class="[&>tr:not(:last-child)]:border-b">
								{#each monthlyReturns as m}
									{@const wr = m.count > 0 ? m.wins / m.count : null}
									<tr class="[&>td]:px-4 [&>td]:py-2 hover:bg-muted/30">
										<td class="text-xs font-medium tabular-nums">{fmtMonth(m.key)}</td>
										<td class="text-xs tabular-nums">{m.count}</td>
										<td class="text-xs tabular-nums">
											<span class="text-emerald-700 dark:text-emerald-400">{m.wins}</span>
											<span class="text-muted-foreground"> / </span>
											<span class="text-rose-700 dark:text-rose-400">{m.losses}</span>
										</td>
										<td class="text-xs tabular-nums">{wr == null ? "—" : `${Math.round(wr * 100)}%`}</td>
										<td class={[
											"text-xs font-medium tabular-nums",
											m.pnl > 0 && "text-emerald-700 dark:text-emerald-400",
											m.pnl < 0 && "text-rose-700 dark:text-rose-400",
											m.pnl === 0 && "text-muted-foreground",
										]}>
											{fmtUsd(m.pnl, true)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</section>

		<!-- Top streaks -->
		{#if !loading && (streakInfo.wins.length > 0 || streakInfo.losses.length > 0)}
			<section class="grid gap-4 lg:grid-cols-2">
				<div class="rounded-md border bg-background">
					<div class="border-b px-4 py-3">
						<div class="text-sm font-medium">Top winning streaks</div>
					</div>
					{#if streakInfo.wins.length === 0}
						<div class="p-10 text-center text-sm text-muted-foreground">No winning streaks yet.</div>
					{:else}
						<ul class="divide-y">
							{#each [...streakInfo.wins].sort((a, b) => b.length - a.length).slice(0, 5) as s}
								<li class="flex items-center justify-between gap-3 px-4 py-2.5">
									<div class="flex items-baseline gap-3">
										<div class="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{s.length}</div>
										<div class="text-xs text-muted-foreground">{fmtRange(s.startedAt, s.endedAt)}</div>
									</div>
									<div class="text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">{fmtUsd(s.pnl, true)}</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<div class="rounded-md border bg-background">
					<div class="border-b px-4 py-3">
						<div class="text-sm font-medium">Top losing streaks</div>
					</div>
					{#if streakInfo.losses.length === 0}
						<div class="p-10 text-center text-sm text-muted-foreground">No losing streaks yet.</div>
					{:else}
						<ul class="divide-y">
							{#each [...streakInfo.losses].sort((a, b) => b.length - a.length).slice(0, 5) as s}
								<li class="flex items-center justify-between gap-3 px-4 py-2.5">
									<div class="flex items-baseline gap-3">
										<div class="text-base font-semibold tabular-nums text-rose-700 dark:text-rose-400">{s.length}</div>
										<div class="text-xs text-muted-foreground">{fmtRange(s.startedAt, s.endedAt)}</div>
									</div>
									<div class="text-xs font-medium tabular-nums text-rose-700 dark:text-rose-400">{fmtUsd(s.pnl, true)}</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>
		{/if}
	</div>
</ScrollArea>

<PnlShareDialog
	bind:open={shareOpen}
	variant="analytics"
	title="Risk & Streaks"
	subtitle={`${closedSorted.length} closed ${closedSorted.length === 1 ? "trade" : "trades"}`}
	badge="RISK · STREAKS"
	headlineLabel="Max Drawdown"
	headlineValue={drawdown.maxDD > 0 ? fmtUsdShare(-drawdown.maxDD) : "—"}
	headlinePnl={drawdown.maxDD > 0 ? -drawdown.maxDD : null}
	stats={[
		{ label: "Current DD", value: drawdown.currentDD > 0 ? fmtUsdShare(-drawdown.currentDD) : "At highs", color: drawdown.currentDD > 0 ? "loss" : "win" },
		{ label: "Win streak", value: streakInfo.longestWin.length ? String(streakInfo.longestWin.length) : "—", color: "win" },
		{ label: "Loss streak", value: streakInfo.longestLoss.length ? String(streakInfo.longestLoss.length) : "—", color: "loss" },
	]}
	footnote={drawdown.maxDDPct == null ? null : `Max DD = ${(-drawdown.maxDDPct).toFixed(2)}% of peak equity`}
/>
