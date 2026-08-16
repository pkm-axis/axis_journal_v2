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
	let loading = $state(true);
	let perAccount = $state<AccountStats[]>([]);
	/** Every closed row across all accounts, tagged with its copytrade group. */
	let closedRows = $state<{ group: string; pnl: number }[]>([]);
	let includeArchived = $state(false);

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

			/**
			 * Archived accounts are off by default: backfilling a stack of past
			 * breached accounts would otherwise silently reshape every figure on
			 * this page. Costs are unaffected — those live on the Expenses page and
			 * always count archived accounts.
			 */
			const scope = includeArchived
				? accountStore.accounts
				: accountStore.activeAccounts;

			const results = await Promise.all(
				scope.map(async (acct) => {
					const res = await fetch(`/api/trades?accountId=${encodeURIComponent(acct.id)}`, {
						credentials: "include",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${token}`,
						},
					});
					const result = await res.json();
					const trades: Trade[] = result.success ? (result.data ?? []) : [];
					return {
						stats: summarize(acct.id, acct.name, acct.account_type, trades),
						closed: trades
							.filter((t) => t.status === "closed")
							.map((t) => ({
								// A mirrored trade shares its group id across accounts; an
								// unmirrored one is a group of one, keyed by its own id.
								group: t.trade_group_id ?? `solo:${t.id}`,
								pnl: num(t.pnl) ?? 0,
							})),
					};
				})
			);
			perAccount = results.map((r) => r.stats).sort((a, b) => b.netPnl - a.netPnl);
			closedRows = results.flatMap((r) => r.closed);
		} catch (e) {
			console.error("Failed to load cross-account data", e);
			perAccount = [];
			closedRows = [];
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
		// Re-read the whole book when the archived scope changes.
		void includeArchived;
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
		/**
		 * Row-level counts double-count copytraded decisions: a setup mirrored to
		 * five accounts lands as five rows that win or lose together, so it casts
		 * five votes in a row-level win rate while a single-account setup casts one.
		 * Collapse each group to one decision — P&L summed across its accounts,
		 * because that is the real money the decision made — and report win rate
		 * off those. Net P&L is unaffected: summing rows and summing groups of rows
		 * give the same total.
		 */
		const byGroup = new Map<string, number>();
		for (const r of closedRows) {
			byGroup.set(r.group, (byGroup.get(r.group) ?? 0) + r.pnl);
		}
		let decisionWins = 0;
		for (const pnl of byGroup.values()) if (pnl > 0) decisionWins++;
		const decisions = byGroup.size;

		return {
			...t,
			winRate: t.closedCount > 0 ? t.wins / t.closedCount : null,
			decisions,
			decisionWinRate: decisions > 0 ? decisionWins / decisions : null,
			/** True once any decision spans more than one account. */
			hasMirrored: decisions > 0 && decisions < t.closedCount,
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
		<div class="flex items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Cross-account Analysis</h1>
				<p class="text-sm text-muted-foreground">
					Side-by-side performance for every account you have.
				</p>
			</div>
			<div class="flex items-center gap-2">
				{#if accountStore.archivedAccounts.length > 0}
					<label class="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
						<input
							type="checkbox"
							bind:checked={includeArchived}
							class="cursor-pointer accent-primary"
						/>
						Include archived
					</label>
				{/if}
				<Button
					variant="outline"
					size="sm"
					class="rounded-md cursor-pointer"
					onclick={() => (shareOpen = true)}
					disabled={loading || perAccount.length === 0}
				>
					<ShareNetworkIcon size={16} />
					Share
				</Button>
			</div>
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
					{#if totals.hasMirrored}
						<div class="mt-1 text-[11px] text-muted-foreground tabular-nums">
							{totals.decisions} distinct {totals.decisions === 1 ? "decision" : "decisions"}
						</div>
					{/if}
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Combined win rate</div>
					{#if totals.hasMirrored}
						<div class="mt-1 text-2xl font-semibold tabular-nums">
							{totals.decisionWinRate == null ? "—" : `${Math.round(totals.decisionWinRate * 100)}%`}
						</div>
						<div class="mt-1 text-[11px] text-muted-foreground tabular-nums">
							per decision · {totals.winRate == null ? "—" : `${Math.round(totals.winRate * 100)}%`} per row
						</div>
					{:else}
						<div class="mt-1 text-2xl font-semibold tabular-nums">
							{totals.winRate == null ? "—" : `${Math.round(totals.winRate * 100)}%`}
						</div>
					{/if}
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

<PnlShareDialog
	bind:open={shareOpen}
	variant="analytics"
	title="Cross-account Analysis"
	subtitle={`${totals.accounts} ${totals.accounts === 1 ? "account" : "accounts"}`}
	badge="CROSS-ACCOUNT"
	headlineLabel="Combined Net P&L"
	headlineValue={totals.closedCount === 0 ? "—" : fmtUsdShare(totals.netPnl)}
	headlinePnl={totals.netPnl}
	stats={[
		{ label: "Accounts", value: String(totals.accounts) },
		// Share the per-decision figures when copytrading is in play — a row-level
		// count would overstate both the sample size and the win rate.
		{
			label: totals.hasMirrored ? "Decisions" : "Total trades",
			value: String(totals.hasMirrored ? totals.decisions : totals.total),
		},
		{
			label: "Win rate",
			value: (() => {
				const wr = totals.hasMirrored ? totals.decisionWinRate : totals.winRate;
				return wr == null ? "—" : `${Math.round(wr * 100)}%`;
			})(),
		},
	]}
/>
