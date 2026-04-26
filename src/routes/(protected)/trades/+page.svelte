<script lang="ts">
	import { onMount } from "svelte";
	import type { Session } from "@supabase/supabase-js";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import {
		CaretDownIcon,
		CaretUpIcon,
		ChartLineDownIcon,
		ChartLineUpIcon,
		FunnelIcon,
		MagnifyingGlassIcon,
		PencilSimpleIcon,
		PlusIcon,
		PulseIcon
	} from "phosphor-svelte";
	import * as Select from "$lib/components/ui/select/index.js";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { instrumentStore } from "$lib/stores/instruments.svelte";

    interface Instrument {
        id: string;
        symbol: string;
        exchange: string;
        market_type: string;
        base_currency: string;
        quote_currency: string;
        contract_size: number;
        tick_size: number;
        tick_value: number;
        expiry_date: string;
        max_leverage: number;
        is_active: boolean;
        created_at: string;
    }

	interface TradeRow {
		id: string;
		user_id: string;
		account_id: string | null;
		instrument_id: string | null;
		symbol: string;
		market: string | null;
		side: string | null;
		status: "open" | "closed";
		entry_price: string | number;
		exit_price: string | number | null;
		quantity: string | number;
		stop_loss: string | number | null;
		take_profit: string | number | null;
		risk: string | number | null;
		pnl: string | number | null;
		r_multiple: string | number | null;
		opened_at: string;
		closed_at: string | null;
		notes: string | null;
		created_at: string;
		updated_at: string;
	}

	type SideFilter = "all" | "long" | "short";
	type StatusFilter = "all" | "open" | "closed";

	function toDatetimeLocalValue(d: Date) {
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	let session = $state<Session | null>(null);
	let saveError = $state<string | null>(null);
	let saving = $state(false);

	const trades = $derived.by((): TradeRow[] => (tradeStore.trades ?? []) as TradeRow[]);
	const loading = $derived(tradeStore.loading);

	let searchQuery = $state("");
	let directionFilter = $state<SideFilter>("all");
	let statusFilter = $state<StatusFilter>("all");

	let tradeSheetOpen = $state(false);
	let editingTradeId = $state<string | null>(null);

	const isEditingTrade = $derived(editingTradeId != null);
	let formSymbol = $derived("")
	let formSide = $state<"long" | "short">("long");
	let formStatus = $state<"open" | "closed">("open");
	let formEntryPrice = $state("");
	let formQuantity = $state("1");
	let formOpenedAt = $state(toDatetimeLocalValue(new Date()));
	let formExitPrice = $state("");
	let formClosedAt = $state<string | null>(null);
	let formPnl = $state("");
	let formStopLoss = $state("");
	let formTakeProfit = $state("");
	/** Max loss in account currency if the stop is hit (stored in `risk`). */
	let formDollarRisk = $state("");
	/** Last P&amp;L we auto-filled (from exit prices or risk × R:R); edit P&amp;L to override. */
	let lastAutoPnl = $state<string | null>(null);
	let formNotes = $state("");

	function resetNewTradeForm() {
		formSymbol = "";
		formSide = "long";
		formStatus = "open";
		formEntryPrice = "";
		formQuantity = "1";
		formOpenedAt = toDatetimeLocalValue(new Date());
		formExitPrice = "";
		formClosedAt = null;
		formPnl = "";
		formStopLoss = "";
		formTakeProfit = "";
		formDollarRisk = "";
		lastAutoPnl = null;
		formNotes = "";
	}

	function closeTradeSheet() {
		tradeSheetOpen = false;
		saveError = null;
		editingTradeId = null;
		resetNewTradeForm();
	}

	function openTradeSheetCreate() {
		editingTradeId = null;
		resetNewTradeForm();
		tradeSheetOpen = true;
	}

	function openTradeSheetEdit(t: TradeRow) {
		saveError = null;
		editingTradeId = t.id;
		formSymbol = t.symbol ?? "";
		formSide = normalizeSide(t.side) ?? "long";
		formStatus = t.status;
		formEntryPrice = num(t.entry_price) != null ? String(num(t.entry_price)) : "";
		formQuantity = num(t.quantity) != null ? String(num(t.quantity)) : "1";
		formStopLoss = num(t.stop_loss) != null ? String(num(t.stop_loss)) : "";
		formTakeProfit = num(t.take_profit) != null ? String(num(t.take_profit)) : "";
		formOpenedAt = t.opened_at
			? toDatetimeLocalValue(new Date(t.opened_at))
			: toDatetimeLocalValue(new Date());
		formExitPrice = num(t.exit_price) != null ? String(num(t.exit_price)) : "";
		formClosedAt = t.closed_at ? toDatetimeLocalValue(new Date(t.closed_at)) : null;
		formPnl = num(t.pnl) != null ? String(num(t.pnl)) : "";
		formDollarRisk = num(t.risk) != null ? String(num(t.risk)) : "";
		lastAutoPnl = null;
		formNotes = t.notes ?? "";
		tradeSheetOpen = true;
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

	/** Reward:risk from entry, stop, and take profit (price distance). */
	function riskRewardRatio(
		entry: number,
		stop: number,
		takeProfit: number,
		side: "long" | "short"
	): number | null {
		if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(takeProfit)) return null;
		const riskDist = side === "long" ? entry - stop : stop - entry;
		const rewardDist = side === "long" ? takeProfit - entry : entry - takeProfit;
		if (riskDist <= 0 || rewardDist <= 0) return null;
		return rewardDist / riskDist;
	}

	function formatRiskReward(rr: number | null | undefined) {
		if (rr == null || !Number.isFinite(rr)) return "—";
		return `1 : ${rr.toFixed(2)} (per contract)`;
	}

	function rowRiskReward(t: TradeRow): number | null {
		const e = num(t.entry_price);
		const sl = num(t.stop_loss);
		const tp = num(t.take_profit);
		const s = normalizeSide(t.side);
		if (e == null || sl == null || tp == null || (s !== "long" && s !== "short")) return null;
		return riskRewardRatio(e, sl, tp, s);
	}

	const filteredTrades = $derived.by((): TradeRow[] => {
		const q = searchQuery.trim().toLowerCase();
		return trades.filter((t) => {
			const rowSide = normalizeSide(t.side);
			if (directionFilter !== "all" && rowSide !== directionFilter) return false;
			if (statusFilter !== "all" && t.status !== statusFilter) return false;
			if (!q) return true;
			return (
				t.symbol.toLowerCase().includes(q) ||
				(t.side ?? "").toLowerCase().includes(q) ||
				t.status.toLowerCase().includes(q)
			);
		});
	});

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
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit"
		}).format(d);
	}

    function getPointValue(instr: Instrument | undefined) {
        if (!instr) return 1;

        // value of 1.0 price move
        const perPoint = instr.tick_value / instr.tick_size;

        // contract multiplier (if applicable)
        return perPoint * (instr.contract_size ?? 1);
    }

    function getInstrumentValue(instr: Instrument | undefined) {
        if (!instr) return 1;

        return (instr.tick_value / instr.tick_size) * (instr.contract_size ?? 1);
    }

    const selectedInstrument = $derived.by(() => {
        return instrumentStore.instruments?.find(
            (i) => i.symbol === formSymbol
        );
    });

	const stats = $derived.by(() => {
		const rows = filteredTrades;
		const closed = rows.filter((t) => t.status === "closed");
		const netPnl = rows.reduce((acc, t) => {
            const entry = num(t.entry_price);
            const exit = num(t.exit_price);
            const qty = num(t.quantity);
            const instr = instrumentStore.instruments?.find(i => i.symbol === t.symbol);

            if (entry == null || exit == null || qty == null || !instr) {
                return acc + (num(t.pnl) ?? 0);
            }

            const pointValue = getPointValue(instr);

            const move = t.side === "long"
                ? exit - entry
                : entry - exit;

            return acc + move * pointValue * qty;
        }, 0);
		const wins = closed.filter((t) => (num(t.pnl) ?? 0) > 0).length;
		const winRate = closed.length ? wins / closed.length : null;
		const rrValues: number[] = [];
		for (const t of rows) {
			const e = num(t.entry_price);
			const sl = num(t.stop_loss);
			const tp = num(t.take_profit);
			const s = normalizeSide(t.side);
			if (e != null && sl != null && tp != null && (s === "long" || s === "short")) {
				const rr = riskRewardRatio(e, sl, tp, s);
				if (rr != null) rrValues.push(rr);
			}
		}
		const avgRr =
			rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : null;
		return { count: rows.length, netPnl, winRate, avgRr };
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
        const instr = selectedInstrument;
        const valuePerPoint = getInstrumentValue(instr);

        if (entry != null && exit != null && qty != null) {
            const move = formSide === "long"
                ? exit - entry
                : entry - exit;

            const raw = move * valuePerPoint * qty;

            return raw.toFixed(2);
        }

        // fallback: risk × RR (instrument-independent)
        const d = num(formDollarRisk);
        const rr = formPlannedRR;
        if (d != null && rr != null && d > 0) {
            return (d * rr).toFixed(2);
        }

        return null;
    });

	const closedPnlUsesExitPrice = $derived.by(() => {
		if (formStatus !== "closed") return false;
		const entry = num(formEntryPrice);
		const exit = num(formExitPrice);
		const qty = num(formQuantity);
		return entry != null && exit != null && qty != null;
	});

	const pnlAtFullTarget = $derived.by(() => {
        const entry = num(formEntryPrice);
        const stop = num(formStopLoss);
        const tp = num(formTakeProfit);
        const risk = num(formDollarRisk);

        const instr = selectedInstrument;
        const valuePerPoint = getInstrumentValue(instr);

        if (
            entry == null ||
            stop == null ||
            tp == null ||
            risk == null ||
            risk <= 0 ||
            !instr
        ) return null;

        // price distances
        const riskDist = Math.abs(entry - stop);
        const rewardDist = Math.abs(tp - entry);

        if (riskDist === 0) return null;

        // R:R
        const rr = rewardDist / riskDist;

        // SCALE BY INSTRUMENT + QUANTITY LOGIC
        // risk is total risk → normalize per contract
        const contracts = num(formQuantity) ?? 1;

        const riskPerContract = risk / contracts;

        // reward scales with contracts + instrument value
        const pnlPerContract =
            (riskPerContract / riskDist) * rewardDist;

        return pnlPerContract * contracts;
    });

	/** When closed, set P&amp;L from exit/entry/qty if exit is filled; otherwise from risk × R:R. */
	$effect(() => {
		const suggested = suggestedClosedPnl;
		if (suggested == null) return;
		const shouldSync = formPnl === "" || formPnl === lastAutoPnl;
		if (shouldSync) {
			formPnl = suggested;
			lastAutoPnl = suggested;
		}
	});

	async function refreshSession() {
		const {
			data: { session: s }
		} = await supabase.auth.getSession();
		session = s;
	}

	async function submitTradeForm() {
		saveError = null;
		if (!session?.user?.id) {
			saveError = "Sign in to save a trade.";
			return;
		}

		const accountId = accountStore.activeAccountId;
		if (!accountId) {
			saveError = "Select an account in the sidebar before saving a trade.";
			return;
		}

		const symbol = formSymbol.trim().toUpperCase();
		const entryPrice = num(formEntryPrice);
		const qty = num(formQuantity);
		const stopLoss = num(formStopLoss);
		const takeProfit = num(formTakeProfit);
		if (!symbol || entryPrice == null || qty == null) {
			saveError = "Symbol, entry price, and quantity are required.";
			return;
		}
		if (stopLoss == null || takeProfit == null) {
			saveError = "Stop loss and take profit are required to record the trade and risk/reward.";
			return;
		}

		const rr = riskRewardRatio(entryPrice, stopLoss, takeProfit, formSide);
		if (rr == null) {
			saveError =
				formSide === "long"
					? "For a long, stop must be below entry and take profit above entry."
					: "For a short, stop must be above entry and take profit below entry.";
			return;
		}

		const dollarRisk = num(formDollarRisk);
		if (dollarRisk == null || dollarRisk <= 0) {
			saveError = "Enter how much you are risking in dollars (e.g. 250).";
			return;
		}

		saving = true;
		const openedAtIso = new Date(formOpenedAt).toISOString();
		const exitPrice = formStatus === "closed" ? (num(formExitPrice) ?? null) : null;
		const closedAtIso =
			formStatus === "closed" && formClosedAt?.trim()
				? new Date(formClosedAt).toISOString()
				: null;

		try {
			if (editingTradeId) {
				const existing = trades.find((x) => x.id === editingTradeId);
				await tradeStore.updateTrade(supabase, editingTradeId, {
					instrument_id: existing?.instrument_id ?? null,
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
					notes: formNotes.trim() || null
				});
			} else {
				await tradeStore.createTrade(supabase, {
					account_id: accountId,
					instrument_id: null,
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
					notes: formNotes.trim() || undefined
				});
			}

			closeTradeSheet();
		} catch (e) {
			saveError = e instanceof Error ? e.message : "Failed to save trade.";
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		resetNewTradeForm();
		void refreshSession();
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange(() => {
			void refreshSession();
		});
		return () => subscription.unsubscribe();
	});

	$effect(() => {
		if (!session?.user?.id) return;
		void accountStore.activeAccountId;
		void tradeStore.getTradesByAccount(supabase);
	});

    $effect(() => {
        const first = instrumentStore.instruments?.[0];
        if (!first) return;

        if (!formSymbol) {
            formSymbol = first.symbol;
        }
    });

    const stopLossPnL = $derived.by(() => {
        const risk = num(formDollarRisk);
        if (risk == null || risk <= 0) return null;
        return -risk;
    });
