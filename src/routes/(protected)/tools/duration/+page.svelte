<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";

	let session = $state<{ user: { id: string } } | null>(null);
	const loading = $derived(tradeStore.loading);

	const MIN = 60 * 1000;
	const HOUR = 60 * MIN;
	const DAY = 24 * HOUR;

	type Bucket = { label: string; min: number; max: number };
	const BUCKETS: Bucket[] = [
		{ label: "< 1h (scalp)", min: 0, max: HOUR },
		{ label: "1–4h (intraday)", min: HOUR, max: 4 * HOUR },
		{ label: "4–24h (day)", min: 4 * HOUR, max: DAY },
		{ label: "1–7d (swing)", min: DAY, max: 7 * DAY },
		{ label: "7d+ (position)", min: 7 * DAY, max: Infinity },
	];

	function num(v: unknown): number | null {
		if (v == null || v === "") return null;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : null;
	}

	function formatDuration(ms: number | null) {
		if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
		if (ms < HOUR) return `${Math.round(ms / MIN)}m`;
		if (ms < DAY) {
			const h = Math.floor(ms / HOUR);
			const m = Math.round((ms % HOUR) / MIN);
			return m === 0 ? `${h}h` : `${h}h ${m}m`;
		}
		const d = Math.floor(ms / DAY);
		const h = Math.round((ms % DAY) / HOUR);
		return h === 0 ? `${d}d` : `${d}d ${h}h`;
	}

	function fmtUsd(v: number | null, sign = true) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD",
			signDisplay: sign ? "exceptZero" : "auto",
		}).format(v);
	}

	type Row = { duration: number; pnl: number };

	const closedRows = $derived.by((): Row[] => {
		const rows: Row[] = [];
		for (const t of tradeStore.trades) {
			if (t.status !== "closed" || !t.closed_at) continue;
			const opened = new Date(t.opened_at).getTime();
			const closed = new Date(t.closed_at).getTime();
			if (!Number.isFinite(opened) || !Number.isFinite(closed)) continue;
			const dur = closed - opened;
			if (dur < 0) continue;
			rows.push({ duration: dur, pnl: num(t.pnl) ?? 0 });
		}
		return rows;
	});

	const summary = $derived.by(() => {
		const rows = closedRows;
		if (rows.length === 0) {
			return { count: 0, avg: null, median: null, winnerAvg: null, loserAvg: null };
		}
		const durations = rows.map((r) => r.duration).sort((a, b) => a - b);
		const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
		const mid = Math.floor(durations.length / 2);
		const median = durations.length % 2 === 0
			? (durations[mid - 1] + durations[mid]) / 2
			: durations[mid];

		const winners = rows.filter((r) => r.pnl > 0).map((r) => r.duration);
		const losers = rows.filter((r) => r.pnl < 0).map((r) => r.duration);
		const winnerAvg = winners.length > 0 ? winners.reduce((a, b) => a + b, 0) / winners.length : null;
		const loserAvg = losers.length > 0 ? losers.reduce((a, b) => a + b, 0) / losers.length : null;

		return { count: rows.length, avg, median, winnerAvg, loserAvg };
	});

	const bucketStats = $derived.by(() => {
		const rows = closedRows;
		const stats = BUCKETS.map((b) => {
			const inBucket = rows.filter((r) => r.duration >= b.min && r.duration < b.max);
			const wins = inBucket.filter((r) => r.pnl > 0).length;
			const totalPnl = inBucket.reduce((a, r) => a + r.pnl, 0);
			return {
				label: b.label,
				count: inBucket.length,
				winRate: inBucket.length > 0 ? wins / inBucket.length : null,
				avgPnl: inBucket.length > 0 ? totalPnl / inBucket.length : null,
				totalPnl,
			};
		});
		const maxCount = Math.max(1, ...stats.map((s) => s.count));
		return stats.map((s) => ({ ...s, pct: s.count / maxCount }));
	});

	const totalCount = $derived(closedRows.length);

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
			<Breadcrumb.Item>Tools</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Trade Duration</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">Trade Duration analyses how long you hold positions and whether hold time correlates with profitability.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Charts bucket your trades by duration (seconds, minutes, hours).</li>
			<li>See whether your winners tend to be held longer or shorter than your losers.</li>
			<li>Use this to refine your exit rules and holding time targets.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-4 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Trade Duration</h1>
			<p class="text-sm text-muted-foreground">
				How long you hold trades and how that maps to performance. Closed trades only.
			</p>
		</div>

		<!-- Summary stats -->
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#if loading}
				{#each [0, 1, 2, 3] as _}
					<div class="rounded-md border bg-background p-4">
						<Skeleton class="h-3 w-24" />
						<Skeleton class="mt-2 h-7 w-20" />
					</div>
				{/each}
			{:else}
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Average</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">{formatDuration(summary.avg)}</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Median</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">{formatDuration(summary.median)}</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Winners avg</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
						{formatDuration(summary.winnerAvg)}
					</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Losers avg</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
						{formatDuration(summary.loserAvg)}
					</div>
				</div>
			{/if}
		</div>

		<!-- Insight banner -->
		{#if !loading && summary.winnerAvg != null && summary.loserAvg != null}
			<div class={[
				"rounded-md border px-4 py-3 text-sm",
				summary.winnerAvg > summary.loserAvg
					? "border-emerald-700/30 bg-emerald-700/5 text-emerald-700 dark:text-emerald-400"
					: "border-amber-700/30 bg-amber-700/5 text-amber-700 dark:text-amber-400",
			]}>
				{#if summary.winnerAvg > summary.loserAvg}
					You let winners run — winners are held {formatDuration(summary.winnerAvg - summary.loserAvg)} longer than losers on average.
				{:else}
					Losers are held {formatDuration(summary.loserAvg - summary.winnerAvg)} longer than winners on average — consider cutting losers faster.
				{/if}
			</div>
		{/if}

		<!-- Distribution + performance by bucket -->
		<div class="rounded-md border bg-background">
			<div class="flex items-center justify-between border-b px-4 py-3">
				<div class="text-sm font-medium">By duration bucket</div>
				<div class="text-xs text-muted-foreground">
					{#if loading}Loading…{:else}{totalCount} closed trade{totalCount === 1 ? "" : "s"}{/if}
				</div>
			</div>

			{#if loading}
				<div class="divide-y">
					{#each [0, 1, 2, 3, 4] as _}
						<div class="flex items-center gap-4 px-4 py-3">
							<Skeleton class="h-3.5 w-32" />
							<Skeleton class="h-2 flex-1" />
							<Skeleton class="h-3.5 w-12" />
							<Skeleton class="h-3.5 w-12" />
							<Skeleton class="h-3.5 w-16" />
						</div>
					{/each}
				</div>
			{:else if totalCount === 0}
				<div class="p-10 text-center">
					<div class="text-sm font-medium">No closed trades yet</div>
					<div class="mt-1 text-sm text-muted-foreground">
						Close some trades to see duration analytics.
					</div>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
								<th class="whitespace-nowrap">Bucket</th>
								<th class="w-full">Distribution</th>
								<th class="text-right whitespace-nowrap">Trades</th>
								<th class="text-right whitespace-nowrap">Win rate</th>
								<th class="text-right whitespace-nowrap">Avg P&amp;L</th>
								<th class="text-right whitespace-nowrap">Total P&amp;L</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each bucketStats as b}
								<tr class="[&>td]:px-4 [&>td]:py-3">
									<td class="text-xs whitespace-nowrap font-medium">{b.label}</td>
									<td>
										<div class="h-2 w-full rounded-sm bg-muted">
											{#if b.count > 0}
												<div
													class={[
														"h-full rounded-sm",
														(b.avgPnl ?? 0) > 0 && "bg-emerald-700/60",
														(b.avgPnl ?? 0) < 0 && "bg-rose-700/60",
														(b.avgPnl == null || b.avgPnl === 0) && "bg-muted-foreground/40",
													]}
													style={`width:${b.pct * 100}%;`}
												></div>
											{/if}
										</div>
									</td>
									<td class="text-right tabular-nums text-xs">{b.count}</td>
									<td class="text-right tabular-nums text-xs">
										{b.winRate == null ? "—" : `${Math.round(b.winRate * 100)}%`}
									</td>
									<td class={[
										"text-right tabular-nums text-xs font-medium",
										(b.avgPnl ?? 0) > 0 && "text-emerald-700 dark:text-emerald-400",
										(b.avgPnl ?? 0) < 0 && "text-rose-700 dark:text-rose-400",
										(b.avgPnl == null || b.avgPnl === 0) && "text-muted-foreground",
									]}>
										{fmtUsd(b.avgPnl)}
									</td>
									<td class={[
										"text-right tabular-nums text-xs font-medium",
										b.totalPnl > 0 && "text-emerald-700 dark:text-emerald-400",
										b.totalPnl < 0 && "text-rose-700 dark:text-rose-400",
										b.totalPnl === 0 && "text-muted-foreground",
									]}>
										{b.count === 0 ? "—" : fmtUsd(b.totalPnl)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</ScrollArea>
