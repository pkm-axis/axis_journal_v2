<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { supabase } from "$lib/supabase/client";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { backtestSessionStore } from "$lib/stores/backtest-sessions.svelte";
	import { getAuthToken } from "$lib/utils/auth-token";

	type Mode = "manual" | "account" | "session";
	type PeriodUnit = "day" | "week" | "month";

	const PERIOD_DAYS: Record<PeriodUnit, number> = { day: 1, week: 7, month: 30 };
	const PERIOD_LABELS: Record<PeriodUnit, { singular: string; plural: string }> = {
		day: { singular: "day", plural: "days" },
		week: { singular: "week", plural: "weeks" },
		month: { singular: "month", plural: "months" },
	};

	let mode = $state<Mode>("manual");
	let periodUnit = $state<PeriodUnit>("month");
	let selectedAccountId = $state<string | null>(null);
	let selectedSessionId = $state<string | null>(null);
	let loadingTrades = $state(false);

	type ClosedTrade = { pnl: number; opened_at: string };
	let closedTrades = $state<ClosedTrade[]>([]);

	let startBalance = $state("10000");
	let returnPerTrade = $state("0.5"); // % per trade
	let tradesPerPeriod = $state("20");
	let periods = $state("12");

	function num(v: unknown): number | null {
		if (v == null || v === "") return null;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : null;
	}

	onMount(() => {
		if (accountStore.accounts.length === 0) {
			void accountStore.getAllAccounts(supabase);
		}
		if (backtestSessionStore.sessions.length === 0) {
			void backtestSessionStore.getAll(supabase);
		}
	});

	const selectedAccount = $derived(
		accountStore.accounts.find((a) => a.id === selectedAccountId) ?? null
	);

	const selectedSession = $derived(
		backtestSessionStore.sessions.find((s) => s.id === selectedSessionId) ?? null
	);

	async function loadAccountTrades(accountId: string) {
		loadingTrades = true;
		try {
			const token = await getAuthToken(supabase);
			const res = await fetch("/api/trades/all?backtest=live", {
				credentials: "include",
				headers: { Authorization: `Bearer ${token}` },
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to load trades");
			const all = (result.data as Array<{
				account_id: string | null;
				status: string;
				pnl: string | number | null;
				opened_at: string;
			}>) ?? [];
			closedTrades = all
				.filter((t) => t.account_id === accountId && t.status === "closed")
				.map((t) => ({ pnl: Number(t.pnl ?? 0), opened_at: t.opened_at }))
				.filter((t) => Number.isFinite(t.pnl))
				.sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
		} catch (e) {
			console.error(e);
			closedTrades = [];
		} finally {
			loadingTrades = false;
		}
	}

	async function loadSessionTrades(sessionId: string) {
		loadingTrades = true;
		try {
			const token = await getAuthToken(supabase);
			const res = await fetch(`/api/trades?sessionId=${encodeURIComponent(sessionId)}&pageSize=100`, {
				credentials: "include",
				headers: { Authorization: `Bearer ${token}` },
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to load trades");
			const all = (result.data as Array<{
				status: string;
				pnl: string | number | null;
				opened_at: string;
			}>) ?? [];
			closedTrades = all
				.filter((t) => t.status === "closed")
				.map((t) => ({ pnl: Number(t.pnl ?? 0), opened_at: t.opened_at }))
				.filter((t) => Number.isFinite(t.pnl))
				.sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
		} catch (e) {
			console.error(e);
			closedTrades = [];
		} finally {
			loadingTrades = false;
		}
	}

	// When the selected source changes, refetch trades.
	$effect(() => {
		if (mode === "account" && selectedAccountId) {
			void loadAccountTrades(selectedAccountId);
		} else if (mode === "session" && selectedSessionId) {
			void loadSessionTrades(selectedSessionId);
		} else {
			closedTrades = [];
		}
	});

	const sourceStartingBalance = $derived.by(() => {
		if (mode === "account") return Number(selectedAccount?.starting_balance ?? 0);
		if (mode === "session") return Number(selectedSession?.starting_balance ?? 0);
		return 0;
	});

	/** Stats derived from the selected source's closed trades, scaled to the chosen period. */
	const sourceStats = $derived.by(() => {
		if (mode === "manual") return null;
		if (mode === "account" && !selectedAccount) return null;
		if (mode === "session" && !selectedSession) return null;
		const start = sourceStartingBalance;
		if (!Number.isFinite(start) || start <= 0) return null;
		if (closedTrades.length === 0) return null;

		// Running-balance % return per trade.
		let bal = start;
		const pcts: number[] = [];
		for (const t of closedTrades) {
			if (bal <= 0) break;
			pcts.push((t.pnl / bal) * 100);
			bal = bal + t.pnl;
		}
		const avgPctPerTrade = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;

		const first = new Date(closedTrades[0].opened_at).getTime();
		const last = new Date(closedTrades[closedTrades.length - 1].opened_at).getTime();
		const spanDays = Math.max(1, (last - first) / 86_400_000);

		const tradesPer: Record<PeriodUnit, number> = {
			day: closedTrades.length / Math.max(1, spanDays),
			week: closedTrades.length / Math.max(1 / 7, spanDays / 7),
			month: closedTrades.length / Math.max(1 / 30, spanDays / 30),
		};

		return {
			startingBalance: start,
			closedCount: closedTrades.length,
			avgPctPerTrade,
			tradesPer,
			spanDays,
		};
	});

	/** Auto-pick the period that most closely matches the data density. */
	$effect(() => {
		if (mode === "manual" || !sourceStats) return;
		const span = sourceStats.spanDays;
		const next: PeriodUnit = span < 7 ? "day" : span < 30 ? "week" : "month";
		periodUnit = next;
	});

	/** Push computed source stats into the inputs (one-way sync). */
	$effect(() => {
		if (mode === "manual" || !sourceStats) return;
		startBalance = String(Math.round(sourceStats.startingBalance));
		returnPerTrade = sourceStats.avgPctPerTrade.toFixed(3);
		const t = sourceStats.tradesPer[periodUnit];
		tradesPerPeriod = Math.max(1, Math.round(t)).toString();
	});

	const projection = $derived.by(() => {
		const start = num(startBalance);
		const ret = num(returnPerTrade);
		const tpp = num(tradesPerPeriod);
		const n = num(periods);
		if (start == null || ret == null || tpp == null || n == null) return null;
		if (start <= 0 || tpp < 0 || n < 0) return null;
		const rPerTrade = ret / 100;
		const factor = Math.pow(1 + rPerTrade, tpp);
		const rows: { period: number; balance: number; gain: number }[] = [];
		let bal = start;
		for (let i = 1; i <= Math.min(n, 240); i++) {
			const next = bal * factor;
			rows.push({ period: i, balance: next, gain: next - bal });
			bal = next;
		}
		return { start, rows, final: bal };
	});

	const totalReturn = $derived.by(() => {
		if (!projection) return null;
		return ((projection.final - projection.start) / projection.start) * 100;
	});

	const maxBalance = $derived(projection ? Math.max(projection.start, ...projection.rows.map((r) => r.balance)) : 0);

	function fmtUsd(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD", maximumFractionDigits: 0,
		}).format(v);
	}

	function fmtUsdPrecise(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD", maximumFractionDigits: 2,
		}).format(v);
	}

	function fmtPct(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return `${v.toFixed(2)}%`;
	}

	function resetToDefaults() {
		startBalance = "10000";
		returnPerTrade = "0.5";
		tradesPerPeriod = "20";
		periods = "12";
	}
