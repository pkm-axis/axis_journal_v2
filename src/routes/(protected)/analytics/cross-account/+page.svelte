<script lang="ts">
	import { onMount, untrack } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { supabase } from "$lib/supabase/client";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { getAuthToken } from "$lib/utils/auth-token";
	import type { Trade } from "$lib/stores/trades.svelte";

	let session = $state<{ user: { id: string } } | null>(null);
	let loading = $state(true);
	let perAccount = $state<AccountStats[]>([]);

	type AccountStats = {
		id: string;
		name: string;
		account_type: string;
		total: number;
		closedCount: number;
		openCount: number;
		netPnl: number;
		wins: number;
		losses: number;
		winRate: number | null;
		avgWin: number;
		avgLoss: number;
		expectancy: number;
		bestTrade: number | null;
		worstTrade: number | null;
	};

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

	function emptyStats(id: string, name: string, account_type: string): AccountStats {
		return {
			id, name, account_type,
			total: 0, closedCount: 0, openCount: 0,
			netPnl: 0, wins: 0, losses: 0, winRate: null,
			avgWin: 0, avgLoss: 0, expectancy: 0,
			bestTrade: null, worstTrade: null,
		};
	}

	function summarize(accountId: string, name: string, account_type: string, trades: Trade[]): AccountStats {
		const s = emptyStats(accountId, name, account_type);
		const wins: number[] = [];
		const losses: number[] = [];

		for (const t of trades) {
			s.total++;
			if (t.status === "open") s.openCount++;
			if (t.status !== "closed") continue;
			s.closedCount++;
			const pnl = num(t.pnl) ?? 0;
			s.netPnl += pnl;
			if (pnl > 0) { s.wins++; wins.push(pnl); }
			else if (pnl < 0) { s.losses++; losses.push(Math.abs(pnl)); }
			if (s.bestTrade == null || pnl > s.bestTrade) s.bestTrade = pnl;
			if (s.worstTrade == null || pnl < s.worstTrade) s.worstTrade = pnl;
		}

		s.winRate = s.closedCount > 0 ? s.wins / s.closedCount : null;
		s.avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
		s.avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
		const lossRate = s.closedCount > 0 ? s.losses / s.closedCount : 0;
		s.expectancy = (s.winRate ?? 0) * s.avgWin - lossRate * s.avgLoss;
		return s;
	}

	async function loadAll() {
		loading = true;
		try {
			if (accountStore.accounts.length === 0) {
				await accountStore.getAllAccounts(supabase);
			}
			const token = await getAuthToken(supabase);

			const results = await Promise.all(
				accountStore.accounts.map(async (acct) => {
					const res = await fetch(`/api/trades?accountId=${encodeURIComponent(acct.id)}`, {
						credentials: "include",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${token}`,
						},
					});
					const result = await res.json();
					const trades: Trade[] = result.success ? (result.data ?? []) : [];
					return summarize(acct.id, acct.name, acct.account_type, trades);
				})
			);
			perAccount = results.sort((a, b) => b.netPnl - a.netPnl);
		} catch (e) {
			console.error("Failed to load cross-account data", e);
			perAccount = [];
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		const { data: { session: s } } = await supabase.auth.getSession();
		session = s;
	});

	$effect(() => {
		if (!session?.user?.id) return;
		untrack(() => {
			void loadAll();
		});
	});

	const totals = $derived.by(() => {
		const t = perAccount.reduce(
			(acc, a) => {
				acc.netPnl += a.netPnl;
				acc.closedCount += a.closedCount;
				acc.wins += a.wins;
				acc.total += a.total;
				return acc;
			},
			{ netPnl: 0, closedCount: 0, wins: 0, total: 0 }
		);
		return {
			...t,
			winRate: t.closedCount > 0 ? t.wins / t.closedCount : null,
			accounts: perAccount.length,
		};
	});

	const maxAbsPnl = $derived(Math.max(1, ...perAccount.map((a) => Math.abs(a.netPnl))));
</script>

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Analytics</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Cross-account</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">Cross-account Analysis lets you compare performance metrics across all your trading accounts side by side.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>All accounts are shown together — no need to switch between them in the sidebar.</li>
			<li>Metrics like total P&L, win rate, and trade count are shown per account.</li>
			<li>Useful for identifying which account is performing best at a glance.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-6xl space-y-6 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Cross-account Analysis</h1>
			<p class="text-sm text-muted-foreground">
				Side-by-side performance for every account you have.
			</p>
		</div>

		<!-- Aggregate stats -->
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
					totals.netPnl > 0 && "border-emerald-700/30 bg-emerald-700/5",
					totals.netPnl < 0 && "border-rose-700/30 bg-rose-700/5",
				]}>
					<div class="text-xs text-muted-foreground">Combined net P&L</div>
					<div class={[
						"mt-1 text-2xl font-semibold tabular-nums",
						totals.netPnl > 0 && "text-emerald-700 dark:text-emerald-400",
						totals.netPnl < 0 && "text-rose-700 dark:text-rose-400",
					]}>
						{totals.closedCount === 0 ? "—" : fmtUsd(totals.netPnl, true)}
					</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Accounts</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">{totals.accounts}</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Total trades</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">{totals.total}</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Combined win rate</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums">
						{totals.winRate == null ? "—" : `${Math.round(totals.winRate * 100)}%`}
					</div>
				</div>
			{/if}
		</div>

		<!-- Per-account comparison -->
		<div class="rounded-md border bg-background">
			<div class="border-b px-4 py-3">
				<div class="text-sm font-medium">By account</div>
				<p class="text-xs text-muted-foreground">Sorted by net P&L. Bar shows relative size of net P&L vs the largest.</p>
			</div>

			{#if loading}
				<div class="divide-y">
					{#each [0, 1, 2] as _}
						<div class="flex items-center gap-4 px-4 py-3">
							<Skeleton class="h-3.5 w-32" />
							<Skeleton class="h-3.5 w-12" />
							<Skeleton class="h-3.5 w-12" />
							<Skeleton class="h-3.5 w-16" />
							<Skeleton class="ml-auto h-2 w-1/3" />
						</div>
					{/each}
				</div>
			{:else if perAccount.length === 0}
				<div class="p-10 text-center text-sm text-muted-foreground">
					No accounts yet. Create one from the sidebar.
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
								<th class="text-left whitespace-nowrap">Account</th>
								<th class="text-left whitespace-nowrap">Trades</th>
								<th class="text-left whitespace-nowrap">Win rate</th>
								<th class="text-left whitespace-nowrap">Expectancy</th>
								<th class="text-left whitespace-nowrap">Best</th>
								<th class="text-left whitespace-nowrap">Worst</th>
								<th class="text-left whitespace-nowrap">Net P&amp;L</th>
								<th class="w-1/4 text-left">Distribution</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each perAccount as a}
								{@const widthPct = (Math.abs(a.netPnl) / maxAbsPnl) * 100}
								<tr class="[&>td]:px-4 [&>td]:py-2 hover:bg-muted/30">
									<td>
										<div class="text-xs font-medium">{a.name}</div>
										<div class="text-[11px] text-muted-foreground capitalize">{a.account_type}</div>
									</td>
									<td class="text-xs tabular-nums">
										<span>{a.closedCount}</span>
										{#if a.openCount > 0}
											<span class="text-muted-foreground"> · {a.openCount} open</span>
										{/if}
									</td>
									<td class="text-xs tabular-nums">
										{a.winRate == null ? "—" : `${Math.round(a.winRate * 100)}%`}
									</td>
									<td class={[
										"text-xs tabular-nums",
										a.expectancy > 0 && "text-emerald-700 dark:text-emerald-400",
										a.expectancy < 0 && "text-rose-700 dark:text-rose-400",
										a.expectancy === 0 && "text-muted-foreground",
									]}>
										{a.closedCount === 0 ? "—" : fmtUsd(a.expectancy, true)}
									</td>
									<td class="text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
										{fmtUsd(a.bestTrade)}
									</td>
									<td class="text-xs tabular-nums text-rose-700 dark:text-rose-400">
										{fmtUsd(a.worstTrade)}
									</td>
									<td class={[
										"text-xs font-medium tabular-nums",
										a.netPnl > 0 && "text-emerald-700 dark:text-emerald-400",
										a.netPnl < 0 && "text-rose-700 dark:text-rose-400",
										a.netPnl === 0 && "text-muted-foreground",
									]}>
										{a.closedCount === 0 ? "—" : fmtUsd(a.netPnl, true)}
									</td>
									<td>
										<div class="h-2 w-full rounded-sm bg-muted">
											{#if a.closedCount > 0}
												<div
													class={[
														"h-full rounded-sm",
														a.netPnl > 0 && "bg-emerald-700/60",
														a.netPnl < 0 && "bg-rose-700/60",
														a.netPnl === 0 && "bg-muted-foreground/40",
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
		</div>
	</div>
</ScrollArea>
