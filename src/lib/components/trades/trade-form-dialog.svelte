<script lang="ts">
	import type { Session } from "@supabase/supabase-js";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Select from "$lib/components/ui/select/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { DateTimePicker } from "$lib/components/ui/date-time-picker";
	import { MultiSelect } from "$lib/components/ui/multi-select";
	import {
		CaretDownIcon,
		CaretUpIcon,
		ChartLineDownIcon,
		ChartLineUpIcon,
		PlusIcon,
		TrashIcon
	} from "phosphor-svelte";
	import { confirm } from "$lib/components/ui/confirm-dialog";
	import { toast } from "svelte-sonner";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore, type TradeExecutionInput } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { instrumentStore, instrumentPnl } from "$lib/stores/instruments.svelte";
	import { strategyStore } from "$lib/stores/strategies.svelte";
	import { mistakeStore } from "$lib/stores/mistakes.svelte";
	import { checklistStore } from "$lib/stores/checklist.svelte";
	import { num, normalizeSide, riskRewardRatio } from "$lib/utils/number";
	import { formatPrice, formatQty, formatRiskReward, formatUsd } from "$lib/utils/format";
	import { toDatetimeLocalValue } from "$lib/utils/datetime";
	import type { TradeRow } from "./trade-utils";

	let {
		open = $bindable(false),
		editingTrade = null,
		session = null
	}: {
		open?: boolean;
		editingTrade?: TradeRow | null;
		session?: Session | null;
	} = $props();

	const isEditingTrade = $derived(editingTrade != null);
	const editingTradeId = $derived(editingTrade?.id ?? null);

	let saving = $state(false);
	let deleting = $state(false);
	let tradeStep = $state<1 | 2 | 3>(1);

	const EMOTIONAL_STATES = [
		"calm",
		"anxious",
		"fomo",
		"revenge",
		"confident",
		"fearful",
		"greedy",
		"disciplined",
		"impatient"
	] as const;

	let formEmotionalStates = $state<string[]>([]);
	let formConfidence = $state<number | null>(null);
	let formMentalState = $state("");
	let formFollowedPlan = $state<"yes" | "no" | "partial" | null>(null);
	let formEntryReason = $state("");
	let formExitReason = $state("");

	function toggleEmotionalState(s: string) {
		formEmotionalStates = formEmotionalStates.includes(s)
			? formEmotionalStates.filter((x) => x !== s)
			: [...formEmotionalStates, s];
	}

	let formSymbol = $state("");
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
	/** Last P&amp;L we auto-filled from exit prices; edit P&amp;L to override. */
	let lastAutoPnl = $state<string | null>(null);
	let formNotes = $state("");
	let formStrategyIds = $state<string[]>([]);
	let formMistakeIds = $state<string[]>([]);
	let formChecklistItemIds = $state<string[]>([]);
	/** Optional: when filled, derives stop loss from entry, qty, side, and instrument. */
	let formRiskInput = $state("");
	/** Optional: when filled, derives take profit from entry, qty, side, and instrument. */
	let formProfitInput = $state("");
	let showRiskProfit = $state(false);
	type DistUnit = "usd" | "ticks" | "points";
	let riskUnit = $state<DistUnit>("usd");
	let profitUnit = $state<DistUnit>("usd");

	type FillRow = { id: string; qty: string; price: string; at: string };
	let useFills = $state(false);
	let entryFills = $state<FillRow[]>([]);
	let exitFills = $state<FillRow[]>([]);

	let _fillIdCounter = 0;
	function newFillId(): string {
		_fillIdCounter += 1;
		return `f${Date.now().toString(36)}-${_fillIdCounter}`;
	}
	function emptyFill(at: string): FillRow {
		return { id: newFillId(), qty: "", price: "", at };
	}
	let formScreenshotFile = $state<File | null>(null);
	let formScreenshotPreview = $state<string | null>(null);
	let formExistingScreenshotUrl = $state<string | null>(null);

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
		lastAutoPnl = null;
		formNotes = "";
		formStrategyIds = [];
		formMistakeIds = [];
		formChecklistItemIds = [];
		formRiskInput = "";
		formProfitInput = "";
		showRiskProfit = false;
		riskUnit = "usd";
		profitUnit = "usd";
		useFills = false;
		entryFills = [];
		exitFills = [];
		formScreenshotFile = null;
		formScreenshotPreview = null;
		formExistingScreenshotUrl = null;
		formEmotionalStates = [];
		formConfidence = null;
		formMentalState = "";
		formFollowedPlan = null;
		formEntryReason = "";
		formExitReason = "";
		tradeStep = 1;
	}

	/** Populate the form from an existing trade for editing. */
	function loadFromTrade(t: TradeRow) {
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
		lastAutoPnl = null;
		formNotes = t.notes ?? "";
		formStrategyIds = [...(t.strategy_ids ?? [])];
		formMistakeIds = [...(t.mistake_ids ?? [])];
		formChecklistItemIds = [...(t.checklist_item_ids ?? [])];
		formRiskInput = "";
		formProfitInput = "";
		riskUnit = "usd";
		profitUnit = "usd";
		useFills = false;
		entryFills = [];
		exitFills = [];
		void loadTradeExecutions(t.id);
		formScreenshotFile = null;
		formScreenshotPreview = null;
		formExistingScreenshotUrl = t.screenshot_url ?? null;
		formEmotionalStates = [...(t.emotional_states ?? [])];
		formConfidence = t.confidence ?? null;
		formMentalState = t.mental_state ?? "";
		formFollowedPlan = t.followed_plan ?? null;
		formEntryReason = t.entry_reason ?? "";
		formExitReason = t.exit_reason ?? "";
		tradeStep = 1;
	}

	// Initialize on open (populate for edit, reset for create); reset again on close.
	let formInitialized = $state(false);
	$effect(() => {
		if (open && !formInitialized) {
			formInitialized = true;
			if (editingTrade) loadFromTrade(editingTrade);
			else resetNewTradeForm();
		} else if (!open && formInitialized) {
			formInitialized = false;
			resetNewTradeForm();
		}
	});

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
			open = false;
			toast.success("Trade deleted.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete trade.");
		} finally {
			deleting = false;
		}
	}

	const selectedInstrument = $derived.by(() => {
		return instrumentStore.instruments?.find((i) => i.symbol === formSymbol);
	});

	const formPlannedRR = $derived.by(() => {
		const e = num(formEntryPrice);
		const sl = num(formStopLoss);
		const tp = num(formTakeProfit);
		if (e == null || sl == null || tp == null) return null;
		return riskRewardRatio(e, sl, tp, formSide);
	});

	/** Per-contract per-side commission on the selected instrument (0 if none set). */
	const commissionPerSide = $derived(
		selectedInstrument?.commission_per_side != null
			? Number(selectedInstrument.commission_per_side) || 0
			: 0
	);

	/** Entry-side and (if closed) exit-side commission in account currency. */
	const commissionBreakdown = $derived.by(() => {
		const qty = num(formQuantity) ?? 0;
		const perSide = commissionPerSide * qty;
		const entry = perSide;
		const exit = formStatus === "closed" ? perSide : 0;
		return { perSide, entry, exit, total: entry + exit };
	});

	const suggestedClosedPnl = $derived.by((): string | null => {
		if (formStatus !== "closed") return null;

		const entry = num(formEntryPrice);
		const exit = num(formExitPrice);
		const qty = num(formQuantity);
		if (entry == null || exit == null || qty == null) return null;
		const gross = instrumentPnl(selectedInstrument, formSide, entry, exit, qty);
		return (gross - commissionBreakdown.total).toFixed(2);
	});

	/** Price distance from an input value in $, ticks, or points. */
	function priceDistanceFromInput(value: number, unit: DistUnit, qty: number): number | null {
		if (!selectedInstrument) return null;
		if (unit === "points") return value;
		if (unit === "ticks") return value * selectedInstrument.tick_size;
		const pv = selectedInstrument.tick_value / selectedInstrument.tick_size;
		if (!Number.isFinite(pv) || pv <= 0) return null;
		return value / (pv * qty);
	}

	/** Stop price implied by the risk input, snapped to tick size. */
	const impliedStop = $derived.by(() => {
		const risk = num(formRiskInput);
		const entry = num(formEntryPrice);
		const qty = num(formQuantity);
		if (risk == null || risk <= 0 || entry == null || qty == null || qty <= 0 || !selectedInstrument) return null;
		const distance = priceDistanceFromInput(risk, riskUnit, qty);
		if (distance == null || !Number.isFinite(distance) || distance <= 0) return null;
		const raw = formSide === "long" ? entry - distance : entry + distance;
		const tick = selectedInstrument.tick_size;
		return tick > 0 ? Math.round(raw / tick) * tick : raw;
	});

	// Auto-fill stop loss whenever implied stop changes from risk input
	$effect(() => {
		if (impliedStop == null) return;
		formStopLoss = String(Number(impliedStop.toFixed(8)));
	});

	/** Take profit price implied by the profit input, snapped to tick size. */
	const impliedTakeProfit = $derived.by(() => {
		const profit = num(formProfitInput);
		const entry = num(formEntryPrice);
		const qty = num(formQuantity);
		if (profit == null || profit <= 0 || entry == null || qty == null || qty <= 0 || !selectedInstrument) return null;
		const distance = priceDistanceFromInput(profit, profitUnit, qty);
		if (distance == null || !Number.isFinite(distance) || distance <= 0) return null;
		const raw = formSide === "long" ? entry + distance : entry - distance;
		const tick = selectedInstrument.tick_size;
		return tick > 0 ? Math.round(raw / tick) * tick : raw;
	});

	/** Distance from entry to stop loss expressed in ticks / points / $. */
	const stopDistance = $derived.by(() => {
		const entry = num(formEntryPrice);
		const stop = num(formStopLoss);
		const qty = num(formQuantity);
		if (entry == null || stop == null || !selectedInstrument) return null;
		const priceDist = Math.abs(entry - stop);
		if (priceDist <= 0) return null;
		const tick = selectedInstrument.tick_size;
		const ticks = tick > 0 ? priceDist / tick : null;
		const pv = tick > 0 ? selectedInstrument.tick_value / tick : null;
		const usd = pv != null && qty != null && qty > 0 ? priceDist * pv * qty : null;
		return { points: priceDist, ticks, usd };
	});

	/** Distance from entry to take profit expressed in ticks / points / $. */
	const takeProfitDistance = $derived.by(() => {
		const entry = num(formEntryPrice);
		const tp = num(formTakeProfit);
		const qty = num(formQuantity);
		if (entry == null || tp == null || !selectedInstrument) return null;
		const priceDist = Math.abs(entry - tp);
		if (priceDist <= 0) return null;
		const tick = selectedInstrument.tick_size;
		const ticks = tick > 0 ? priceDist / tick : null;
		const pv = tick > 0 ? selectedInstrument.tick_value / tick : null;
		const usd = pv != null && qty != null && qty > 0 ? priceDist * pv * qty : null;
		return { points: priceDist, ticks, usd };
	});

	function fmtDist(n: number | null | undefined, digits = 2): string {
		if (n == null || !Number.isFinite(n)) return "—";
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n);
	}

	/** Load existing executions for a trade and populate the fills editor. */
	async function loadTradeExecutions(tradeId: string) {
		try {
			const rows = await tradeStore.listExecutions(supabase, tradeId);
			const entries = rows
				.filter((r) => r.kind === "entry")
				.map((r): FillRow => ({
					id: newFillId(),
					qty: String(Number(r.quantity)),
					price: String(Number(r.price)),
					at: toDatetimeLocalValue(new Date(r.executed_at)),
				}));
			const exits = rows
				.filter((r) => r.kind === "exit")
				.map((r): FillRow => ({
					id: newFillId(),
					qty: String(Number(r.quantity)),
					price: String(Number(r.price)),
					at: toDatetimeLocalValue(new Date(r.executed_at)),
				}));
			if (entries.length > 1 || exits.length > 1) {
				useFills = true;
				entryFills = entries;
				exitFills = exits;
			}
		} catch (e) {
			console.warn("Could not load executions:", e);
		}
	}

	function addEntryFill() {
		entryFills = [...entryFills, emptyFill(formOpenedAt)];
	}
	function removeEntryFill(idx: number) {
		entryFills = entryFills.filter((_, i) => i !== idx);
	}
	function addExitFill() {
		exitFills = [...exitFills, emptyFill(formClosedAt ?? toDatetimeLocalValue(new Date()))];
	}
	function removeExitFill(idx: number) {
		exitFills = exitFills.filter((_, i) => i !== idx);
	}

	/** Aggregate of valid entry fills: total qty + weighted avg price. */
	const entryFillsAgg = $derived.by(() => {
		const rows = entryFills
			.map((r) => ({ qty: num(r.qty), price: num(r.price) }))
			.filter((r): r is { qty: number; price: number } => r.qty != null && r.qty > 0 && r.price != null);
		if (rows.length === 0) return null;
		const totalQty = rows.reduce((s, r) => s + r.qty, 0);
		const notional = rows.reduce((s, r) => s + r.qty * r.price, 0);
		return { qty: totalQty, avgPrice: notional / totalQty, count: rows.length };
	});

	/** Aggregate of valid exit fills. */
	const exitFillsAgg = $derived.by(() => {
		const rows = exitFills
			.map((r) => ({ qty: num(r.qty), price: num(r.price) }))
			.filter((r): r is { qty: number; price: number } => r.qty != null && r.qty > 0 && r.price != null);
		if (rows.length === 0) return null;
		const totalQty = rows.reduce((s, r) => s + r.qty, 0);
		const notional = rows.reduce((s, r) => s + r.qty * r.price, 0);
		return { qty: totalQty, avgPrice: notional / totalQty, count: rows.length };
	});

	/** Earliest entry-fill timestamp (ms). Drives opened_at when multi-fill is on. */
	const entryFillsFirstAtMs = $derived.by(() => {
		let best: number | null = null;
		for (const f of entryFills) {
			if (!f.at) continue;
			const ms = new Date(f.at).getTime();
			if (!Number.isFinite(ms)) continue;
			if (best == null || ms < best) best = ms;
		}
		return best;
	});

	/** Latest exit-fill timestamp (ms). Drives closed_at when multi-fill is on. */
	const exitFillsLastAtMs = $derived.by(() => {
		let best: number | null = null;
		for (const f of exitFills) {
			if (!f.at) continue;
			const ms = new Date(f.at).getTime();
			if (!Number.isFinite(ms)) continue;
			if (best == null || ms > best) best = ms;
		}
		return best;
	});

	/** When fills mode is on, mirror computed entry aggregates into the regular form fields. */
	$effect(() => {
		if (!useFills) return;
		const agg = entryFillsAgg;
		if (agg) {
			const newEntry = String(Number(agg.avgPrice.toFixed(8)));
			const newQty = String(Number(agg.qty.toFixed(8)));
			if (formEntryPrice !== newEntry) formEntryPrice = newEntry;
			if (formQuantity !== newQty) formQuantity = newQty;
		} else {
			if (formEntryPrice !== "") formEntryPrice = "";
			if (formQuantity !== "") formQuantity = "";
		}
	});

	/** When fills mode is on + status closed, mirror exit aggregates into formExitPrice. */
	$effect(() => {
		if (!useFills) return;
		if (formStatus !== "closed") return;
		const agg = exitFillsAgg;
		if (agg) {
			const newExit = String(Number(agg.avgPrice.toFixed(8)));
			if (formExitPrice !== newExit) formExitPrice = newExit;
		} else {
			if (formExitPrice !== "") formExitPrice = "";
		}
	});

	// Auto-fill take profit whenever implied target changes from profit input
	$effect(() => {
		if (impliedTakeProfit == null) return;
		formTakeProfit = String(Number(impliedTakeProfit.toFixed(8)));
	});

	function priceMovePnl(from: number, to: number) {
		const qty = num(formQuantity);
		if (qty == null || !selectedInstrument) return null;
		return instrumentPnl(selectedInstrument, formSide, from, to, qty);
	}

	const pnlAtFullTarget = $derived.by(() => {
		const entry = num(formEntryPrice);
		const tp = num(formTakeProfit);
		return entry != null && tp != null ? priceMovePnl(entry, tp) : null;
	});

	/** Default closed_at to now when the trade flips to closed and the field is empty. */
	$effect(() => {
		if (formStatus === "closed" && (formClosedAt == null || formClosedAt.trim() === "")) {
			formClosedAt = toDatetimeLocalValue(new Date());
		}
	});

	/** When closed, set P&amp;L from exit/entry/qty if exit is filled; otherwise from risk × R:R. */
	$effect(() => {
		const suggested = suggestedClosedPnl;
		if (suggested == null) return;
		// Sync if blank, untouched auto value, or a leftover "0" from when the trade was open.
		const shouldSync =
			formPnl === "" ||
			formPnl === lastAutoPnl ||
			(lastAutoPnl == null && num(formPnl) === 0);
		if (shouldSync) {
			formPnl = suggested;
			lastAutoPnl = suggested;
		}
	});

	const stopLossPnL = $derived.by(() => {
		const entry = num(formEntryPrice);
		const stop = num(formStopLoss);
		return entry != null && stop != null ? priceMovePnl(entry, stop) : null;
	});

	$effect(() => {
		const first = instrumentStore.instruments?.[0];
		if (!first) return;

		if (!formSymbol) {
			formSymbol = first.symbol;
		}
	});

	async function uploadTradeScreenshot(userId: string, tradeId: string, file: File): Promise<string | null> {
		const ext = file.name.split(".").pop() ?? "png";
		const path = `${userId}/${tradeId}.${ext}`;
		const { error } = await supabase.storage
			.from("trade-screenshots")
			.upload(path, file, { upsert: true });
		if (error) {
			console.error("Screenshot upload error:", error);
			return null;
		}
		const { data } = supabase.storage.from("trade-screenshots").getPublicUrl(path);
		return data.publicUrl;
	}

	async function syncTradeExecutions(tradeId: string) {
		const payload: TradeExecutionInput[] = [];
		if (useFills) {
			for (const f of entryFills) {
				const q = num(f.qty);
				const p = num(f.price);
				if (q != null && q > 0 && p != null && f.at) {
					payload.push({
						kind: "entry",
						quantity: q,
						price: p,
						executed_at: new Date(f.at).toISOString(),
					});
				}
			}
			if (formStatus === "closed") {
				for (const f of exitFills) {
					const q = num(f.qty);
					const p = num(f.price);
					if (q != null && q > 0 && p != null && f.at) {
						payload.push({
							kind: "exit",
							quantity: q,
							price: p,
							executed_at: new Date(f.at).toISOString(),
						});
					}
				}
			}
		} else {
			const entry = num(formEntryPrice);
			const q = num(formQuantity);
			if (entry != null && q != null && q > 0) {
				payload.push({
					kind: "entry",
					quantity: q,
					price: entry,
					executed_at: new Date(formOpenedAt).toISOString(),
				});
			}
			if (formStatus === "closed") {
				const exit = num(formExitPrice);
				if (exit != null && q != null && q > 0) {
					payload.push({
						kind: "exit",
						quantity: q,
						price: exit,
						executed_at: formClosedAt ? new Date(formClosedAt).toISOString() : new Date(formOpenedAt).toISOString(),
					});
				}
			}
		}
		if (payload.length > 0) {
			try {
				await tradeStore.replaceExecutions(supabase, tradeId, payload);
			} catch (e) {
				console.warn("Failed to sync executions:", e);
			}
		}
	}

	async function submitTradeForm() {
		if (!session?.user?.id) {
			toast.error("Sign in to save a trade.");
			return;
		}

		const accountId = accountStore.activeAccountId;
		if (!accountId) {
			toast.error("Select an account in the sidebar before saving a trade.");
			return;
		}

		if (useFills) {
			if (!entryFillsAgg) {
				toast.error("Add at least one entry fill.");
				return;
			}
			if (formStatus === "closed") {
				if (!exitFillsAgg) {
					toast.error("Add at least one exit fill to close the trade.");
					return;
				}
				if (Math.abs(exitFillsAgg.qty - entryFillsAgg.qty) > 1e-9) {
					toast.error("Exit fills must total the same quantity as entry fills to close the trade.");
					return;
				}
			}
		}

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
			toast.error("Stop loss and take profit are required to record the trade and risk/reward.");
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

		if (!editingTradeId && checklistStore.items.length > 0) {
			const missing = checklistStore.items.filter((i) => !formChecklistItemIds.includes(i.id));
			if (missing.length > 0) {
				const preview = missing.slice(0, 5).map((i) => `• ${i.label}`).join("\n");
				const extra = missing.length > 5 ? `\n• …and ${missing.length - 5} more` : "";
				const ok = await confirm({
					title: `Skip ${missing.length} of ${checklistStore.items.length} checklist item${missing.length === 1 ? "" : "s"}?`,
					description: `Not ticked:\n${preview}${extra}\n\nSave the trade anyway?`,
					confirmLabel: "Save anyway",
				});
				if (!ok) return;
			}
		}

		saving = true;
		// Multi-fill mode: derive opened_at/closed_at from fill timestamps so the
		// trade row and trade_executions can't disagree.
		const openedAtIso =
			useFills && entryFillsFirstAtMs != null
				? new Date(entryFillsFirstAtMs).toISOString()
				: new Date(formOpenedAt).toISOString();
		const exitPrice = formStatus === "closed" ? (num(formExitPrice) ?? null) : null;
		const closedAtIso = (() => {
			if (formStatus !== "closed") return null;
			if (useFills) {
				return exitFillsLastAtMs != null ? new Date(exitFillsLastAtMs).toISOString() : null;
			}
			return formClosedAt?.trim() ? new Date(formClosedAt).toISOString() : null;
		})();

		try {
			if (editingTradeId) {
				let screenshotUrl: string | null | undefined = undefined;
				if (formScreenshotFile) {
					screenshotUrl = await uploadTradeScreenshot(session.user.id, editingTradeId, formScreenshotFile);
				}
				await tradeStore.updateTrade(supabase, editingTradeId, {
					instrument_id: selectedInstrument?.id ?? editingTrade?.instrument_id ?? null,
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
					commission: commissionBreakdown.total,
					opened_at: openedAtIso,
					closed_at: closedAtIso,
					notes: formNotes.trim() || null,
					screenshot_url: screenshotUrl,
					emotional_states: formEmotionalStates,
					confidence: formConfidence,
					mental_state: formMentalState.trim() || null,
					followed_plan: formFollowedPlan,
					entry_reason: formEntryReason.trim() || null,
					exit_reason: formStatus === "closed" ? (formExitReason.trim() || null) : null,
					strategy_ids: formStrategyIds,
					mistake_ids: formStatus === "closed" ? formMistakeIds : [],
					checklist_item_ids: formChecklistItemIds
				});
				await syncTradeExecutions(editingTradeId);
			} else {
				const created = await tradeStore.createTrade(supabase, {
					account_id: accountId,
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
					commission: commissionBreakdown.total,
					opened_at: openedAtIso,
					closed_at: closedAtIso,
					notes: formNotes.trim() || undefined,
					emotional_states: formEmotionalStates,
					confidence: formConfidence,
					mental_state: formMentalState.trim() || null,
					followed_plan: formFollowedPlan,
					entry_reason: formEntryReason.trim() || null,
					exit_reason: formStatus === "closed" ? (formExitReason.trim() || null) : null,
					strategy_ids: formStrategyIds,
					mistake_ids: formStatus === "closed" ? formMistakeIds : [],
					checklist_item_ids: formChecklistItemIds
				});
				if (formScreenshotFile && created?.id) {
					const screenshotUrl = await uploadTradeScreenshot(session.user.id, created.id, formScreenshotFile);
					if (screenshotUrl) {
						await tradeStore.updateTrade(supabase, created.id, {
							symbol,
							side: formSide,
							status: formStatus,
							entry_price: entryPrice,
							exit_price: exitPrice ?? undefined,
							quantity: qty,
							stop_loss: stopLoss,
							take_profit: takeProfit,
							risk: dollarRisk,
							pnl: formStatus === "closed" ? (num(formPnl) ?? 0) : 0,
							commission: commissionBreakdown.total,
							opened_at: openedAtIso,
							closed_at: closedAtIso ?? undefined,
							screenshot_url: screenshotUrl
						});
					}
				}
				if (created?.id) {
					await syncTradeExecutions(created.id);
				}
			}

			open = false;
			toast.success(editingTradeId ? "Trade updated." : "Trade saved.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save trade.");
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(o: boolean) => {
		if (!o) open = false;
	}}
>
	<Dialog.Content class="w-[min(100vw,640px)] sm:max-w-[640px] max-h-[90vh] flex flex-col p-0 gap-0">
		<Dialog.Header class="px-5 pt-5 pb-3 border-b">
			<Dialog.Title>{isEditingTrade ? "Edit trade" : "New trade"}</Dialog.Title>
			<Dialog.Description>
				{isEditingTrade
					? "Update details, for example when you close an open position."
					: "Place trade details"}
			</Dialog.Description>

			<!-- Stepper -->
			<div class="mt-4 flex items-center gap-2">
				{#each [
					{ n: 1, label: "Trade" },
					{ n: 2, label: "Psychology" },
					{ n: 3, label: "Tags & notes" }
				] as s}
					{@const active = tradeStep === s.n}
					{@const done = tradeStep > s.n}
					<div class="flex items-center gap-2">
						<button
							type="button"
							class={[
								"flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium tabular-nums transition-colors cursor-pointer",
								active && "border-primary bg-primary text-primary-foreground",
								done && "border-emerald-700/50 bg-emerald-700/10 text-emerald-700 dark:text-emerald-400",
								!active && !done && "text-muted-foreground"
							]}
							onclick={() => (tradeStep = s.n as 1 | 2 | 3)}
							aria-label={`Go to step ${s.n}`}
						>
							{s.n}
						</button>
						<span class={["text-xs", active ? "font-medium" : "text-muted-foreground"]}>{s.label}</span>
					</div>
					{#if s.n < 3}
						<div class="h-px flex-1 bg-border"></div>
					{/if}
				{/each}
			</div>
		</Dialog.Header>

<div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
				{#if tradeStep === 1}
					<!-- Instrument -->
					<section class="space-y-3">
						<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instrument</h3>
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Symbol</div>
							<Select.Root type="single" bind:value={formSymbol}>
								<Select.Trigger class="w-full rounded-md cursor-pointer">
									<span class="capitalize">{formSymbol}</span>
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
					</section>

					<!-- Entry -->
					<section class="space-y-3 border-t pt-4">
						<div class="flex items-center justify-between gap-2">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entry</h3>
							<label class="flex items-center gap-2 cursor-pointer select-none">
								<input
									type="checkbox"
									class="rounded border-input cursor-pointer"
									checked={useFills}
									onchange={(e) => {
										const on = (e.currentTarget as HTMLInputElement).checked;
										useFills = on;
										if (on && entryFills.length === 0) {
											entryFills = [{ id: newFillId(), qty: formQuantity || "", price: formEntryPrice || "", at: formOpenedAt }];
										}
										if (on && formStatus === "closed" && exitFills.length === 0 && formExitPrice) {
											exitFills = [{ id: newFillId(), qty: formQuantity || "", price: formExitPrice, at: formClosedAt ?? formOpenedAt }];
										}
									}}
								/>
								<span class="text-xs text-muted-foreground">Multiple fills</span>
							</label>
						</div>
						{#if !useFills}
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
						{:else}
							<div class="space-y-2 rounded-md border bg-muted/10 p-3">
								<div class="flex items-center justify-between gap-2">
									<div class="text-xs font-medium">Entry fills</div>
									<div class="text-[11px] text-muted-foreground tabular-nums">
										{#if entryFillsAgg}
											{formatQty(entryFillsAgg.qty)} contracts · Avg {formatPrice(entryFillsAgg.avgPrice)}
										{:else}
											No fills yet
										{/if}
									</div>
								</div>
								{#each entryFills as fill, idx (fill.id)}
									<div class="grid grid-cols-[1fr_1fr_minmax(0,1.4fr)_auto] gap-2 items-center">
										<Input bind:value={entryFills[idx].qty} inputmode="decimal" placeholder="Qty" class="rounded-md h-8 text-xs" />
										<Input bind:value={entryFills[idx].price} inputmode="decimal" placeholder="Price" class="rounded-md h-8 text-xs" />
										<input
											type="datetime-local"
											bind:value={entryFills[idx].at}
											class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-8 w-full rounded-md border px-2 py-1 text-xs shadow-xs outline-none focus-visible:ring-1"
										/>
										<Button
											variant="ghost"
											size="icon"
											class="h-8 w-8 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
											aria-label="Remove entry fill"
											onclick={() => removeEntryFill(idx)}
										>
											<TrashIcon size={14} />
										</Button>
									</div>
								{/each}
								<Button
									variant="outline"
									size="sm"
									class="h-7 rounded-md cursor-pointer text-xs"
									onclick={addEntryFill}
								>
									<PlusIcon size={12} /> Add entry fill
								</Button>
							</div>
						{/if}
					</section>

					<!-- Risk levels -->
					<section class="space-y-3 border-t pt-4">
						<div class="flex items-center justify-between gap-2">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk levels</h3>
							<label class="flex items-center gap-2 cursor-pointer select-none">
								<input type="checkbox" bind:checked={showRiskProfit} class="rounded border-input cursor-pointer" />
								<span class="text-xs text-muted-foreground">Size by $ / ticks / pts</span>
							</label>
						</div>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Stop loss</div>
								<Input
									bind:value={formStopLoss}
									inputmode="decimal"
									placeholder="Required"
									class="rounded-md"
									oninput={() => { formRiskInput = ""; }}
								/>
								{#if stopDistance}
									<p class="text-[11px] text-muted-foreground tabular-nums leading-snug">
										{fmtDist(stopDistance.ticks, 1)} ticks · {fmtDist(stopDistance.points, 2)} pts{stopDistance.usd != null ? ` · ${formatUsd(stopDistance.usd)}` : ""}
									</p>
								{/if}
							</div>
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Take profit</div>
								<Input
									bind:value={formTakeProfit}
									inputmode="decimal"
									placeholder="Required"
									class="rounded-md"
									oninput={() => { formProfitInput = ""; }}
								/>
								{#if takeProfitDistance}
									<p class="text-[11px] text-muted-foreground tabular-nums leading-snug">
										{fmtDist(takeProfitDistance.ticks, 1)} ticks · {fmtDist(takeProfitDistance.points, 2)} pts{takeProfitDistance.usd != null ? ` · ${formatUsd(takeProfitDistance.usd)}` : ""}
									</p>
								{/if}
							</div>
						</div>

						{#if showRiskProfit}
							{@const unitOptions: { value: DistUnit; label: string }[] = [
								{ value: "usd", label: "$" },
								{ value: "ticks", label: "ticks" },
								{ value: "points", label: "pts" },
							]}
							{@const riskPlaceholder = riskUnit === "usd" ? "e.g. 250" : riskUnit === "ticks" ? "e.g. 20" : "e.g. 5"}
							{@const profitPlaceholder = profitUnit === "usd" ? "e.g. 500" : profitUnit === "ticks" ? "e.g. 40" : "e.g. 10"}
							<div class="grid grid-cols-2 gap-3 rounded-md border bg-muted/10 p-3">
								<div class="space-y-1.5">
									<div class="flex items-center justify-between gap-2">
										<div class="text-xs font-medium">Risk</div>
										<div class="inline-flex rounded-md border p-0.5 gap-0.5">
											{#each unitOptions as opt}
												<button
													type="button"
													class={[
														"px-1.5 py-0.5 text-[10px] font-medium rounded-sm cursor-pointer transition-colors",
														riskUnit === opt.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
													]}
													aria-pressed={riskUnit === opt.value}
													onclick={() => (riskUnit = opt.value)}
												>
													{opt.label}
												</button>
											{/each}
										</div>
									</div>
									<Input
										bind:value={formRiskInput}
										inputmode="decimal"
										placeholder={riskPlaceholder}
										class="rounded-md"
									/>
									{#if impliedStop != null}
										<p class="text-[11px] text-emerald-700 dark:text-emerald-400 leading-snug">
											→ Stop {impliedStop.toLocaleString(undefined, { maximumFractionDigits: 8 })}
										</p>
									{:else if formRiskInput && (num(formEntryPrice) == null || num(formQuantity) == null || !selectedInstrument)}
										<p class="text-[11px] text-muted-foreground leading-snug">
											Fill in entry, quantity, and instrument first.
										</p>
									{/if}
								</div>
								<div class="space-y-1.5">
									<div class="flex items-center justify-between gap-2">
										<div class="text-xs font-medium">Profit</div>
										<div class="inline-flex rounded-md border p-0.5 gap-0.5">
											{#each unitOptions as opt}
												<button
													type="button"
													class={[
														"px-1.5 py-0.5 text-[10px] font-medium rounded-sm cursor-pointer transition-colors",
														profitUnit === opt.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
													]}
													aria-pressed={profitUnit === opt.value}
													onclick={() => (profitUnit = opt.value)}
												>
													{opt.label}
												</button>
											{/each}
										</div>
									</div>
									<Input
										bind:value={formProfitInput}
										inputmode="decimal"
										placeholder={profitPlaceholder}
										class="rounded-md"
									/>
									{#if impliedTakeProfit != null}
										<p class="text-[11px] text-emerald-700 dark:text-emerald-400 leading-snug">
											→ Target {impliedTakeProfit.toLocaleString(undefined, { maximumFractionDigits: 8 })}
										</p>
									{:else if formProfitInput && (num(formEntryPrice) == null || num(formQuantity) == null || !selectedInstrument)}
										<p class="text-[11px] text-muted-foreground leading-snug">
											Fill in entry, quantity, and instrument first.
										</p>
									{/if}
								</div>
							</div>
						{/if}

						<div class="rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
							<div class="grid grid-cols-3 gap-3 tabular-nums">
								<div>
									<div class="text-muted-foreground">Risk / reward</div>
									<div class="mt-0.5 font-medium">{formatRiskReward(formPlannedRR)}</div>
								</div>
								<div>
									<div class="text-muted-foreground">At target</div>
									<div class="mt-0.5 font-medium text-emerald-700 dark:text-emerald-400">{formatUsd(pnlAtFullTarget)}</div>
								</div>
								<div>
									<div class="text-muted-foreground">If stopped</div>
									<div class="mt-0.5 font-medium text-rose-700 dark:text-rose-400">{formatUsd(stopLossPnL)}</div>
								</div>
							</div>
							{#if formPlannedRR == null && num(formEntryPrice) != null && num(formStopLoss) != null && num(formTakeProfit) != null}
								<div class="mt-1.5 text-[11px] text-muted-foreground">
									Check side vs. stop/target levels.
								</div>
							{/if}
						</div>
					</section>

					{#if formStatus === "closed"}
						<!-- Exit -->
						<section class="space-y-3 border-t pt-4">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exit</h3>
							{#if !useFills}
								<div class="space-y-1.5">
									<div class="text-xs font-medium">Exit price</div>
									<Input bind:value={formExitPrice} inputmode="decimal" placeholder="Optional" class="rounded-md" />
								</div>
							{:else}
								<div class="space-y-2 rounded-md border bg-muted/10 p-3">
									<div class="flex items-center justify-between gap-2">
										<div class="text-xs font-medium">Exit fills</div>
										<div class="text-[11px] text-muted-foreground tabular-nums">
											{#if exitFillsAgg}
												{formatQty(exitFillsAgg.qty)} contracts · Avg {formatPrice(exitFillsAgg.avgPrice)}
											{:else}
												No fills yet
											{/if}
										</div>
									</div>
									{#each exitFills as fill, idx (fill.id)}
										<div class="grid grid-cols-[1fr_1fr_minmax(0,1.4fr)_auto] gap-2 items-center">
											<Input bind:value={exitFills[idx].qty} inputmode="decimal" placeholder="Qty" class="rounded-md h-8 text-xs" />
											<Input bind:value={exitFills[idx].price} inputmode="decimal" placeholder="Price" class="rounded-md h-8 text-xs" />
											<input
												type="datetime-local"
												bind:value={exitFills[idx].at}
												class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-8 w-full rounded-md border px-2 py-1 text-xs shadow-xs outline-none focus-visible:ring-1"
											/>
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
												aria-label="Remove exit fill"
												onclick={() => removeExitFill(idx)}
											>
												<TrashIcon size={14} />
											</Button>
										</div>
									{/each}
									<Button
										variant="outline"
										size="sm"
										class="h-7 rounded-md cursor-pointer text-xs"
										onclick={addExitFill}
									>
										<PlusIcon size={12} /> Add exit fill
									</Button>
									{#if entryFillsAgg && exitFillsAgg && Math.abs(exitFillsAgg.qty - entryFillsAgg.qty) > 1e-9}
										<p class="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
											Exit qty ({formatQty(exitFillsAgg.qty)}) doesn't match entry qty ({formatQty(entryFillsAgg.qty)}).
										</p>
									{/if}
								</div>
							{/if}
						</section>
					{/if}

					{#if formStatus === "closed" || commissionPerSide > 0}
						<!-- P&L & costs -->
						<section class="space-y-3 border-t pt-4">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								{formStatus === "closed" ? "P&L & costs" : "Costs"}
							</h3>
							{#if commissionPerSide > 0}
								<div class="rounded-md border bg-muted/20 px-3 py-2 text-xs space-y-1">
									<div class="flex items-center justify-between gap-2">
										<span class="text-muted-foreground">Commission</span>
										<span class="text-[11px] text-muted-foreground tabular-nums">
											${commissionPerSide.toFixed(4)}/side × {num(formQuantity) ?? 0}
										</span>
									</div>
									<div class="flex items-center justify-between gap-2 tabular-nums">
										<span>Entry</span>
										<span class="text-rose-700 dark:text-rose-400">−{formatUsd(commissionBreakdown.entry)}</span>
									</div>
									{#if formStatus === "closed"}
										<div class="flex items-center justify-between gap-2 tabular-nums">
											<span>Exit</span>
											<span class="text-rose-700 dark:text-rose-400">−{formatUsd(commissionBreakdown.exit)}</span>
										</div>
									{/if}
									<div class="flex items-center justify-between gap-2 border-t pt-1 mt-1 tabular-nums font-medium">
										<span>Total deducted</span>
										<span class="text-rose-700 dark:text-rose-400">−{formatUsd(commissionBreakdown.total)}</span>
									</div>
								</div>
							{/if}
							{#if formStatus === "closed"}
								<div class="space-y-1.5">
									<div class="text-xs font-medium">Net P&amp;L</div>
									<Input bind:value={formPnl} inputmode="decimal" placeholder="Optional" class="rounded-md" />
									<p class="text-[11px] text-muted-foreground leading-snug">
										Auto-calculated as gross P&amp;L minus round-turn commission. Edit if you need
										a different number (scaling, partials, manual fees).
									</p>
								</div>
							{/if}
						</section>
					{/if}

					<!-- Timing -->
					<section class="space-y-3 border-t pt-4">
						<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timing</h3>
						{#if !useFills}
							<div class={formStatus === "closed" ? "grid grid-cols-2 gap-3" : "space-y-1.5"}>
								<div class="space-y-1.5">
									<div class="text-xs font-medium">Opened at</div>
									<DateTimePicker
										value={formOpenedAt}
										onValueChange={(v) => (formOpenedAt = v ?? toDatetimeLocalValue(new Date()))}
									/>
								</div>
								{#if formStatus === "closed"}
									<div class="space-y-1.5">
										<div class="text-xs font-medium">Closed at</div>
										<DateTimePicker
											value={formClosedAt}
											onValueChange={(v) => (formClosedAt = v ?? toDatetimeLocalValue(new Date()))}
										/>
									</div>
								{/if}
							</div>
						{:else}
							<div class="rounded-md border bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
								{#if entryFillsFirstAtMs != null}
									Opened at <span class="text-foreground tabular-nums">{new Date(entryFillsFirstAtMs).toLocaleString()}</span>
									<span class="text-muted-foreground/70">(from first entry fill)</span>
									{#if formStatus === "closed"}
										<br />
										{#if exitFillsLastAtMs != null}
											Closed at <span class="text-foreground tabular-nums">{new Date(exitFillsLastAtMs).toLocaleString()}</span>
											<span class="text-muted-foreground/70">(from last exit fill)</span>
										{:else}
											Closed at <span class="text-muted-foreground/70">(set from last exit fill)</span>
										{/if}
									{/if}
								{:else}
									Opened / closed times are derived from your fill timestamps.
								{/if}
							</div>
						{/if}
					</section>

					{#if checklistStore.items.length > 0}
						{@const total = checklistStore.items.length}
						{@const checked = formChecklistItemIds.length}
						{@const allChecked = checked === total}
						<!-- Pre-trade checklist -->
						<section class="space-y-3 border-t pt-4">
							<div class="flex items-center justify-between gap-2">
								<div>
									<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pre-trade checklist</h3>
									<p class="text-[11px] text-muted-foreground leading-snug mt-0.5">Confirm your rules before saving. {checked}/{total} checked.</p>
								</div>
								<button
									type="button"
									class="text-[11px] text-primary hover:underline cursor-pointer"
									onclick={() => {
										formChecklistItemIds = allChecked ? [] : checklistStore.items.map((i) => i.id);
									}}
								>
									{allChecked ? "Uncheck all" : "Check all"}
								</button>
							</div>
							<div class="space-y-1 rounded-md border p-3">
								{#each checklistStore.items as item (item.id)}
									{@const on = formChecklistItemIds.includes(item.id)}
									<label class="flex items-start gap-2 cursor-pointer rounded-md px-1 py-1 hover:bg-muted/40">
										<input
											type="checkbox"
											class="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
											checked={on}
											onchange={() => {
												formChecklistItemIds = on
													? formChecklistItemIds.filter((x) => x !== item.id)
													: [...formChecklistItemIds, item.id];
											}}
										/>
										<span class={["text-xs leading-snug", on && "text-muted-foreground line-through"]}>{item.label}</span>
									</label>
								{/each}
							</div>
						</section>
					{/if}
				{/if}

				{#if tradeStep === 2}
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Why did you enter the trade?</div>
						<p class="text-[11px] text-muted-foreground leading-snug">The thesis or setup that triggered your entry — capture it before the outcome biases your memory.</p>
						<textarea
							bind:value={formEntryReason}
							rows="3"
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
							placeholder="e.g. Pullback to VWAP after liquidity sweep, trend intact on HTF…"
						></textarea>
					</div>

					{#if formStatus === "closed"}
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Why did you exit the trade?</div>
							<p class="text-[11px] text-muted-foreground leading-snug">What actually got you out — target, stop, invalidation, or a discretionary call.</p>
							<textarea
								bind:value={formExitReason}
								rows="3"
								class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
								placeholder="e.g. Hit take profit, scratched on momentum stall, panicked out early…"
							></textarea>
						</div>
					{/if}

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Emotional state</div>
						<p class="text-[11px] text-muted-foreground leading-snug">Pick all that applied at the moment of placing this trade.</p>
						<div class="flex flex-wrap gap-1.5 pt-1">
							{#each EMOTIONAL_STATES as e}
								{@const on = formEmotionalStates.includes(e)}
								<button
									type="button"
									onclick={() => toggleEmotionalState(e)}
									class={[
										"rounded-md border px-2.5 py-1 text-xs capitalize cursor-pointer transition-colors",
										on
											? "border-primary bg-primary/10 text-primary"
											: "border-input bg-background text-muted-foreground hover:bg-muted/50"
									]}
								>
									{e}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Confidence</div>
						<div class="flex items-center gap-1.5">
							{#each [1, 2, 3, 4, 5] as n}
								{@const on = formConfidence === n}
								<button
									type="button"
									onclick={() => (formConfidence = on ? null : n)}
									class={[
										"flex h-9 w-9 items-center justify-center rounded-md border text-sm font-medium tabular-nums cursor-pointer transition-colors",
										on
											? "border-primary bg-primary text-primary-foreground"
											: "border-input bg-background text-muted-foreground hover:bg-muted/50"
									]}
								>
									{n}
								</button>
							{/each}
							<span class="ml-2 text-[11px] text-muted-foreground">1 = uncertain · 5 = high conviction</span>
						</div>
					</div>

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Followed your plan?</div>
						<div class="flex gap-1.5">
							{#each [{ v: "yes", l: "Yes" }, { v: "partial", l: "Partial" }, { v: "no", l: "No" }] as opt}
								{@const on = formFollowedPlan === opt.v}
								<button
									type="button"
									onclick={() => (formFollowedPlan = on ? null : (opt.v as "yes" | "no" | "partial"))}
									class={[
										"flex-1 rounded-md border px-3 py-2 text-xs font-medium cursor-pointer transition-colors",
										on
											? "border-primary bg-primary/10 text-primary"
											: "border-input bg-background text-muted-foreground hover:bg-muted/50"
									]}
								>
									{opt.l}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Mental / physical state</div>
						<textarea
							bind:value={formMentalState}
							rows="3"
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
							placeholder="e.g. tired, well-rested, distracted, focused…"
						></textarea>
					</div>
				{/if}

				{#if tradeStep === 3}
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Strategies</div>
						<MultiSelect
							bind:selected={formStrategyIds}
							options={strategyStore.strategies.map((s) => ({ value: s.id, label: s.name }))}
							placeholder={strategyStore.strategies.length === 0
								? "Create one in Strategies & Mistakes"
								: "Tag strategies used"}
							emptyText="No strategies yet — add some in Strategies & Mistakes."
						/>
					</div>

					{#if formStatus === "closed"}
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Mistakes</div>
							<MultiSelect
								bind:selected={formMistakeIds}
								options={mistakeStore.mistakes.map((m) => ({ value: m.id, label: m.name }))}
								placeholder={mistakeStore.mistakes.length === 0
									? "Create one in Strategies & Mistakes"
									: "Tag mistakes made (post-trade)"}
								emptyText="No mistakes catalogued yet."
							/>
							<p class="text-[11px] text-muted-foreground leading-snug">
								Reviewed only after closing — what would you do differently?
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

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Screenshot</div>
						{#if formScreenshotPreview || formExistingScreenshotUrl}
							<div class="relative rounded-md overflow-hidden border">
								<img
									src={formScreenshotPreview ?? formExistingScreenshotUrl ?? ""}
									alt="Trade screenshot preview"
									class="w-full max-h-48 object-cover"
								/>
								<button
									type="button"
									class="absolute top-1.5 right-1.5 rounded-md bg-background/80 p-1 text-xs text-muted-foreground hover:bg-background cursor-pointer border"
									onclick={() => {
										formScreenshotFile = null;
										formScreenshotPreview = null;
										formExistingScreenshotUrl = null;
									}}
								>
									Remove
								</button>
							</div>
						{:else}
							<label
								class="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-5 text-center hover:bg-muted/40 transition-colors"
							>
								<input
									type="file"
									accept="image/*"
									class="sr-only"
									onchange={(e) => {
										const file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
										formScreenshotFile = file;
										if (file) {
											const reader = new FileReader();
											reader.onload = (ev) => {
												formScreenshotPreview = (ev.target?.result as string) ?? null;
											};
											reader.readAsDataURL(file);
										} else {
											formScreenshotPreview = null;
										}
									}}
								/>
								<span class="text-xs text-muted-foreground">Click to upload a screenshot</span>
								<span class="text-[10px] text-muted-foreground">PNG, JPG, WEBP</span>
							</label>
						{/if}
					</div>
				{/if}
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
							{#if tradeStep > 1}
								<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (tradeStep = (tradeStep - 1) as 1 | 2 | 3)}>
									Back
								</Button>
							{:else}
								<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (open = false)}>
									Cancel
								</Button>
							{/if}
							{#if tradeStep < 3}
								<Button
									class="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground cursor-pointer"
									disabled={tradeStep === 1 && !formSymbol.trim()}
									onclick={() => (tradeStep = (tradeStep + 1) as 1 | 2 | 3)}
								>
									Next
								</Button>
							{:else}
								<Button
									class="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground cursor-pointer"
									disabled={!formSymbol.trim() || saving || deleting || !session || !accountStore.activeAccountId}
									onclick={submitTradeForm}
								>
									{saving ? "Saving…" : isEditingTrade ? "Save changes" : "Create trade"}
								</Button>
							{/if}
						</div>
					</div>
				</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