</script>

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Tools</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Compounding</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">The Compounding calculator projects how your account grows when you reinvest profits.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Manual mode: enter your own assumptions for balance, return per trade, frequency.</li>
			<li>From account: pick one of your accounts and the inputs auto-populate from its closed trade history.</li>
			<li>From backtest session: pick a backtest session to project from its hypothetical closed trades.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-4 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Compounding</h1>
			<p class="text-sm text-muted-foreground">
				Project account growth assuming consistent per-trade returns are reinvested.
			</p>
		</div>

		<!-- Mode toggle -->
		<div class="rounded-md border bg-background p-4 space-y-3">
			<div class="text-sm font-medium">Source</div>
			<div class="flex flex-wrap gap-2">
				<Button
					variant={mode === "manual" ? "default" : "outline"}
					size="sm"
					class="rounded-md cursor-pointer"
					onclick={() => {
						mode = "manual";
						resetToDefaults();
					}}
				>
					Manual
				</Button>
				<Button
					variant={mode === "account" ? "default" : "outline"}
					size="sm"
					class="rounded-md cursor-pointer"
					onclick={() => (mode = "account")}
				>
					From account
				</Button>
				<Button
					variant={mode === "session" ? "default" : "outline"}
					size="sm"
					class="rounded-md cursor-pointer"
					onclick={() => (mode = "session")}
				>
					From backtest session
				</Button>
			</div>

			{#if mode === "account"}
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Account</div>
					<Select.Root type="single" bind:value={selectedAccountId as string | undefined}>
						<Select.Trigger class="w-full rounded-md cursor-pointer">
							<span>{selectedAccount?.name ?? "Pick an account"}</span>
						</Select.Trigger>
						<Select.Content class="rounded-md">
							<!-- Projecting growth on a retired account is meaningless, so this
							     picker is live accounts only. -->
							{#each accountStore.activeAccounts as a (a.id)}
								<Select.Item value={a.id} class="cursor-pointer">
									<div class="flex flex-col">
										<span>{a.name}</span>
										<span class="text-[10px] text-muted-foreground capitalize">{a.account_type ?? ""}</span>
									</div>
								</Select.Item>
							{:else}
								<div class="px-2 py-3 text-center text-xs text-muted-foreground">No active accounts.</div>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{:else if mode === "session"}
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Backtest session</div>
					<Select.Root type="single" bind:value={selectedSessionId as string | undefined}>
						<Select.Trigger class="w-full rounded-md cursor-pointer">
							<span>{selectedSession?.name ?? "Pick a backtest session"}</span>
						</Select.Trigger>
						<Select.Content class="rounded-md">
							{#each backtestSessionStore.sessions as s (s.id)}
								<Select.Item value={s.id} class="cursor-pointer">
									<div class="flex flex-col">
										<span>{s.name}</span>
										{#if s.starting_balance != null}
											<span class="text-[10px] text-muted-foreground tabular-nums">
												Start {fmtUsd(Number(s.starting_balance))}
											</span>
										{/if}
									</div>
								</Select.Item>
							{:else}
								<div class="px-2 py-3 text-center text-xs text-muted-foreground">No backtest sessions yet.</div>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}

			{#if mode === "account" || mode === "session"}
				{@const picked = mode === "account" ? selectedAccountId : selectedSessionId}
				{@const sourceName = mode === "account" ? "account" : "backtest session"}
				{#if !picked}
					<p class="text-[11px] text-muted-foreground">
						Pick {mode === "account" ? "an account" : "a session"} to pull starting balance, average per-trade return, and trade frequency from its closed trades.
					</p>
				{:else if loadingTrades}
					<p class="text-[11px] text-muted-foreground">Loading trades…</p>
				{:else if !sourceStats}
					{#if sourceStartingBalance <= 0}
						<div class="rounded-md border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
							This {sourceName} has no starting balance set, so there's nothing to compound from.
						</div>
					{:else}
						<div class="rounded-md border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
							This {sourceName} has no closed trades yet, so there's nothing to compound. Switch to <strong>Manual</strong>, or log some trades first.
						</div>
					{/if}
				{:else}
					<div class="rounded-md border bg-muted/20 px-3 py-2 text-xs space-y-1">
						<div class="flex justify-between gap-3">
							<span class="text-muted-foreground">Closed trades</span>
							<span class="tabular-nums font-medium">{sourceStats.closedCount}</span>
						</div>
						<div class="flex justify-between gap-3">
							<span class="text-muted-foreground">History span</span>
							<span class="tabular-nums font-medium">{sourceStats.spanDays.toFixed(1)} days</span>
						</div>
						<div class="flex justify-between gap-3">
							<span class="text-muted-foreground">Avg trades / {PERIOD_LABELS[periodUnit].singular}</span>
							<span class="tabular-nums font-medium">{sourceStats.tradesPer[periodUnit].toFixed(1)}</span>
						</div>
						<div class="flex justify-between gap-3">
							<span class="text-muted-foreground">Avg return / trade</span>
							<span class={[
								"tabular-nums font-medium",
								sourceStats.avgPctPerTrade > 0 && "text-emerald-700 dark:text-emerald-400",
								sourceStats.avgPctPerTrade < 0 && "text-rose-700 dark:text-rose-400",
							]}>{fmtPct(sourceStats.avgPctPerTrade)}</span>
						</div>
						{#if sourceStats.tradesPer[periodUnit] < 1}
							<div class="text-[11px] text-amber-700 dark:text-amber-400 pt-1">
								Less than 1 trade per {PERIOD_LABELS[periodUnit].singular} on average — try a shorter period below for a more meaningful projection.
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		</div>

		<div class="grid gap-4 lg:grid-cols-[1fr_1fr]">
			<!-- Inputs -->
			<div class="rounded-md border bg-background p-4 space-y-4">
				<div class="flex items-center justify-between gap-2">
					<div class="text-sm font-medium">Inputs</div>
					{#if mode !== "manual" && sourceStats}
						<span class="text-[10px] text-muted-foreground">Editable — tweak any input to model a what-if.</span>
					{/if}
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Starting balance ($)</div>
					<Input bind:value={startBalance} inputmode="decimal" placeholder="10000" class="rounded-md" />
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Avg return per trade (%)</div>
					<Input bind:value={returnPerTrade} inputmode="decimal" placeholder="0.5" class="rounded-md" />
					<p class="text-[11px] text-muted-foreground leading-snug">
						Net % gained per trade on the current balance. E.g. risking 1% with 0.5R expectancy = 0.5%.
					</p>
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Period</div>
					<Select.Root type="single" bind:value={periodUnit as string | undefined}>
						<Select.Trigger class="w-full rounded-md cursor-pointer">
							<span class="capitalize">{PERIOD_LABELS[periodUnit].singular}</span>
						</Select.Trigger>
						<Select.Content class="rounded-md">
							<Select.Item value="day" class="cursor-pointer">Day</Select.Item>
							<Select.Item value="week" class="cursor-pointer">Week</Select.Item>
							<Select.Item value="month" class="cursor-pointer">Month</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Trades per {PERIOD_LABELS[periodUnit].singular}</div>
						<Input bind:value={tradesPerPeriod} inputmode="decimal" placeholder="20" class="rounded-md" />
					</div>
					<div class="space-y-1.5">
						<div class="text-xs font-medium">{PERIOD_LABELS[periodUnit].plural[0].toUpperCase() + PERIOD_LABELS[periodUnit].plural.slice(1)} to project</div>
						<Input bind:value={periods} inputmode="decimal" placeholder="12" class="rounded-md" />
					</div>
				</div>
				<p class="text-[11px] text-muted-foreground -mt-2">
					Capped at 240 {PERIOD_LABELS[periodUnit].plural}.
				</p>
			</div>

			<!-- Outputs -->
			<div class="rounded-md border bg-muted/20 p-4 space-y-4">
				<div class="text-sm font-medium">Projection</div>

				<div>
					<div class="text-xs text-muted-foreground">Final balance</div>
					<div class={[
						"mt-1 text-3xl font-bold tabular-nums",
						projection && projection.final > projection.start && "text-emerald-700 dark:text-emerald-400",
						projection && projection.final < projection.start && "text-rose-700 dark:text-rose-400",
					]}>
						{fmtUsd(projection?.final ?? null)}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<div class="text-xs text-muted-foreground">Total return</div>
						<div class={[
							"mt-1 text-lg font-semibold tabular-nums",
							totalReturn != null && totalReturn > 0 && "text-emerald-700 dark:text-emerald-400",
							totalReturn != null && totalReturn < 0 && "text-rose-700 dark:text-rose-400",
						]}>
							{fmtPct(totalReturn)}
						</div>
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Net gain</div>
						<div class="mt-1 text-lg font-semibold tabular-nums">
							{projection ? fmtUsd(projection.final - projection.start) : "—"}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Per-period table + bars -->
		<div class="rounded-md border bg-background">
			<div class="border-b px-4 py-3 text-sm font-medium">Per period</div>
			{#if !projection}
				<div class="p-10 text-center text-sm text-muted-foreground">Fill in all inputs to see the projection.</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
								<th class="w-16 whitespace-nowrap text-left">#</th>
								<th class="text-left whitespace-nowrap">Balance</th>
								<th class="text-left whitespace-nowrap">Gain</th>
								<th class="w-1/2 text-left">Growth</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each projection.rows as r}
								<tr class="[&>td]:px-4 [&>td]:py-2 hover:bg-muted/30">
									<td class="text-xs tabular-nums text-muted-foreground">{r.period}</td>
									<td class="tabular-nums text-xs font-medium">{fmtUsdPrecise(r.balance)}</td>
									<td class={[
										"tabular-nums text-xs",
										r.gain > 0 && "text-emerald-700 dark:text-emerald-400",
										r.gain < 0 && "text-rose-700 dark:text-rose-400",
									]}>
										{fmtUsdPrecise(r.gain)}
									</td>
									<td>
										<div class="h-2 w-full rounded-sm bg-muted">
											<div
												class={[
													"h-full rounded-sm",
													r.gain >= 0 ? "bg-emerald-700/60" : "bg-rose-700/60",
												]}
												style={`width:${maxBalance > 0 ? (r.balance / maxBalance) * 100 : 0}%;`}
											></div>
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
