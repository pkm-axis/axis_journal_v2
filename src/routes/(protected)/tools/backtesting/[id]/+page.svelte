<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { confirm } from "$lib/components/ui/confirm-dialog";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { DateTimePicker } from "$lib/components/ui/date-time-picker";
	import { MultiSelect } from "$lib/components/ui/multi-select";
	import {
		CaretDownIcon,
		CaretUpIcon,
		ChartLineDownIcon,
		ChartLineUpIcon,
		FileTextIcon,
		FlaskIcon,
		PencilSimpleIcon,
		PlusIcon,
		ShareNetworkIcon,
		TrashIcon
	} from "phosphor-svelte";
	import SessionSummary from "./session-summary.svelte";
	import PnlShareDialog from "$lib/components/pnl-share-sheet/pnl-share-dialog.svelte";
	import { supabase } from "$lib/supabase/client";
	import { backtestSessionStore } from "$lib/stores/backtest-sessions.svelte";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { instrumentStore, instrumentPnl } from "$lib/stores/instruments.svelte";
	import { strategyStore } from "$lib/stores/strategies.svelte";
	import { mistakeStore } from "$lib/stores/mistakes.svelte";
	import { toast } from "svelte-sonner";

	interface TradeRow {
		id: string;
		symbol: string;
		side: string | null;
		status: "open" | "closed";
		entry_price: string | number;
		exit_price: string | number | null;
		quantity: string | number;
		stop_loss: string | number | null;
		take_profit: string | number | null;
		risk: string | number | null;
		pnl: string | number | null;
		opened_at: string;
		closed_at: string | null;
		notes: string | null;
		strategy_ids?: string[];
		mistake_ids?: string[];
		instrument_id: string | null;
	}

	const sessionId = $derived(page.params.id as string);
	const sess = $derived(backtestSessionStore.current);

	const trades = $derived((tradeStore.trades ?? []) as unknown as TradeRow[]);
	const loadingTrades = $derived(tradeStore.loading);

	let tradeSheetOpen = $state(false);
	let summaryOpen = $state(false);
	let shareOpen = $state(false);
	let editingTradeId = $state<string | null>(null);
	let saving = $state(false);
	let deleting = $state(false);

	let formSymbol = $state("");
	let formSide = $state<"long" | "short">("long");
	let formStatus = $state<"open" | "closed">("open");
	let formEntryPrice = $state("");
	let formQuantity = $state("1");
	let formStopLoss = $state("");
	let formTakeProfit = $state("");
	let formOpenedAt = $state(toDatetimeLocalValue(new Date()));
	let formExitPrice = $state("");
	let formClosedAt = $state<string | null>(null);
	let formPnl = $state("");
	let lastAutoPnl = $state<string | null>(null);
	let formNotes = $state("");
	let formStrategyIds = $state<string[]>([]);
	let formMistakeIds = $state<string[]>([]);

	const isEditingTrade = $derived(editingTradeId != null);

	function toDatetimeLocalValue(d: Date) {
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function num(v: string | number | null | undefined): number | undefined {
		if (v == null || v === "") return undefined;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : undefined;
	}

	function normalizeSide(side: string | null | undefined): "long" | "short" | null {
		if (side == null || side === "") return null;
		const s = String(side).toLowerCase();
		if (s === "long" || s === "short") return s;
		return null;
	}

	function riskRewardRatio(entry: number, stop: number, takeProfit: number, side: "long" | "short"): number | null {
		if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(takeProfit)) return null;
		const riskDist = side === "long" ? entry - stop : stop - entry;
		const rewardDist = side === "long" ? takeProfit - entry : entry - takeProfit;
		if (riskDist <= 0 || rewardDist <= 0) return null;
		return rewardDist / riskDist;
	}

	function formatRiskReward(rr: number | null | undefined) {
		if (rr == null || !Number.isFinite(rr)) return "—";
		return `1:${rr.toFixed(2)}`;
	}

	function rowRiskReward(t: TradeRow): number | null {
		const e = num(t.entry_price);
		const sl = num(t.stop_loss);
		const tp = num(t.take_profit);
		const s = normalizeSide(t.side);
		if (e == null || sl == null || tp == null || (s !== "long" && s !== "short")) return null;
		return riskRewardRatio(e, sl, tp, s);
	}

	function formatUsd(value?: number | null) {
		if (value == null || Number.isNaN(value)) return "—";
		return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
	}

	function formatPrice(value: string | number | null | undefined) {
		const n = num(value);
		if (n == null) return "—";
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(n);
	}

	function formatQty(value: string | number | null | undefined) {
		const n = num(value);
		if (n == null) return "—";
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(n);
	}

	function formatWhen(iso: string | null | undefined) {
		if (!iso) return "—";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "—";
		return new Intl.DateTimeFormat(undefined, {
			month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
		}).format(d);
	}

	const selectedInstrument = $derived.by(() =>
		instrumentStore.instruments?.find((i) => i.symbol === formSymbol)
	);

	const sessionInstrument = $derived.by(() =>
		sess?.instrument_id
			? instrumentStore.instruments?.find((i) => i.id === sess.instrument_id)
			: null
	);

	function priceMovePnl(from: number, to: number) {
		const qty = num(formQuantity);
		if (qty == null || !selectedInstrument) return null;
		return instrumentPnl(selectedInstrument, formSide, from, to, qty);
	}

	const stopLossPnL = $derived.by(() => {
		const entry = num(formEntryPrice);
		const stop = num(formStopLoss);
		return entry != null && stop != null ? priceMovePnl(entry, stop) : null;
	});

	const formPlannedRR = $derived.by(() => {
		const e = num(formEntryPrice);
		const sl = num(formStopLoss);
		const tp = num(formTakeProfit);
		if (e == null || sl == null || tp == null) return null;
		return riskRewardRatio(e, sl, tp, formSide);
	});

	const suggestedClosedPnl = $derived.by((): string | null => {
		if (formStatus !== "closed") return null;
		const entry = num(formEntryPrice);
		const exit = num(formExitPrice);
		const qty = num(formQuantity);
		if (entry == null || exit == null || qty == null) return null;
		return instrumentPnl(selectedInstrument, formSide, entry, exit, qty).toFixed(2);
	});

	$effect(() => {
		const suggested = suggestedClosedPnl;
		if (suggested == null) return;
		const shouldSync =
			formPnl === "" ||
			formPnl === lastAutoPnl ||
			(lastAutoPnl == null && num(formPnl) === 0);
		if (shouldSync) {
			formPnl = suggested;
			lastAutoPnl = suggested;
		}
	});

	$effect(() => {
		if (!formSymbol) {
			const fallback = sessionInstrument?.symbol ?? instrumentStore.instruments?.[0]?.symbol;
			if (fallback) formSymbol = fallback;
		}
	});

	const stats = $derived.by(() => {
		const rows = trades;
		const closed = rows.filter((t) => t.status === "closed");
		const netPnl = closed.reduce((acc, t) => acc + (num(t.pnl) ?? 0), 0);
		const wins = closed.filter((t) => (num(t.pnl) ?? 0) > 0).length;
		const winRate = closed.length ? wins / closed.length : null;
		const rrValues: number[] = [];
		for (const t of rows) {
			const rr = rowRiskReward(t);
			if (rr != null) rrValues.push(rr);
		}
		const avgRr = rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : null;
		return { count: rows.length, netPnl, winRate, avgRr };
	});

	const tradeBars = $derived.by(() => {
		const closed = trades
			.filter((t) => t.status === "closed" && t.closed_at)
			.sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());
		const entries = closed.map((t) => ({ pnl: num(t.pnl) ?? 0, pct: 0 }));
		if (entries.length === 0) return entries;
		const max = Math.max(...entries.map((e) => Math.abs(e.pnl)));
		entries.forEach((e) => { e.pct = max > 0 ? Math.abs(e.pnl) / max : 0; });
		return entries;
	});

	const equityCurve = $derived.by(() => {
		const start = Number(sess?.starting_balance ?? 0);
		const closed = trades
			.filter((t) => t.status === "closed" && t.closed_at)
			.sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());
		let balance = start;
		const points = closed.map((t) => {
			balance += num(t.pnl) ?? 0;
			return balance;
		});
		return { start, end: balance, points };
	});

	function resetForm() {
		formSymbol = sessionInstrument?.symbol ?? instrumentStore.instruments?.[0]?.symbol ?? "";
		formSide = "long";
		formStatus = "open";
		formEntryPrice = "";
		formQuantity = "1";
		formStopLoss = "";
		formTakeProfit = "";
		formOpenedAt = toDatetimeLocalValue(new Date());
		formExitPrice = "";
		formClosedAt = null;
		formPnl = "";
		lastAutoPnl = null;
		formNotes = "";
		formStrategyIds = [];
		formMistakeIds = [];
	}

	function openCreate() {
		editingTradeId = null;
		resetForm();
		tradeSheetOpen = true;
	}

	function openEdit(t: TradeRow) {
		editingTradeId = t.id;
		formSymbol = t.symbol ?? "";
		formSide = normalizeSide(t.side) ?? "long";
		formStatus = t.status;
		formEntryPrice = num(t.entry_price) != null ? String(num(t.entry_price)) : "";
		formQuantity = num(t.quantity) != null ? String(num(t.quantity)) : "1";
		formStopLoss = num(t.stop_loss) != null ? String(num(t.stop_loss)) : "";
		formTakeProfit = num(t.take_profit) != null ? String(num(t.take_profit)) : "";
		formOpenedAt = t.opened_at ? toDatetimeLocalValue(new Date(t.opened_at)) : toDatetimeLocalValue(new Date());
		formExitPrice = num(t.exit_price) != null ? String(num(t.exit_price)) : "";
		formClosedAt = t.closed_at ? toDatetimeLocalValue(new Date(t.closed_at)) : null;
		formPnl = num(t.pnl) != null ? String(num(t.pnl)) : "";
		lastAutoPnl = null;
		formNotes = t.notes ?? "";
		formStrategyIds = [...(t.strategy_ids ?? [])];
		formMistakeIds = [...(t.mistake_ids ?? [])];
		tradeSheetOpen = true;
	}

	function closeSheet() {
		tradeSheetOpen = false;
		editingTradeId = null;
	}

	async function submitTrade() {
		const symbol = formSymbol.trim().toUpperCase();
		const entryPrice = num(formEntryPrice);
		const qty = num(formQuantity);
		const stopLoss = num(formStopLoss);
		const takeProfit = num(formTakeProfit);
		if (!symbol || entryPrice == null || qty == null) {
			toast.error("Symbol, entry price, and quantity are required.");
			return;
		}
		if (stopLoss == null || takeProfit == null) {
			toast.error("Stop loss and take profit are required.");
			return;
		}
		const rr = riskRewardRatio(entryPrice, stopLoss, takeProfit, formSide);
		if (rr == null) {
			toast.error(
				formSide === "long"
					? "For a long, stop must be below entry and take profit above entry."
					: "For a short, stop must be above entry and take profit below entry."
			);
			return;
		}

		const dollarRisk = stopLossPnL != null ? Math.abs(stopLossPnL) : 0;
		const openedAtIso = new Date(formOpenedAt).toISOString();
		const exitPrice = formStatus === "closed" ? (num(formExitPrice) ?? null) : null;
		const closedAtIso =
			formStatus === "closed" && formClosedAt?.trim()
				? new Date(formClosedAt).toISOString()
				: null;

		saving = true;
		try {
			if (editingTradeId) {
				await tradeStore.updateTrade(supabase, editingTradeId, {
					instrument_id: selectedInstrument?.id ?? null,
					symbol,
					side: formSide,
					status: formStatus,
					entry_price: entryPrice,
					exit_price: exitPrice,
					quantity: qty,
					stop_loss: stopLoss,
					take_profit: takeProfit,
					risk: dollarRisk,
					pnl: formStatus === "closed" ? (num(formPnl) ?? 0) : 0,
					opened_at: openedAtIso,
					closed_at: closedAtIso,
					notes: formNotes.trim() || null,
					strategy_ids: formStrategyIds,
					mistake_ids: formStatus === "closed" ? formMistakeIds : [],
				});
				toast.success("Trade updated.");
			} else {
				await tradeStore.createTrade(supabase, {
					account_id: null,
					backtest_session_id: sessionId,
					instrument_id: selectedInstrument?.id ?? null,
					symbol,
					side: formSide,
					status: formStatus,
					entry_price: entryPrice,
					exit_price: exitPrice,
					quantity: qty,
					stop_loss: stopLoss,
					take_profit: takeProfit,
					risk: dollarRisk,
					pnl: formStatus === "closed" ? (num(formPnl) ?? 0) : 0,
					opened_at: openedAtIso,
					closed_at: closedAtIso,
					notes: formNotes.trim() || undefined,
					strategy_ids: formStrategyIds,
					mistake_ids: formStatus === "closed" ? formMistakeIds : [],
				});
				toast.success("Trade saved.");
			}
			closeSheet();
			await tradeStore.getTradesByAccount(supabase, { sessionId, pageSize: 100 });
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save trade.");
		} finally {
			saving = false;
		}
	}

	async function deleteTrade() {
		if (!editingTradeId) return;
		const ok = await confirm({
			title: "Delete this trade?",
			description: "This cannot be undone.",
			destructive: true,
		});
		if (!ok) return;
		deleting = true;
		try {
			await tradeStore.deleteTrade(supabase, editingTradeId);
			closeSheet();
			toast.success("Trade deleted.");
			await tradeStore.getTradesByAccount(supabase, { sessionId, pageSize: 100 });
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete trade.");
		} finally {
			deleting = false;
		}
	}

	function formatDate(iso: string | null) {
		if (!iso) return "—";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "—";
		return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(d);
	}

	onMount(() => {
		void backtestSessionStore.getById(supabase, sessionId);
		void tradeStore.getTradesByAccount(supabase, { sessionId, pageSize: 100 });
		if (!instrumentStore.instruments?.length) {
			void instrumentStore.getInstruments(supabase);
		}
		if (!strategyStore.strategies?.length) {
			void strategyStore.getStrategies?.(supabase);
		}
		if (!mistakeStore.mistakes?.length) {
			void mistakeStore.getMistakes?.(supabase);
		}

		return () => {
			tradeStore.clear();
		};
	});
