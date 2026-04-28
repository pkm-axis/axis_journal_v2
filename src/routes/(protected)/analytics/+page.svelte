<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { strategyStore } from "$lib/stores/strategies.svelte";
	import { mistakeStore } from "$lib/stores/mistakes.svelte";

	let session = $state<{ user: { id: string } } | null>(null);
	const loading = $derived(tradeStore.loading);

	const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

	function num(v: unknown): number | null {
		if (v == null || v === "") return null;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : null;
	}

	function normalizeSide(side: string | null | undefined): "long" | "short" | null {
		if (!side) return null;
		const s = String(side).toLowerCase();
		return s === "long" || s === "short" ? s : null;
	}

	function fmtUsd(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD", signDisplay: "exceptZero",
		}).format(v);
	}

	type Bucket = {
		label: string;
		count: number;
		wins: number;
		losses: number;
		pnl: number;
	};

	function buildBucket(label: string): Bucket {
		return { label, count: 0, wins: 0, losses: 0, pnl: 0 };
	}

	function feedBucket(b: Bucket, pnl: number) {
		b.count++;
		b.pnl += pnl;
		if (pnl > 0) b.wins++;
		else if (pnl < 0) b.losses++;
	}

	const closedTrades = $derived(tradeStore.trades.filter((t) => t.status === "closed"));

	// By symbol
	const bySymbol = $derived.by(() => {
		const map = new Map<string, Bucket>();
		for (const t of closedTrades) {
			const key = t.symbol || "—";
			if (!map.has(key)) map.set(key, buildBucket(key));
			feedBucket(map.get(key)!, num(t.pnl) ?? 0);
		}
		return Array.from(map.values()).sort((a, b) => b.pnl - a.pnl);
	});

	// By side
	const bySide = $derived.by(() => {
		const longs = buildBucket("Long");
		const shorts = buildBucket("Short");
		for (const t of closedTrades) {
			const s = normalizeSide(t.side);
			if (s === "long") feedBucket(longs, num(t.pnl) ?? 0);
			else if (s === "short") feedBucket(shorts, num(t.pnl) ?? 0);
		}
		return [longs, shorts];
	});

	// By day of week (uses opened_at)
	const byDayOfWeek = $derived.by(() => {
		const buckets = DAYS_OF_WEEK.map((d) => buildBucket(d));
		for (const t of closedTrades) {
			if (!t.opened_at) continue;
			const day = new Date(t.opened_at).getDay();
			feedBucket(buckets[day], num(t.pnl) ?? 0);
		}
		return buckets;
	});

	// By strategy (a trade can have multiple strategies — counts in each)
	const byStrategy = $derived.by(() => {
		const map = new Map<string, Bucket>();
		for (const t of closedTrades) {
			const ids = (t.strategy_ids ?? []) as string[];
			for (const id of ids) {
				const name = strategyStore.strategies.find((s) => s.id === id)?.name ?? "Unknown";
				if (!map.has(name)) map.set(name, buildBucket(name));
				feedBucket(map.get(name)!, num(t.pnl) ?? 0);
			}
		}
		return Array.from(map.values()).sort((a, b) => b.pnl - a.pnl);
	});

	// By mistake — same fan-out
	const byMistake = $derived.by(() => {
		const map = new Map<string, Bucket>();
		for (const t of closedTrades) {
			const ids = (t.mistake_ids ?? []) as string[];
			for (const id of ids) {
				const name = mistakeStore.mistakes.find((m) => m.id === id)?.name ?? "Unknown";
				if (!map.has(name)) map.set(name, buildBucket(name));
				feedBucket(map.get(name)!, num(t.pnl) ?? 0);
			}
		}
		return Array.from(map.values()).sort((a, b) => a.pnl - b.pnl);
	});

	function maxAbsPnl(buckets: Bucket[]) {
		return Math.max(1, ...buckets.map((b) => Math.abs(b.pnl)));
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

{#snippet bucketTable(buckets: Bucket[], emptyText: string)}
	{@const maxPnl = maxAbsPnl(buckets)}
	{#if buckets.length === 0}
		<div class="p-10 text-center text-sm text-muted-foreground">{emptyText}</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="bg-muted/30 text-muted-foreground">
					<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
						<th class="text-left whitespace-nowrap">Name</th>
						<th class="text-left whitespace-nowrap">Trades</th>
						<th class="text-left whitespace-nowrap">Win rate</th>
						<th class="text-left whitespace-nowrap">Net P&amp;L</th>
						<th class="text-left whitespace-nowrap">Avg / trade</th>
						<th class="w-1/3 text-left">Distribution</th>
					</tr>
				</thead>
				<tbody class="[&>tr:not(:last-child)]:border-b">
					{#each buckets as b}
						{@const winRate = b.count > 0 ? b.wins / b.count : null}
						{@const avg = b.count > 0 ? b.pnl / b.count : null}
						{@const widthPct = (Math.abs(b.pnl) / maxPnl) * 100}
						<tr class="[&>td]:px-4 [&>td]:py-2 hover:bg-muted/30">
							<td class="text-xs font-medium whitespace-nowrap">{b.label}</td>
							<td class="text-xs tabular-nums">{b.count}</td>
							<td class="text-xs tabular-nums">
								{winRate == null ? "—" : `${Math.round(winRate * 100)}%`}
							</td>
							<td class={[
								"text-xs font-medium tabular-nums",
								b.pnl > 0 && "text-emerald-700 dark:text-emerald-400",
								b.pnl < 0 && "text-rose-700 dark:text-rose-400",
								b.pnl === 0 && "text-muted-foreground",
							]}>
								{b.count === 0 ? "—" : fmtUsd(b.pnl)}
							</td>
							<td class={[
								"text-xs tabular-nums",
								avg != null && avg > 0 && "text-emerald-700 dark:text-emerald-400",
								avg != null && avg < 0 && "text-rose-700 dark:text-rose-400",
								(avg == null || avg === 0) && "text-muted-foreground",
							]}>
								{fmtUsd(avg)}
							</td>
							<td>
								<div class="h-2 w-full rounded-sm bg-muted">
									{#if b.count > 0}
										<div
											class={[
												"h-full rounded-sm",
												b.pnl > 0 && "bg-emerald-700/60",
												b.pnl < 0 && "bg-rose-700/60",
												b.pnl === 0 && "bg-muted-foreground/40",
											]}
											style={`width:${widthPct}%`}
										></div>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/snippet}

{#snippet skeletonRows(n: number)}
	<div class="divide-y">
		{#each Array(n).fill(0) as _}
			<div class="flex items-center gap-4 px-4 py-3">
				<Skeleton class="h-3.5 w-24" />
				<Skeleton class="h-3.5 w-10" />
				<Skeleton class="h-3.5 w-12" />
				<Skeleton class="h-3.5 w-16" />
				<Skeleton class="h-3.5 w-16" />
				<Skeleton class="ml-auto h-2 w-1/3" />
			</div>
		{/each}
	</div>
{/snippet}

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Page>Analytics</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-6xl space-y-6 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Analytics</h1>
			<p class="text-sm text-muted-foreground">
				How your closed trades break down across different dimensions.
			</p>
		</div>

		<section class="space-y-2">
			<div>
				<h2 class="text-lg font-semibold">By symbol</h2>
				<p class="text-xs text-muted-foreground">Where your money is being made — or lost.</p>
			</div>
			<div class="rounded-md border bg-background">
				{#if loading}
					{@render skeletonRows(4)}
				{:else}
					{@render bucketTable(bySymbol, "No closed trades yet.")}
				{/if}
			</div>
		</section>

		<section class="space-y-2">
			<div>
				<h2 class="text-lg font-semibold">By side</h2>
				<p class="text-xs text-muted-foreground">Long vs short performance.</p>
			</div>
			<div class="rounded-md border bg-background">
				{#if loading}
					{@render skeletonRows(2)}
				{:else}
					{@render bucketTable(bySide.filter((b) => b.count > 0), "No closed trades yet.")}
				{/if}
			</div>
		</section>

		<section class="space-y-2">
			<div>
				<h2 class="text-lg font-semibold">By day of week</h2>
				<p class="text-xs text-muted-foreground">Based on the day the trade was opened.</p>
			</div>
			<div class="rounded-md border bg-background">
				{#if loading}
					{@render skeletonRows(7)}
				{:else}
					{@render bucketTable(byDayOfWeek.filter((b) => b.count > 0), "No closed trades yet.")}
				{/if}
			</div>
		</section>

		<section class="space-y-2">
			<div>
				<h2 class="text-lg font-semibold">By strategy</h2>
				<p class="text-xs text-muted-foreground">Which setups carry their weight. Trades can be tagged with multiple strategies.</p>
			</div>
			<div class="rounded-md border bg-background">
				{#if loading}
					{@render skeletonRows(3)}
				{:else}
					{@render bucketTable(byStrategy, "No tagged strategies yet.")}
				{/if}
			</div>
		</section>

		<section class="space-y-2">
			<div>
				<h2 class="text-lg font-semibold">Mistake impact</h2>
				<p class="text-xs text-muted-foreground">How much each tagged mistake has cost (or saved). Sorted worst first.</p>
			</div>
			<div class="rounded-md border bg-background">
				{#if loading}
					{@render skeletonRows(3)}
				{:else}
					{@render bucketTable(byMistake, "No tagged mistakes yet.")}
				{/if}
			</div>
		</section>
	</div>
</ScrollArea>
