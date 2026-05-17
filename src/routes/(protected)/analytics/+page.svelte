<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore, type Account } from "$lib/stores/accounts.svelte";
	import { strategyStore } from "$lib/stores/strategies.svelte";
	import { mistakeStore } from "$lib/stores/mistakes.svelte";
	import { payoutStore } from "$lib/stores/payouts.svelte";

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

	// By hour of day (opened_at, local hour)
	const byHour = $derived.by(() => {
		const buckets = Array.from({ length: 24 }, (_, h) => buildBucket(`${String(h).padStart(2, "0")}:00`));
		for (const t of closedTrades) {
			if (!t.opened_at) continue;
			const h = new Date(t.opened_at).getHours();
			feedBucket(buckets[h], num(t.pnl) ?? 0);
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

	type PropFirmGroup = {
		name: string;
		accounts: Account[];
		totalChallengeCost: number;
		totalPayoutsReceived: number;
		net: number;
	};

	const propFirmGroups = $derived.by(() => {
		const propAccounts = accountStore.accounts.filter(
			(a) => a.account_type === "prop firm" && a.prop_firm_name
		);
		const map = new Map<string, PropFirmGroup>();
		for (const a of propAccounts) {
			const key = a.prop_firm_name!;
			if (!map.has(key)) map.set(key, { name: key, accounts: [], totalChallengeCost: 0, totalPayoutsReceived: 0, net: 0 });
			const g = map.get(key)!;
			g.accounts.push(a);
			g.totalChallengeCost += a.challenge_cost ?? 0;
		}
		for (const p of payoutStore.allPayouts) {
			if (p.status !== "received") continue;
			const acct = propAccounts.find((a) => a.id === p.account_id);
			if (!acct?.prop_firm_name) continue;
			const g = map.get(acct.prop_firm_name);
			if (g) g.totalPayoutsReceived += p.amount;
		}
		for (const g of map.values()) g.net = g.totalPayoutsReceived - g.totalChallengeCost;
		return Array.from(map.values()).sort((a, b) => b.totalPayoutsReceived - a.totalPayoutsReceived);
	});

	onMount(async () => {
		const { data: { session: s } } = await supabase.auth.getSession();
		session = s;
	});

	$effect(() => {
		if (!session?.user?.id) return;
		void accountStore.activeAccountId;
		void tradeStore.getTradesByAccount(supabase);
		void payoutStore.getAllPayouts(supabase);
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

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Page>Analytics</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">Analytics breaks down your trading performance across multiple dimensions.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Charts update automatically based on the trades logged for the selected account.</li>
			<li>Breakdowns include P&L by instrument, trade side, and day of the week.</li>
			<li>See additional breakdowns under <strong>Risk & Streaks</strong> and <strong>Cross-account</strong> in the sidebar.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-8xl space-y-6 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Analytics</h1>
			<p class="text-sm text-muted-foreground">
				How your closed trades break down across different dimensions.
			</p>
		</div>

		{#if propFirmGroups.length > 0}
			<section class="space-y-2">
				<div>
					<h2 class="text-lg font-semibold">Prop firm overview</h2>
					<p class="text-xs text-muted-foreground">Totals grouped by firm across all your accounts.</p>
				</div>
				<div class="rounded-md border bg-background overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:font-medium [&>th]:text-left [&>th]:whitespace-nowrap">
								<th>Firm</th>
								<th>Accounts</th>
								<th>Challenge costs</th>
								<th>Payouts received</th>
								<th>Net</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each propFirmGroups as g}
								<tr class="[&>td]:px-4 [&>td]:py-3 hover:bg-muted/30">
									<td class="font-medium text-xs">{g.name}</td>
									<td class="text-xs text-muted-foreground tabular-nums">
										{g.accounts.length}
										<span class="ml-1 text-muted-foreground/60">
											({g.accounts.filter(a => a.prop_firm_type === 'evaluation').length} eval,
											{g.accounts.filter(a => a.prop_firm_type === 'funded').length} funded)
										</span>
									</td>
									<td class="text-xs tabular-nums text-rose-700 dark:text-rose-400">
										{g.totalChallengeCost > 0 ? fmtUsd(-g.totalChallengeCost) : "—"}
									</td>
									<td class="text-xs tabular-nums">
										{#if g.totalPayoutsReceived > 0}
											<span class="text-emerald-700 dark:text-emerald-400">{fmtUsd(g.totalPayoutsReceived)}</span>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</td>
									<td class={[
										"text-xs font-medium tabular-nums",
										g.net > 0 && "text-emerald-700 dark:text-emerald-400",
										g.net < 0 && "text-rose-700 dark:text-rose-400",
										g.net === 0 && "text-muted-foreground",
									]}>
										{g.totalChallengeCost === 0 && g.totalPayoutsReceived === 0 ? "—" : fmtUsd(g.net)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

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
				<h2 class="text-lg font-semibold">By hour of day</h2>
				<p class="text-xs text-muted-foreground">When you trade matters. Based on the local hour each trade was opened.</p>
			</div>
			<div class="rounded-md border bg-background">
				{#if loading}
					{@render skeletonRows(6)}
				{:else}
					{@render bucketTable(byHour.filter((b) => b.count > 0), "No closed trades yet.")}
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