</script>

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>
				<a href="/tools/backtesting" class="hover:underline">Backtesting</a>
			</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>{sess?.name ?? "Session"}</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-7xl space-y-4 p-4 md:p-6">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<div class="flex items-center gap-2">
					<FlaskIcon size={20} class="text-muted-foreground shrink-0" />
					<h1 class="truncate text-2xl font-bold tracking-tight">{sess?.name ?? "—"}</h1>
					{#if sess?.archived}
						<span class="rounded-md bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">Archived</span>
					{/if}
				</div>
				{#if sess?.description}
					<p class="mt-1 text-sm text-muted-foreground">{sess.description}</p>
				{/if}
				{#if sess?.period_start || sess?.period_end}
					<p class="mt-1 text-xs text-muted-foreground tabular-nums">
						{formatDate(sess.period_start)} → {formatDate(sess.period_end)}
					</p>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button variant="outline" onclick={() => (shareOpen = true)} class="cursor-pointer rounded-md">
					<ShareNetworkIcon />
					Share
				</Button>
				<Button variant="outline" onclick={() => (summaryOpen = true)} class="cursor-pointer rounded-md">
					<FileTextIcon />
					View summary
				</Button>
				<Button onclick={openCreate} class="cursor-pointer rounded-md">
					<PlusIcon />
					New trade
				</Button>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Trades</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{stats.count}</div>
			</div>
			<div class={[
				"rounded-md border p-4 transition-colors",
				stats.netPnl > 0 && "border-emerald-700/30 bg-emerald-700/5",
				stats.netPnl < 0 && "border-rose-700/30 bg-rose-700/5",
				stats.netPnl === 0 && "bg-background"
			]}>
				<div class="text-xs text-muted-foreground">Net P&amp;L</div>
				<div class={[
					"mt-1 text-2xl font-semibold tabular-nums",
					stats.netPnl > 0 && "text-emerald-700 dark:text-emerald-400",
					stats.netPnl < 0 && "text-rose-700 dark:text-rose-400"
				]}>
					{formatUsd(stats.netPnl)}
				</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Avg risk/reward</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{formatRiskReward(stats.avgRr)}</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Win rate (closed)</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">
					{stats.winRate == null ? "—" : `${Math.round(stats.winRate * 100)}%`}
				</div>
			</div>
		</div>

		{#if sess?.starting_balance != null}
			<div class="rounded-md border bg-background p-4 flex items-center justify-between gap-4">
				<div>
					<div class="text-xs text-muted-foreground">Equity</div>
					<div class="mt-0.5 text-sm tabular-nums">
						<span class="text-muted-foreground">Start</span> {formatUsd(equityCurve.start)}
						<span class="mx-2 text-muted-foreground">→</span>
						<span class="font-medium">{formatUsd(equityCurve.end)}</span>
					</div>
				</div>
				{#if equityCurve.start > 0}
					{@const pct = ((equityCurve.end - equityCurve.start) / equityCurve.start) * 100}
					<div class={[
						"text-sm font-medium tabular-nums",
						pct > 0 && "text-emerald-700 dark:text-emerald-400",
						pct < 0 && "text-rose-700 dark:text-rose-400"
					]}>
						{pct > 0 ? "+" : ""}{pct.toFixed(2)}%
					</div>
				{/if}
			</div>
		{/if}

		<div class="rounded-md border bg-background">
			<div class="flex items-center justify-between gap-3 border-b px-4 py-3">
				<div class="text-sm font-medium">Trades</div>
			</div>

			{#if loadingTrades && trades.length === 0}
				<div class="p-4 space-y-2">
					{#each [0, 1, 2] as _}
						<Skeleton class="h-8 w-full" />
					{/each}
				</div>
			{:else if trades.length === 0}
				<div class="p-10 text-center">
					<div class="text-sm font-medium">No trades in this session</div>
					<div class="mt-1 text-sm text-muted-foreground">Log your first hypothetical trade.</div>
				</div>
			{:else}
				<div class="w-full overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
								<th class="whitespace-nowrap">Symbol</th>
								<th class="whitespace-nowrap">Side</th>
								<th class="whitespace-nowrap">Status</th>
								<th class="text-right whitespace-nowrap">Entry</th>
								<th class="text-right whitespace-nowrap">Exit</th>
								<th class="text-right whitespace-nowrap">Qty</th>
								<th class="text-right whitespace-nowrap">Stop</th>
								<th class="text-right whitespace-nowrap">Target</th>
								<th class="text-right whitespace-nowrap">R:R</th>
								<th class="whitespace-nowrap">Opened</th>
								<th class="text-right whitespace-nowrap">P&amp;L</th>
								<th class="w-12 text-right whitespace-nowrap"></th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each trades as t (t.id)}
								{@const side = normalizeSide(t.side)}
								{@const pnl = num(t.pnl)}
								<tr class="[&>td]:px-4 [&>td]:py-3 hover:bg-muted/30">
									<td class="font-medium whitespace-nowrap text-xs">{t.symbol}</td>
									<td class="whitespace-nowrap text-xs">
										{#if side === "long"}
											<span class="inline-flex items-center gap-1 rounded-md bg-emerald-700/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
												<ChartLineUpIcon size={12} /> Long
											</span>
										{:else if side === "short"}
											<span class="inline-flex items-center gap-1 rounded-md bg-rose-700/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">
												<ChartLineDownIcon size={12} /> Short
											</span>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</td>
									<td class="whitespace-nowrap text-xs">
										<span class={[
											"inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize",
											t.status === "open"
												? "bg-amber-700/10 text-amber-700 dark:text-amber-400"
												: "bg-muted text-muted-foreground"
										]}>
											{t.status}
										</span>
									</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatPrice(t.entry_price)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatPrice(t.exit_price)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatQty(t.quantity)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatPrice(t.stop_loss)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatPrice(t.take_profit)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatRiskReward(rowRiskReward(t))}</td>
									<td class="tabular-nums whitespace-nowrap text-xs">{formatWhen(t.opened_at)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">
										<span class={[
											"font-medium",
											pnl != null && pnl > 0 && "text-emerald-700 dark:text-emerald-400",
											pnl != null && pnl < 0 && "text-rose-700 dark:text-rose-400",
											(pnl == null || pnl === 0) && "text-muted-foreground"
										]}>
											{formatUsd(pnl)}
										</span>
									</td>
									<td class="text-right whitespace-nowrap text-xs">
										<Button
											variant="ghost"
											size="icon"
											class="h-8 w-8 cursor-pointer"
											aria-label="Edit trade"
											onclick={() => openEdit(t)}
										>
											<PencilSimpleIcon size={16} class="text-muted-foreground" />
										</Button>
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

<Dialog.Root bind:open={tradeSheetOpen} onOpenChange={(o: boolean) => { if (!o) closeSheet(); }}>
	<Dialog.Content class="w-[min(100vw,560px)] sm:max-w-[560px] max-h-[90vh] flex flex-col p-0 gap-0">
		<Dialog.Header class="px-5 pt-5 pb-3 border-b">
			<Dialog.Title>{isEditingTrade ? "Edit trade" : "New backtest trade"}</Dialog.Title>
			<Dialog.Description>
				{isEditingTrade ? "Update this hypothetical trade." : "Log a hypothetical trade against this strategy."}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Symbol</div>
				{#if sessionInstrument}
					<div class="border-input bg-muted/30 text-muted-foreground flex h-9 w-full items-center rounded-md border px-3 text-sm">
						{sessionInstrument.symbol}
					</div>
				{:else}
					<Select.Root type="single" bind:value={formSymbol}>
						<Select.Trigger class="w-full rounded-md cursor-pointer">
							<span>{formSymbol || "Select symbol"}</span>
						</Select.Trigger>
						<Select.Content class="rounded-md">
							{#each instrumentStore.instruments as instrument}
								<Select.Item value={instrument.symbol} class="cursor-pointer">
									{instrument.symbol}
								</Select.Item>
							{:else}
								<div class="px-2 py-3 text-center text-xs text-muted-foreground">No instruments yet.</div>
							{/each}
						</Select.Content>
					</Select.Root>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Side</div>
					<Select.Root type="single" bind:value={formSide}>
						<Select.Trigger class="w-full rounded-md cursor-pointer">
							<span class="capitalize">{formSide}</span>
						</Select.Trigger>
						<Select.Content class="rounded-md">
							<Select.Item value="long" class="cursor-pointer"><ChartLineUpIcon class="mr-2 h-4 w-4" /> Long</Select.Item>
							<Select.Item value="short" class="cursor-pointer"><ChartLineDownIcon class="mr-2 h-4 w-4" /> Short</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Status</div>
					<Select.Root type="single" bind:value={formStatus}>
						<Select.Trigger class="w-full rounded-md cursor-pointer">
							<span class="capitalize">{formStatus}</span>
						</Select.Trigger>
						<Select.Content class="rounded-md">
							<Select.Item value="open" class="cursor-pointer"><CaretUpIcon size={16} /> Open</Select.Item>
							<Select.Item value="closed" class="cursor-pointer"><CaretDownIcon size={16} /> Closed</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Entry price</div>
					<Input bind:value={formEntryPrice} inputmode="decimal" placeholder="Required" class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Quantity</div>
					<Input bind:value={formQuantity} inputmode="decimal" placeholder="Required" class="rounded-md" />
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Stop loss</div>
					<Input bind:value={formStopLoss} inputmode="decimal" placeholder="Required" class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Take profit</div>
					<Input bind:value={formTakeProfit} inputmode="decimal" placeholder="Required" class="rounded-md" />
				</div>
			</div>

			<div class="rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
				<div class="grid grid-cols-2 gap-3 tabular-nums">
					<div>
						<div class="text-muted-foreground">Risk / reward</div>
						<div class="mt-0.5 font-medium">{formatRiskReward(formPlannedRR)}</div>
					</div>
					<div>
						<div class="text-muted-foreground">If stopped</div>
						<div class="mt-0.5 font-medium text-rose-700 dark:text-rose-400">{formatUsd(stopLossPnL)}</div>
					</div>
				</div>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Opened at</div>
				<DateTimePicker value={formOpenedAt} onValueChange={(v) => (formOpenedAt = v ?? toDatetimeLocalValue(new Date()))} />
			</div>

			{#if formStatus === "closed"}
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Exit price</div>
						<Input bind:value={formExitPrice} inputmode="decimal" placeholder="Optional" class="rounded-md" />
					</div>
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Closed at</div>
						<DateTimePicker value={formClosedAt} onValueChange={(v) => (formClosedAt = v)} clearable />
					</div>
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">P&amp;L</div>
					<Input bind:value={formPnl} inputmode="decimal" placeholder="Auto-calculated" class="rounded-md" />
				</div>
			{/if}

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Strategies</div>
				<MultiSelect
					bind:selected={formStrategyIds}
					options={strategyStore.strategies.map((s) => ({ value: s.id, label: s.name }))}
					placeholder={strategyStore.strategies.length === 0 ? "Create one in Strategies & Mistakes" : "Tag strategies used"}
					emptyText="No strategies yet."
				/>
			</div>

			{#if formStatus === "closed"}
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Mistakes</div>
					<MultiSelect
						bind:selected={formMistakeIds}
						options={mistakeStore.mistakes.map((m) => ({ value: m.id, label: m.name }))}
						placeholder={mistakeStore.mistakes.length === 0 ? "Create one in Strategies & Mistakes" : "Tag mistakes (post-trade)"}
						emptyText="No mistakes catalogued yet."
					/>
				</div>
			{/if}

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Notes</div>
				<textarea
					bind:value={formNotes}
					rows="3"
					class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1"
					placeholder="Optional"
				></textarea>
			</div>
		</div>

		<Dialog.Footer class="border-t px-5 py-3">
			<div class="flex w-full items-center justify-between gap-2">
				{#if isEditingTrade}
					<Button
						variant="ghost"
						class="rounded-md cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
						disabled={deleting || saving}
						onclick={deleteTrade}
					>
						<TrashIcon size={16} />
						{deleting ? "Deleting…" : "Delete"}
					</Button>
				{:else}
					<div></div>
				{/if}
				<div class="flex gap-2">
					<Button variant="outline" class="rounded-md cursor-pointer" onclick={closeSheet}>Cancel</Button>
					<Button
						class="rounded-md cursor-pointer"
						disabled={!formSymbol.trim() || saving || deleting}
						onclick={submitTrade}
					>
						{saving ? "Saving…" : isEditingTrade ? "Save changes" : "Create trade"}
					</Button>
				</div>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={summaryOpen}>
	<Dialog.Content class="w-[min(100vw,960px)] sm:max-w-[960px] max-h-[90vh] flex flex-col p-0 gap-0">
		<Dialog.Header class="px-5 pt-5 pb-3 border-b">
			<Dialog.Title>Session summary</Dialog.Title>
			<Dialog.Description>
				Detailed report of trades, performance, and notes for this backtest.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex-1 overflow-y-auto px-5 py-4">
			<SessionSummary
				session={sess}
				trades={trades}
				strategies={strategyStore.strategies ?? []}
				mistakes={mistakeStore.mistakes ?? []}
				instrumentSymbol={sessionInstrument?.symbol ?? null}
			/>
		</div>
		<Dialog.Footer class="border-t px-5 py-3">
			<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (summaryOpen = false)}>
				Close
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<PnlShareDialog
	variant="session"
	bind:open={shareOpen}
	name={sess?.name ?? "Backtest"}
	instrument={sessionInstrument?.symbol ?? null}
	netPnl={stats.netPnl}
	trades={stats.count}
	winRate={stats.winRate}
	avgRr={stats.avgRr}
	startingBalance={equityCurve.start}
	endingBalance={equityCurve.end}
	periodStart={sess?.period_start ?? null}
	periodEnd={sess?.period_end ?? null}
	tradeBars={tradeBars}
/>