</script>

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Page>Trades</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>
<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-6xl space-y-4 p-4 md:p-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Trades</h1>
				<p class="text-sm text-muted-foreground">Create and manage your trades.</p>
			</div>
			<Button
				onclick={openTradeSheetCreate}
				variant="outline"
				class="cursor-pointer rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
				disabled={!session || !accountStore.activeAccountId}
			>
				<PlusIcon />
				New Trade
			</Button>
		</div>

		{#if !loading && !session}
			<div class="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
				Sign in with Supabase Auth to load and create trades. Your user must have a row in
				<code class="rounded bg-muted px-1">app.profiles</code> for inserts (FK).
			</div>
		{/if}

		{#if !loading && session && !accountStore.activeAccountId}
			<div class="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
				Choose an account from the sidebar to load and create trades for that account.
			</div>
		{/if}

		<div class="flex flex-wrap items-center gap-3">
			<div class="relative w-full max-w-sm">
				<Input
					type="text"
					placeholder="Search trades..."
					class="pl-9 rounded-md"
					bind:value={searchQuery}
					disabled={!session || !accountStore.activeAccountId}
				/>
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<MagnifyingGlassIcon size={16} class="text-muted-foreground" />
				</div>
			</div>
			<Select.Root type="single" bind:value={directionFilter}>
				<Select.Trigger class="w-[160px] rounded-md cursor-pointer" disabled={!session || !accountStore.activeAccountId}>
					<FunnelIcon size={16} class="text-muted-foreground" />
					<span class="capitalize">{directionFilter === "all" ? "All sides" : directionFilter}</span>
				</Select.Trigger>
				<Select.Content class="rounded-md">
					<Select.Item value="all" class="cursor-pointer">All sides</Select.Item>
					<Select.Item value="long" class="cursor-pointer">
						<ChartLineUpIcon class="mr-2 h-4 w-4" />
						Long
					</Select.Item>
					<Select.Item value="short" class="cursor-pointer">
						<ChartLineDownIcon class="mr-2 h-4 w-4" />
						Short
					</Select.Item>
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={statusFilter}>
				<Select.Trigger class="w-[160px] rounded-md cursor-pointer" disabled={!session || !accountStore.activeAccountId}>
					<PulseIcon class="mr-2 h-4 w-4" />
					<span class="capitalize">
						{statusFilter === "all" ? "All statuses" : statusFilter}
					</span>
				</Select.Trigger>
				<Select.Content class="rounded-md">
					<Select.Item value="all" class="cursor-pointer">All statuses</Select.Item>
					<Select.Item value="open" class="cursor-pointer">
						<CaretUpIcon size={16} />
						Open
					</Select.Item>
					<Select.Item value="closed" class="cursor-pointer">
						<CaretDownIcon size={16} />
						Closed
					</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>

		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Trades</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{stats.count}</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Net P&amp;L</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{formatUsd(stats.netPnl)}</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Avg risk/reward</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">
					{formatRiskReward(stats.avgRr)}
				</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Win rate (closed)</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">
					{stats.winRate == null ? "—" : `${Math.round(stats.winRate * 100)}%`}
				</div>
			</div>
		</div>

		<div class="rounded-md border bg-background">
			<div class="flex items-center justify-between gap-3 border-b px-4 py-3">
				<div class="text-sm font-medium">All trades</div>
				<div class="text-xs text-muted-foreground">
					{#if loading}
						Loading…
					{:else}
						Showing <span class="tabular-nums">{filteredTrades.length}</span>
					{/if}
				</div>
			</div>

			{#if loading}
				<div class="p-10 text-center text-sm text-muted-foreground">Loading trades…</div>
			{:else if filteredTrades.length === 0}
				<div class="p-10 text-center">
					<div class="text-sm font-medium">No trades found</div>
					<div class="mt-1 text-sm text-muted-foreground">
						{!session
							? "Sign in to see your trades."
							: !accountStore.activeAccountId
								? "Select an account in the sidebar to load trades."
								: trades.length === 0
									? "Create your first trade to see it here."
									: "Try adjusting your search or filters."}
					</div>
				</div>
			{:else}
				<div class="w-full overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
								<th>Symbol</th>
								<th>Side</th>
								<th>Status</th>
								<th class="text-right">Entry</th>
								<th class="text-right">Exit</th>
								<th class="text-right">Qty</th>
								<th class="text-right">Stop</th>
								<th class="text-right">Target</th>
								<th class="text-right">R:R</th>
								<th>Opened</th>
								<th>Closed</th>
								<th class="text-right">P&amp;L</th>
								<th class="w-14 text-right"> </th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each filteredTrades as t (t.id)}
								<tr class="[&>td]:px-4 [&>td]:py-3 hover:bg-muted/30">
									<td class="font-medium">{t.symbol}</td>
									<td class="capitalize">{normalizeSide(t.side) ?? "—"}</td>
									<td class="capitalize">{t.status}</td>
									<td class="text-right tabular-nums">{formatPrice(t.entry_price)}</td>
									<td class="text-right tabular-nums">{formatPrice(t.exit_price)}</td>
									<td class="text-right tabular-nums">{formatQty(t.quantity)}</td>
									<td class="text-right tabular-nums">{formatPrice(t.stop_loss)}</td>
									<td class="text-right tabular-nums">{formatPrice(t.take_profit)}</td>
									<td class="text-right tabular-nums text-xs">{formatRiskReward(rowRiskReward(t))}</td>
									<td class="tabular-nums text-xs">{formatWhen(t.opened_at)}</td>
									<td class="tabular-nums text-xs">{formatWhen(t.closed_at)}</td>
									<td class="text-right tabular-nums">
										<span
											class={num(t.pnl) == null ? "" : (num(t.pnl) ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}
										>
											{formatUsd(num(t.pnl))}
										</span>
									</td>
									<td class="px-2 text-right">
										<Button
											variant="ghost"
											size="icon"
											class="h-8 w-8 shrink-0 cursor-pointer"
											aria-label="Edit trade"
											onclick={() => openTradeSheetEdit(t)}
										>
											<PencilSimpleIcon size={18} class="text-muted-foreground" />
										</Button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<Sheet.Root
			bind:open={tradeSheetOpen}
			onOpenChange={(open: boolean) => {
				if (!open) closeTradeSheet();
			}}
		>
			<Sheet.Content side="right" class="w-[min(100vw,520px)] sm:max-w-[520px]">
				<Sheet.Header>
					<Sheet.Title>{isEditingTrade ? "Edit trade" : "New trade"}</Sheet.Title>
					<Sheet.Description>
						{isEditingTrade
							? "Update details, for example when you close an open position."
							: "Place trade details"}
					</Sheet.Description>
				</Sheet.Header>

				{#if saveError}
					<div class="mx-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						{saveError}
					</div>
				{/if}

				<div class="px-4 pb-2 space-y-4">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Symbol</div>
						<!-- <Input bind:value={formSymbol} placeholder="e.g. ES, BTCUSDT" class="rounded-md" /> -->
                         <Select.Root type="single" bind:value={formSymbol}>
                            <Select.Trigger class="w-full rounded-md cursor-pointer">
                                <span class="capitalize">{formSymbol}</span>
                            </Select.Trigger>
                            <Select.Content class="rounded-md">
                                {#each instrumentStore.instruments as instrument}
                                    <Select.Item value={instrument.symbol} class="cursor-pointer">
                                        {instrument.symbol}
                                    </Select.Item>
                                {/each}
                            </Select.Content>
                         </Select.Root>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Side</div>
							<Select.Root type="single" bind:value={formSide}>
								<Select.Trigger class="w-full rounded-md cursor-pointer">
									<span class="capitalize">{formSide}</span>
								</Select.Trigger>
								<Select.Content class="rounded-md">
									<Select.Item value="long" class="cursor-pointer">
										<ChartLineUpIcon class="mr-2 h-4 w-4" />
										Long
									</Select.Item>
									<Select.Item value="short" class="cursor-pointer">
										<ChartLineDownIcon class="mr-2 h-4 w-4" />
										Short
									</Select.Item>
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
									<Select.Item value="open" class="cursor-pointer">
										<CaretUpIcon size={16} />
										Open
									</Select.Item>
									<Select.Item value="closed" class="cursor-pointer">
										<CaretDownIcon size={16} />
										Closed
									</Select.Item>
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

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Amount at risk ($)</div>
						<Input
							bind:value={formDollarRisk}
							inputmode="decimal"
							placeholder="e.g. 250"
							class="rounded-md"
						/>
						<p class="text-[11px] text-muted-foreground leading-snug">
							Max loss if your stop is hit. P&amp;L at full take profit uses this × your planned R:R.
						</p>
					</div>

					<div class="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1.5">
						<div>
							<div class="font-medium text-muted-foreground">Planned risk/reward</div>
							<div class="mt-0.5 tabular-nums">
								{formatRiskReward(formPlannedRR)}
								{#if formPlannedRR == null && num(formEntryPrice) != null && num(formStopLoss) != null && num(formTakeProfit) != null}
									<span class="text-muted-foreground"> (check side vs. stop/target levels)</span>
								{/if}
							</div>
						</div>
						<div class="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
							<div>
								<span class="text-muted-foreground">At full target:</span>
								<span class="ml-1 font-medium text-emerald-600">{formatUsd(pnlAtFullTarget)}</span>
							</div>
							<div>
								<span class="text-muted-foreground">If stopped out:</span>
								<span class="ml-1 font-medium text-red-600">
									{formatUsd(stopLossPnL)}
								</span>
							</div>
						</div>
					</div>

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Opened at</div>
						<Input type="datetime-local" bind:value={formOpenedAt} class="rounded-md" />
					</div>

					{#if formStatus === "closed"}
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Exit price</div>
								<Input bind:value={formExitPrice} inputmode="decimal" placeholder="Optional" class="rounded-md" />
							</div>
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Closed at</div>
								<Input
									type="datetime-local"
									value={formClosedAt ?? ""}
									oninput={(e) => (formClosedAt = (e.currentTarget as HTMLInputElement).value || null)}
									class="rounded-md"
								/>
							</div>
						</div>
					{/if}

					{#if formStatus === "closed"}
						<div class="space-y-1.5">
							<div class="text-xs font-medium">P&amp;L</div>
							<Input bind:value={formPnl} inputmode="decimal" placeholder="Optional" class="rounded-md" />
							<p class="text-[11px] text-muted-foreground leading-snug">
								{#if closedPnlUsesExitPrice}
									Recalculated from entry, exit, quantity, and side. Clear exit to use risk × R:R instead.
								{:else}
									Filled from risk × R:R when exit price is empty. Add an exit to derive P&amp;L from
									prices × quantity.
								{/if}
								Edit the field if you need a different number (fees, scaling, partials).
							</p>
						</div>
					{/if}

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Notes</div>
						<textarea
							bind:value={formNotes}
							rows="3"
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
							placeholder="Optional"
						></textarea>
					</div>
				</div>

				<Sheet.Footer class="border-t">
					<div class="flex justify-end gap-2">
						<Button variant="outline" class="rounded-md cursor-pointer" onclick={closeTradeSheet}>
							Cancel
						</Button>
						<Button
							class="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground cursor-pointer"
							disabled={!formSymbol.trim() || saving || !session || !accountStore.activeAccountId}
							onclick={submitTradeForm}
						>
							{saving ? "Saving…" : isEditingTrade ? "Save changes" : "Create trade"}
						</Button>
					</div>
				</Sheet.Footer>
			</Sheet.Content>
		</Sheet.Root>
	</div>
</ScrollArea>
