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
		EyeIcon,
		FunnelIcon,
		MagnifyingGlassIcon,
		PencilSimpleIcon,
		PlusIcon,
		PulseIcon,
		RowsIcon,
		ShareNetworkIcon,
		SquaresFourIcon,
		TrashIcon
	} from "phosphor-svelte";
	import TradeCard from "$lib/components/trades/trade-card.svelte";
	import * as Select from "$lib/components/ui/select/index.js";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { DateTimePicker } from "$lib/components/ui/date-time-picker";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { payoutStore } from "$lib/stores/payouts.svelte";
	import { instrumentStore, instrumentPnl } from "$lib/stores/instruments.svelte";
	import { strategyStore } from "$lib/stores/strategies.svelte";
	import { mistakeStore } from "$lib/stores/mistakes.svelte";
	import { MultiSelect } from "$lib/components/ui/multi-select";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import PnlShareDialog from "$lib/components/pnl-share-sheet/pnl-share-dialog.svelte";
	import { toast } from "svelte-sonner";

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
		strategy_ids?: string[];
		mistake_ids?: string[];
		emotional_states?: string[] | null;
		confidence?: number | null;
		mental_state?: string | null;
		followed_plan?: "yes" | "no" | "partial" | null;
		screenshot_url?: string | null;
	}

	type SideFilter = "all" | "long" | "short";
	type StatusFilter = "all" | "open" | "closed";

	function toDatetimeLocalValue(d: Date) {
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	let session = $state<Session | null>(null);
	let viewMode = $state<"table" | "gallery">("table");
	let saving = $state(false);
	let deleting = $state(false);
	let shareSheetOpen = $state(false);
	let sharingTrade = $state<TradeRow | null>(null);

	function openShareSheet(t: TradeRow) {
		sharingTrade = t;
		shareSheetOpen = true;
	}

	let detailSheetOpen = $state(false);
	let detailTrade = $state<TradeRow | null>(null);

	function openDetailSheet(t: TradeRow) {
		detailTrade = t;
		detailSheetOpen = true;
	}

	async function deleteTrade() {
		if (!editingTradeId) return;
		if (!confirm("Delete this trade? This cannot be undone.")) return;
		deleting = true;
		try {
			await tradeStore.deleteTrade(supabase, editingTradeId);
			closeTradeSheet();
			toast.success("Trade deleted.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete trade.");
		} finally {
			deleting = false;
		}
	}

	const trades = $derived.by((): TradeRow[] => (tradeStore.trades ?? []) as TradeRow[]);
	const loading = $derived(tradeStore.loading);

	let searchQuery = $state("");
	let directionFilter = $state<SideFilter>("all");
	let statusFilter = $state<StatusFilter>("all");
	let currentPage = $state(1);
	const PAGE_SIZE = 10;
	let debouncedSearch = $state("");
	let _searchTimer: ReturnType<typeof setTimeout>;

	let tradeSheetOpen = $state(false);
	let editingTradeId = $state<string | null>(null);
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

	function toggleEmotionalState(s: string) {
		formEmotionalStates = formEmotionalStates.includes(s)
			? formEmotionalStates.filter((x) => x !== s)
			: [...formEmotionalStates, s];
	}

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
	/** Last P&amp;L we auto-filled from exit prices; edit P&amp;L to override. */
	let lastAutoPnl = $state<string | null>(null);
	let formNotes = $state("");
	let formStrategyIds = $state<string[]>([]);
	let formMistakeIds = $state<string[]>([]);
	/** Optional: when filled, derives stop loss from entry, qty, side, and instrument. */
	let formRiskInput = $state("");
	/** Optional: when filled, derives take profit from entry, qty, side, and instrument. */
	let formProfitInput = $state("");
	let showRiskProfit = $state(false);
	let formScreenshotFile = $state<File | null>(null);
	let formScreenshotPreview = $state<string | null>(null);
	let formExistingScreenshotUrl = $state<string | null>(null);

	let payoutSheetOpen = $state(false);
	let payoutGross = $state("");
	let payoutDate = $state(toDatetimeLocalValue(new Date()));
	let payoutNotes = $state("");
	let payoutSaving = $state(false);

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
		formRiskInput = "";
		formProfitInput = "";
		showRiskProfit = false;
		formScreenshotFile = null;
		formScreenshotPreview = null;
		formExistingScreenshotUrl = null;
		formEmotionalStates = [];
		formConfidence = null;
		formMentalState = "";
		formFollowedPlan = null;
		tradeStep = 1;
	}

	function closeTradeSheet() {
		tradeSheetOpen = false;

		editingTradeId = null;
		resetNewTradeForm();
	}

	function openTradeSheetCreate() {
		editingTradeId = null;
		resetNewTradeForm();
		tradeSheetOpen = true;
	}

	function openTradeSheetEdit(t: TradeRow) {

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
		lastAutoPnl = null;
		formNotes = t.notes ?? "";
		formStrategyIds = [...(t.strategy_ids ?? [])];
		formMistakeIds = [...(t.mistake_ids ?? [])];
		formRiskInput = "";
		formProfitInput = "";
		formScreenshotFile = null;
		formScreenshotPreview = null;
		formExistingScreenshotUrl = (t as TradeRow & { screenshot_url?: string | null }).screenshot_url ?? null;
		const tt = t as TradeRow & {
			emotional_states?: string[] | null;
			confidence?: number | null;
			mental_state?: string | null;
			followed_plan?: "yes" | "no" | "partial" | null;
		};
		formEmotionalStates = [...(tt.emotional_states ?? [])];
		formConfidence = tt.confidence ?? null;
		formMentalState = tt.mental_state ?? "";
		formFollowedPlan = tt.followed_plan ?? null;
		tradeStep = 1;
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

	const filteredTrades = $derived(tradeStore.trades as TradeRow[]);

	function goToPage(p: number) {
		currentPage = p;
		void tradeStore.getTradesByAccount(supabase, {
			page: p,
			pageSize: PAGE_SIZE,
			search: debouncedSearch,
			side: directionFilter as "long" | "short" | "all",
			status: statusFilter as "open" | "closed" | "all",
		});
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
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit"
		}).format(d);
	}

    const selectedInstrument = $derived.by(() => {
        return instrumentStore.instruments?.find(
            (i) => i.symbol === formSymbol
        );
    });

	const stats = $derived.by(() => {
		const rows = filteredTrades;
		const closed = rows.filter((t) => t.status === "closed");
		const netPnl = closed.reduce((acc, t) => acc + (num(t.pnl) ?? 0), 0);
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

	const activeAccount = $derived(
		accountStore.accounts.find((a) => a.id === accountStore.activeAccountId) ?? null
	);

	const isFundedPropFirm = $derived(
		activeAccount?.account_type === "prop firm" && !!activeAccount?.parent_account_id
	);

	const propFirmStats = $derived.by(() => {
		if (!isFundedPropFirm || !activeAccount) return null;
		const parentAccount = accountStore.accounts.find((a) => a.id === activeAccount.parent_account_id);
		const cost = parentAccount?.challenge_cost;
		const totalPayouts = payoutStore.payouts.filter((p) => p.status === "received").reduce((sum, p) => sum + p.amount, 0);
		const roi = cost && cost > 0 ? (totalPayouts / cost) * 100 : null;
		const remaining = cost && cost > 0 ? Math.max(0, cost - totalPayouts) : null;
		return { cost: cost ?? null, totalPayouts, roi, remaining, breakEvenReached: remaining !== null && remaining === 0 };
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

    /** Stop price implied by a desired dollar risk, snapped to tick size. */
    const impliedStop = $derived.by(() => {
        const risk = num(formRiskInput);
        const entry = num(formEntryPrice);
        const qty = num(formQuantity);
        if (risk == null || risk <= 0 || entry == null || qty == null || qty <= 0 || !selectedInstrument) return null;
        const pv = selectedInstrument.tick_value / selectedInstrument.tick_size;
        if (!Number.isFinite(pv) || pv <= 0) return null;
        const distance = risk / (pv * qty);
        const raw = formSide === "long" ? entry - distance : entry + distance;
        const tick = selectedInstrument.tick_size;
        return tick > 0 ? Math.round(raw / tick) * tick : raw;
    });

    // Auto-fill stop loss whenever implied stop changes from risk input
    $effect(() => {
        if (impliedStop == null) return;
        formStopLoss = String(Number(impliedStop.toFixed(8)));
    });

    /** Take profit price implied by a desired profit target, snapped to tick size. */
    const impliedTakeProfit = $derived.by(() => {
        const profit = num(formProfitInput);
        const entry = num(formEntryPrice);
        const qty = num(formQuantity);
        if (profit == null || profit <= 0 || entry == null || qty == null || qty <= 0 || !selectedInstrument) return null;
        const pv = selectedInstrument.tick_value / selectedInstrument.tick_size;
        if (!Number.isFinite(pv) || pv <= 0) return null;
        const distance = profit / (pv * qty);
        const raw = formSide === "long" ? entry + distance : entry - distance;
        const tick = selectedInstrument.tick_size;
        return tick > 0 ? Math.round(raw / tick) * tick : raw;
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

	async function submitPayout() {
		const gross = Number(payoutGross);
		if (!payoutGross || !Number.isFinite(gross) || gross <= 0) {
			toast.error("Enter a valid gross profit amount.");
			return;
		}
		const accountId = accountStore.activeAccountId;
		if (!accountId) return;
		payoutSaving = true;
		try {
			await payoutStore.createPayout(supabase, {
				account_id: accountId,
				gross_amount: gross,
				payout_date: new Date(payoutDate).toISOString(),
				notes: payoutNotes.trim() || null,
			});
			payoutSheetOpen = false;
			payoutGross = "";
			payoutDate = toDatetimeLocalValue(new Date());
			payoutNotes = "";
			toast.success("Payout requested.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save payout.");
		} finally {
			payoutSaving = false;
		}
	}

	async function refreshSession() {
		const {
			data: { session: s }
		} = await supabase.auth.getSession();
		session = s;
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
				let screenshotUrl: string | null | undefined = undefined;
				if (formScreenshotFile) {
					screenshotUrl = await uploadTradeScreenshot(session.user.id, editingTradeId, formScreenshotFile);
				}
				await tradeStore.updateTrade(supabase, editingTradeId, {
					instrument_id: selectedInstrument?.id ?? existing?.instrument_id ?? null,
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
					screenshot_url: screenshotUrl,
					emotional_states: formEmotionalStates,
					confidence: formConfidence,
					mental_state: formMentalState.trim() || null,
					followed_plan: formFollowedPlan,
					strategy_ids: formStrategyIds,
					mistake_ids: formStatus === "closed" ? formMistakeIds : []
				});
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
					opened_at: openedAtIso,
					closed_at: closedAtIso,
					notes: formNotes.trim() || undefined,
					emotional_states: formEmotionalStates,
					confidence: formConfidence,
					mental_state: formMentalState.trim() || null,
					followed_plan: formFollowedPlan,
					strategy_ids: formStrategyIds,
					mistake_ids: formStatus === "closed" ? formMistakeIds : []
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
							opened_at: openedAtIso,
							closed_at: closedAtIso ?? undefined,
							screenshot_url: screenshotUrl
						});
					}
				}
			}

			closeTradeSheet();
			toast.success(editingTradeId ? "Trade updated." : "Trade saved.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save trade.");
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
		const q = searchQuery;
		clearTimeout(_searchTimer);
		_searchTimer = setTimeout(() => { debouncedSearch = q; }, 300);
		return () => clearTimeout(_searchTimer);
	});

	$effect(() => {
		void accountStore.activeAccountId;
		void debouncedSearch;
		void directionFilter;
		void statusFilter;
		currentPage = 1;
		void tradeStore.getTradesByAccount(supabase, {
			page: 1,
			pageSize: PAGE_SIZE,
			search: debouncedSearch,
			side: directionFilter as "long" | "short" | "all",
			status: statusFilter as "open" | "closed" | "all",
		});
	});

	$effect(() => {
		const id = accountStore.activeAccountId;
		const account = accountStore.accounts.find((a) => a.id === id);
		if (id && account?.account_type === "prop firm" && account?.parent_account_id) {
			void payoutStore.getPayoutsByAccount(supabase, id);
		} else {
			payoutStore.clear();
		}
	});

    $effect(() => {
        const first = instrumentStore.instruments?.[0];
        if (!first) return;

        if (!formSymbol) {
            formSymbol = first.symbol;
        }
    });

    const stopLossPnL = $derived.by(() => {
        const entry = num(formEntryPrice);
        const stop = num(formStopLoss);
        return entry != null && stop != null ? priceMovePnl(entry, stop) : null;
    });
</script>

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Page>Trades</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">The Trades page is your full trade journal. Log, filter, and review every trade across your accounts.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Use the <strong>+ Add Trade</strong> button to log a new trade manually.</li>
			<li>Filter by date, strategy, mistake, or instrument using the filter bar.</li>
			<li>Switch between card view and list view using the icons in the toolbar.</li>
			<li>Click the share icon on a trade card to generate a shareable P&L image.</li>
			<li>Edit or delete a trade by opening it and using the action buttons.</li>
		</ul>
	</div>
{/snippet}
<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-8xl space-y-4 p-4 md:p-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Trades</h1>
				<p class="text-sm text-muted-foreground">Create and manage your trades.</p>
			</div>
			<Button
				onclick={openTradeSheetCreate}
				variant="default"
				class="cursor-pointer rounded-md"
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
			{#if loading}
				{#each [0, 1, 2, 3] as _}
					<div class="rounded-md border bg-background p-4">
						<Skeleton class="h-3 w-20" />
						<Skeleton class="mt-2 h-7 w-28" />
					</div>
				{/each}
			{:else}
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Trades</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{tradeStore.total}</div>
			</div>
			<div
				class={[
					"rounded-md border p-4 transition-colors",
					stats.netPnl > 0 && "border-emerald-700/30 bg-emerald-700/5",
					stats.netPnl < 0 && "border-rose-700/30 bg-rose-700/5",
					stats.netPnl === 0 && "bg-background"
				]}
			>
				<div class="text-xs text-muted-foreground">Net P&amp;L</div>
				<div
					class={[
						"mt-1 text-2xl font-semibold tabular-nums",
						stats.netPnl > 0 && "text-emerald-700 dark:text-emerald-400",
						stats.netPnl < 0 && "text-rose-700 dark:text-rose-400"
					]}
				>
					{formatUsd(stats.netPnl)}
				</div>
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
			{/if}
		</div>

		{#if isFundedPropFirm}
			<div class="grid gap-3 sm:grid-cols-2">
				{#if propFirmStats?.roi != null}
					<div class={[
						"rounded-md border p-4 transition-colors",
						propFirmStats.roi > 0 && "border-emerald-700/30 bg-emerald-700/5",
						propFirmStats.roi < 0 && "border-rose-700/30 bg-rose-700/5",
						propFirmStats.roi === 0 && "bg-background"
					]}>
						<div class="text-xs text-muted-foreground">ROI on challenge</div>
						<div class={[
							"mt-1 text-2xl font-semibold tabular-nums",
							propFirmStats.roi > 0 && "text-emerald-700 dark:text-emerald-400",
							propFirmStats.roi < 0 && "text-rose-700 dark:text-rose-400"
						]}>
							{propFirmStats.roi > 0 ? "+" : ""}{propFirmStats.roi.toFixed(1)}%
						</div>
						<div class="mt-0.5 text-[11px] text-muted-foreground">
							{formatUsd(propFirmStats.totalPayouts)} paid out · cost {formatUsd(propFirmStats.cost)}
						</div>
					</div>
					<div class={[
						"rounded-md border p-4 transition-colors",
						propFirmStats.breakEvenReached ? "border-emerald-700/30 bg-emerald-700/5" : "bg-background"
					]}>
						<div class="text-xs text-muted-foreground">Break-even</div>
						<div class={[
							"mt-1 text-2xl font-semibold tabular-nums",
							propFirmStats.breakEvenReached && "text-emerald-700 dark:text-emerald-400"
						]}>
							{propFirmStats.breakEvenReached ? "Reached" : formatUsd(propFirmStats.remaining)}
						</div>
						<div class="mt-0.5 text-[11px] text-muted-foreground">
							{propFirmStats.breakEvenReached ? "Challenge cost recovered via payouts" : "More payouts needed to recover cost"}
						</div>
					</div>
				{:else}
					<div class="rounded-md border bg-background p-4 sm:col-span-2">
						<div class="text-xs text-muted-foreground">ROI on challenge</div>
						<div class="mt-1 text-sm font-medium text-muted-foreground">—</div>
						<div class="mt-0.5 text-[11px] text-muted-foreground">Add a challenge cost to the evaluation account to track ROI.</div>
					</div>
				{/if}
			</div>

			<!-- Payout log -->
			<div class="rounded-md border bg-background">
				<div class="flex items-center justify-between gap-3 border-b px-4 py-3">
					<div class="text-sm font-medium">Payouts</div>
					<Button variant="outline" size="sm" class="rounded-md cursor-pointer h-7 text-xs" onclick={() => (payoutSheetOpen = true)}>
						<PlusIcon size={12} /> Add payout
					</Button>
				</div>
				{#if payoutStore.loading}
					<div class="p-4 space-y-2">
						{#each [0, 1, 2] as _}
							<div class="flex items-center justify-between">
								<Skeleton class="h-3.5 w-24" />
								<Skeleton class="h-3.5 w-16" />
							</div>
						{/each}
					</div>
				{:else if payoutStore.payouts.length === 0}
					<div class="p-8 text-center text-sm text-muted-foreground">No payouts recorded yet.</div>
				{:else}
					<ul class="divide-y">
						{#each payoutStore.payouts as p (p.id)}
							{@const statusOrder = ["requested", "pending", "approved", "received"] as const}
							{@const nextStatus = statusOrder[statusOrder.indexOf(p.status) + 1] ?? null}
							{@const statusColors: Record<string, string> = {
								requested: "bg-muted text-muted-foreground",
								pending:    "bg-amber-700/10 text-amber-700 dark:text-amber-400",
								approved:   "bg-blue-700/10 text-blue-700 dark:text-blue-400",
								received:   "bg-emerald-700/10 text-emerald-700 dark:text-emerald-400",
							}}
							<li class="flex items-start justify-between gap-3 px-4 py-3">
								<div class="min-w-0 space-y-1">
									<div class="flex items-center gap-2">
										<span class="text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">{formatUsd(p.amount)}</span>
										{#if p.gross_amount != null && p.profit_split != null}
											<span class="text-xs text-muted-foreground">({Math.round(p.profit_split * 100)}% of {formatUsd(p.gross_amount)})</span>
										{/if}
									</div>
									<div class="flex items-center gap-2">
										<span class={["inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize", statusColors[p.status]]}>
											{p.status}
										</span>
										<span class="text-xs text-muted-foreground">{formatWhen(p.payout_date)}{p.notes ? ` · ${p.notes}` : ""}</span>
									</div>
								</div>
								<div class="flex items-center gap-0.5 shrink-0">
									{#if nextStatus}
										<Button
											variant="outline"
											size="sm"
											class="h-7 rounded-md cursor-pointer text-[10px] capitalize"
											onclick={() => payoutStore.updateStatus(supabase, p.id, nextStatus, p.account_id)}
										>
											Mark {nextStatus}
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="icon"
										class="h-7 w-7 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
										aria-label="Delete payout"
										onclick={() => payoutStore.deletePayout(supabase, p.id, p.account_id)}
									>
										<TrashIcon size={14} />
									</Button>
								</div>
							</li>
						{/each}
					</ul>
					<div class="border-t px-4 py-2.5 text-xs text-muted-foreground">
						Received: <span class="font-medium tabular-nums text-foreground">{formatUsd(payoutStore.payouts.filter(p => p.status === "received").reduce((s, p) => s + p.amount, 0))}</span>
						<span class="mx-1.5">·</span>
						Total requested: <span class="tabular-nums">{formatUsd(payoutStore.payouts.reduce((s, p) => s + p.amount, 0))}</span>
					</div>
				{/if}
			</div>
		{/if}

		<div class="rounded-md border bg-background">
			<div class="flex items-center justify-between gap-3 border-b px-4 py-3">
				<div class="text-sm font-medium">All trades</div>
				<div class="flex items-center gap-2">
					<div class="flex items-center rounded-md border p-0.5 gap-0.5">
						<Button
							variant="ghost"
							size="icon"
							class={["h-6 w-6 cursor-pointer", viewMode === "table" && "bg-muted"]}
							aria-label="Table view"
							onclick={() => (viewMode = "table")}
						>
							<RowsIcon size={14} />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class={["h-6 w-6 cursor-pointer", viewMode === "gallery" && "bg-muted"]}
							aria-label="Gallery view"
							onclick={() => (viewMode = "gallery")}
						>
							<SquaresFourIcon size={14} />
						</Button>
					</div>
				</div>
			</div>

			{#if loading}
				<div class="w-full overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
								<th class="w-24 whitespace-nowrap">Symbol</th>
								<th class="whitespace-nowrap">Side</th>
								<th class="whitespace-nowrap">Status</th>
								<th class="text-right whitespace-nowrap">Entry</th>
								<th class="text-right whitespace-nowrap">Exit</th>
								<th class="text-right whitespace-nowrap">Qty</th>
								<th class="text-right whitespace-nowrap">Stop</th>
								<th class="text-right whitespace-nowrap">Target</th>
								<th class="text-right whitespace-nowrap">R:R</th>
								<th class="whitespace-nowrap">Opened</th>
								<th class="whitespace-nowrap">Closed</th>
								<th class="text-right whitespace-nowrap">P&amp;L</th>
								<th class="whitespace-nowrap">Tags</th>
								<th class="w-14 text-right whitespace-nowrap">Actions</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each [0, 1, 2, 3, 4, 5] as _}
								<tr class="[&>td]:px-4 [&>td]:py-3">
									<td><Skeleton class="h-3.5 w-14" /></td>
									<td><Skeleton class="h-5 w-12 rounded-md" /></td>
									<td><Skeleton class="h-5 w-14 rounded-md" /></td>
									<td class="text-right"><Skeleton class="ml-auto h-3.5 w-16" /></td>
									<td class="text-right"><Skeleton class="ml-auto h-3.5 w-10" /></td>
									<td class="text-right"><Skeleton class="ml-auto h-3.5 w-8" /></td>
									<td class="text-right"><Skeleton class="ml-auto h-3.5 w-16" /></td>
									<td class="text-right"><Skeleton class="ml-auto h-3.5 w-16" /></td>
									<td class="text-right"><Skeleton class="ml-auto h-3.5 w-10" /></td>
									<td><Skeleton class="h-3.5 w-28" /></td>
									<td><Skeleton class="h-3.5 w-10" /></td>
									<td class="text-right"><Skeleton class="ml-auto h-3.5 w-16" /></td>
									<td><Skeleton class="h-3.5 w-10" /></td>
									<td><Skeleton class="ml-auto h-7 w-7" /></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
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
			{:else if viewMode === "gallery"}
				<div class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{#each filteredTrades as t (t.id)}
						<TradeCard
							trade={t}
							strategies={strategyStore.strategies}
							mistakes={mistakeStore.mistakes}
							onshare={openShareSheet}
							onedit={openTradeSheetEdit}
						/>
					{/each}
				</div>
			{:else}
				<div class="w-full overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
								<th class="w-24 whitespace-nowrap">Symbol</th>
								<th class="whitespace-nowrap">Side</th>
								<th class="whitespace-nowrap">Status</th>
								<th class="text-right whitespace-nowrap">Entry</th>
								<th class="text-right whitespace-nowrap">Exit</th>
								<th class="text-right whitespace-nowrap">Qty</th>
								<th class="text-right whitespace-nowrap">Stop</th>
								<th class="text-right whitespace-nowrap">Target</th>
								<th class="text-right whitespace-nowrap">R:R</th>
								<th class="whitespace-nowrap">Opened</th>
								<th class="whitespace-nowrap">Closed</th>
								<th class="text-right whitespace-nowrap">P&amp;L</th>
								<th class="whitespace-nowrap">Tags</th>
								<th class="w-14 text-right whitespace-nowrap">Actions</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each filteredTrades as t (t.id)}
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
										<span
											class={[
												"inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize",
												t.status === "open"
													? "bg-amber-700/10 text-amber-700 dark:text-amber-400"
													: "bg-muted text-muted-foreground"
											]}
										>
											{t.status}
										</span>
									</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatPrice(t.entry_price)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatPrice(t.exit_price)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatQty(t.quantity)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatPrice(t.stop_loss)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">{formatPrice(t.take_profit)}</td>
									<td class="text-right tabular-nums text-xs whitespace-nowrap">{formatRiskReward(rowRiskReward(t))}</td>
									<td class="tabular-nums text-xs whitespace-nowrap">{formatWhen(t.opened_at)}</td>
									<td class="tabular-nums text-xs whitespace-nowrap">{formatWhen(t.closed_at)}</td>
									<td class="text-right tabular-nums whitespace-nowrap text-xs">
										<span
											class={[
												"font-medium",
												pnl != null && pnl > 0 && "text-emerald-700 dark:text-emerald-400",
												pnl != null && pnl < 0 && "text-rose-700 dark:text-rose-400",
												(pnl == null || pnl === 0) && "text-muted-foreground"
											]}
										>
											{formatUsd(pnl)}
										</span>
									</td>
									<td class="whitespace-nowrap text-xs">
										{#if (t.strategy_ids ?? []).length === 0 && (t.mistake_ids ?? []).length === 0}
											<span class="text-muted-foreground text-xs">—</span>
										{:else}
											<div class="flex flex-wrap gap-1 whitespace-nowrap text-xs">
												{#each (t.strategy_ids ?? []) as sid}
													{@const name = strategyStore.strategies.find((s) => s.id === sid)?.name}
													{#if name}
														<span class="inline-flex items-center rounded-md bg-emerald-700/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
															{name}
														</span>
													{/if}
												{/each}
												{#each (t.mistake_ids ?? []) as mid}
													{@const name = mistakeStore.mistakes.find((m) => m.id === mid)?.name}
													{#if name}
														<span class="inline-flex items-center rounded-md bg-rose-700/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">
															{name}
														</span>
													{/if}
												{/each}
											</div>
										{/if}
									</td>
									<td class="px-2 text-right whitespace-nowrap text-xs">
										<div class="inline-flex items-center gap-0.5">
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 shrink-0 cursor-pointer"
												aria-label="View trade details"
												onclick={() => openDetailSheet(t)}
											>
												<EyeIcon size={16} class="text-muted-foreground" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 shrink-0 cursor-pointer"
												aria-label="Share trade"
												onclick={() => openShareSheet(t)}
											>
												<ShareNetworkIcon size={16} class="text-muted-foreground" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 shrink-0 cursor-pointer"
												aria-label="Edit trade"
												onclick={() => openTradeSheetEdit(t)}
											>
												<PencilSimpleIcon size={18} class="text-muted-foreground" />
											</Button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			{#if !loading && tradeStore.total > 0}
				{@const totalPages = Math.ceil(tradeStore.total / PAGE_SIZE)}
				<div class="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
					<span class="tabular-nums">
						{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, tradeStore.total)} of {tradeStore.total} {tradeStore.total === 1 ? "trade" : "trades"}
					</span>
					<div class="flex items-center gap-1">
						<Button variant="outline" size="sm" class="h-7 px-2 text-xs" disabled={currentPage <= 1} onclick={() => goToPage(currentPage - 1)}>Previous</Button>
						<span class="px-2 tabular-nums">{currentPage} / {totalPages}</span>
						<Button variant="outline" size="sm" class="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onclick={() => goToPage(currentPage + 1)}>Next</Button>
					</div>
				</div>
			{/if}
		</div>

		<Dialog.Root
			bind:open={tradeSheetOpen}
			onOpenChange={(open: boolean) => {
				if (!open) closeTradeSheet();
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
							<div class="flex items-baseline justify-between">
								<div class="text-xs font-medium">Stop loss</div>
							</div>
							<Input
								bind:value={formStopLoss}
								inputmode="decimal"
								placeholder="Required"
								class="rounded-md"
								oninput={() => { formRiskInput = ""; }}
							/>
						</div>
						<div class="space-y-1.5">
							<div class="flex items-baseline justify-between">
								<div class="text-xs font-medium">Take profit</div>
							</div>
							<Input
								bind:value={formTakeProfit}
								inputmode="decimal"
								placeholder="Required"
								class="rounded-md"
								oninput={() => { formProfitInput = ""; }}
							/>
						</div>
					</div>

					<label class="flex items-center gap-2 cursor-pointer select-none">
						<input type="checkbox" bind:checked={showRiskProfit} class="rounded border-input cursor-pointer" />
						<span class="text-xs text-muted-foreground">Manually add risk and profit target</span>
					</label>

					{#if showRiskProfit}
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">
								Risk ($)
							</div>
							<Input
								bind:value={formRiskInput}
								inputmode="decimal"
								placeholder="e.g. 250"
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
							<div class="text-xs font-medium">
								Profit ($)
							</div>
							<Input
								bind:value={formProfitInput}
								inputmode="decimal"
								placeholder="e.g. 500"
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

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Opened at</div>
						<DateTimePicker
							value={formOpenedAt}
							onValueChange={(v) => (formOpenedAt = v ?? toDatetimeLocalValue(new Date()))}
						/>
					</div>

					{#if formStatus === "closed"}
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Exit price</div>
								<Input bind:value={formExitPrice} inputmode="decimal" placeholder="Optional" class="rounded-md" />
							</div>
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Closed at</div>
								<DateTimePicker
									value={formClosedAt}
									onValueChange={(v) => (formClosedAt = v)}
									clearable
								/>
							</div>
						</div>
					{/if}

					{#if formStatus === "closed"}
						<div class="space-y-1.5">
							<div class="text-xs font-medium">P&amp;L</div>
							<Input bind:value={formPnl} inputmode="decimal" placeholder="Optional" class="rounded-md" />
							<p class="text-[11px] text-muted-foreground leading-snug">
								Auto-calculated from entry, exit, quantity, and instrument. Edit if you
								need a different number (fees, scaling, partials).
							</p>
						</div>
					{/if}
				{/if}

				{#if tradeStep === 2}
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
								<Button variant="outline" class="rounded-md cursor-pointer" onclick={closeTradeSheet}>
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

		<Sheet.Root bind:open={detailSheetOpen}>
			<Sheet.Content side="right" class="w-[min(100vw,560px)] sm:max-w-[560px]">
				{#if detailTrade}
					{@const t = detailTrade}
					{@const side = normalizeSide(t.side)}
					{@const pnl = num(t.pnl)}
					{@const rr = rowRiskReward(t)}
					{@const dollarRiskFromStop = (() => {
						const e = num(t.entry_price);
						const sl = num(t.stop_loss);
						const q = num(t.quantity);
						const instr = instrumentStore.instruments?.find((i) => i.symbol === t.symbol);
						if (e == null || sl == null || q == null) return null;
						return Math.abs(instrumentPnl(instr, side ?? "long", e, sl, q));
					})()}
					{@const screenshotUrl = (t as TradeRow & { screenshot_url?: string | null }).screenshot_url ?? null}
					{@const psychStates = (t as TradeRow & { emotional_states?: string[] | null }).emotional_states ?? []}
					{@const psychConfidence = (t as TradeRow & { confidence?: number | null }).confidence ?? null}
					{@const psychMental = (t as TradeRow & { mental_state?: string | null }).mental_state ?? null}
					{@const psychPlan = (t as TradeRow & { followed_plan?: "yes" | "no" | "partial" | null }).followed_plan ?? null}

					<Sheet.Header>
						<Sheet.Title class="flex items-center gap-2">
							<span>{t.symbol}</span>
							{#if side === "long"}
								<span class="inline-flex items-center gap-1 rounded-md bg-emerald-700/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
									<ChartLineUpIcon size={12} /> Long
								</span>
							{:else if side === "short"}
								<span class="inline-flex items-center gap-1 rounded-md bg-rose-700/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">
									<ChartLineDownIcon size={12} /> Short
								</span>
							{/if}
							<span
								class={[
									"inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize",
									t.status === "open"
										? "bg-amber-700/10 text-amber-700 dark:text-amber-400"
										: "bg-muted text-muted-foreground"
								]}
							>
								{t.status}
							</span>
						</Sheet.Title>
						<Sheet.Description>Trade details</Sheet.Description>
					</Sheet.Header>

					<div class="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
						<!-- Headline P&L -->
						<div class={[
							"rounded-md border p-4",
							pnl != null && pnl > 0 && "border-emerald-700/30 bg-emerald-700/5",
							pnl != null && pnl < 0 && "border-rose-700/30 bg-rose-700/5",
							(pnl == null || pnl === 0) && "bg-muted/30"
						]}>
							<div class="text-xs text-muted-foreground">P&amp;L</div>
							<div class={[
								"mt-1 text-2xl font-semibold tabular-nums",
								pnl != null && pnl > 0 && "text-emerald-700 dark:text-emerald-400",
								pnl != null && pnl < 0 && "text-rose-700 dark:text-rose-400"
							]}>
								{formatUsd(pnl)}
							</div>
							<div class="mt-1 text-[11px] text-muted-foreground tabular-nums">
								R:R {formatRiskReward(rr)} · Risk {formatUsd(dollarRiskFromStop)}
							</div>
						</div>

						<!-- Trade fields -->
						<div class="space-y-2">
							<div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trade</div>
							<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
								<div><dt class="text-muted-foreground">Entry</dt><dd class="tabular-nums">{formatPrice(t.entry_price)}</dd></div>
								<div><dt class="text-muted-foreground">Exit</dt><dd class="tabular-nums">{formatPrice(t.exit_price)}</dd></div>
								<div><dt class="text-muted-foreground">Quantity</dt><dd class="tabular-nums">{formatQty(t.quantity)}</dd></div>
								<div><dt class="text-muted-foreground">Stop loss</dt><dd class="tabular-nums">{formatPrice(t.stop_loss)}</dd></div>
								<div><dt class="text-muted-foreground">Take profit</dt><dd class="tabular-nums">{formatPrice(t.take_profit)}</dd></div>
								<div><dt class="text-muted-foreground">Risk ($)</dt><dd class="tabular-nums">{formatUsd(num(t.risk))}</dd></div>
								<div><dt class="text-muted-foreground">R-multiple</dt><dd class="tabular-nums">{num(t.r_multiple) != null ? num(t.r_multiple)!.toFixed(2) : "—"}</dd></div>
								<div><dt class="text-muted-foreground">Market</dt><dd>{t.market ?? "—"}</dd></div>
							</dl>
						</div>

						<!-- Timing -->
						<div class="space-y-2">
							<div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Timing</div>
							<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
								<div><dt class="text-muted-foreground">Opened</dt><dd>{formatWhen(t.opened_at)}</dd></div>
								<div><dt class="text-muted-foreground">Closed</dt><dd>{formatWhen(t.closed_at)}</dd></div>
								<div><dt class="text-muted-foreground">Created</dt><dd>{formatWhen(t.created_at)}</dd></div>
								<div><dt class="text-muted-foreground">Updated</dt><dd>{formatWhen(t.updated_at)}</dd></div>
							</dl>
						</div>

						<!-- Psychology -->
						<div class="space-y-2">
							<div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Psychology</div>
							<div>
								<div class="text-[11px] text-muted-foreground mb-1">Emotional state</div>
								{#if psychStates.length > 0}
									<div class="flex flex-wrap gap-1">
										{#each psychStates as s}
											<span class="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] capitalize">{s}</span>
										{/each}
									</div>
								{:else}
									<p class="text-xs text-muted-foreground">—</p>
								{/if}
							</div>
							<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
								<div>
									<dt class="text-muted-foreground">Confidence</dt>
									<dd class="tabular-nums">{psychConfidence != null ? `${psychConfidence}/5` : "—"}</dd>
								</div>
								<div>
									<dt class="text-muted-foreground">Followed plan</dt>
									<dd class="capitalize">{psychPlan ?? "—"}</dd>
								</div>
							</dl>
							<div>
								<div class="text-[11px] text-muted-foreground mb-1">Mental / physical state</div>
								<p class="text-xs whitespace-pre-wrap text-muted-foreground">{psychMental ?? "—"}</p>
							</div>
						</div>

						<!-- Strategies & mistakes -->
						{#if (t.strategy_ids ?? []).length > 0 || (t.mistake_ids ?? []).length > 0}
							<div class="space-y-2">
								<div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</div>
								{#if (t.strategy_ids ?? []).length > 0}
									<div>
										<div class="text-[11px] text-muted-foreground mb-1">Strategies</div>
										<div class="flex flex-wrap gap-1">
											{#each (t.strategy_ids ?? []) as sid}
												{@const name = strategyStore.strategies.find((s) => s.id === sid)?.name}
												{#if name}
													<span class="inline-flex items-center rounded-md bg-emerald-700/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">{name}</span>
												{/if}
											{/each}
										</div>
									</div>
								{/if}
								{#if (t.mistake_ids ?? []).length > 0}
									<div>
										<div class="text-[11px] text-muted-foreground mb-1">Mistakes</div>
										<div class="flex flex-wrap gap-1">
											{#each (t.mistake_ids ?? []) as mid}
												{@const name = mistakeStore.mistakes.find((m) => m.id === mid)?.name}
												{#if name}
													<span class="inline-flex items-center rounded-md bg-rose-700/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">{name}</span>
												{/if}
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}

						<!-- Notes -->
						{#if t.notes}
							<div class="space-y-2">
								<div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</div>
								<p class="text-xs whitespace-pre-wrap">{t.notes}</p>
							</div>
						{/if}

						<!-- Screenshot -->
						{#if screenshotUrl}
							<div class="space-y-2">
								<div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Screenshot</div>
								<a href={screenshotUrl} target="_blank" rel="noopener" class="block rounded-md overflow-hidden border">
									<img src={screenshotUrl} alt="Trade screenshot" class="w-full max-h-80 object-contain bg-muted/30" />
								</a>
							</div>
						{/if}
					</div>

					<Sheet.Footer class="border-t">
						<div class="flex w-full justify-end gap-2">
							<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (detailSheetOpen = false)}>Close</Button>
							<Button
								class="rounded-md cursor-pointer"
								onclick={() => {
									detailSheetOpen = false;
									openTradeSheetEdit(t);
								}}
							>
								<PencilSimpleIcon size={14} /> Edit
							</Button>
						</div>
					</Sheet.Footer>
				{/if}
			</Sheet.Content>
		</Sheet.Root>

		{#if sharingTrade}
			{@const t = sharingTrade}
			<PnlShareDialog
				variant="trade"
				bind:open={shareSheetOpen}
				symbol={t.symbol}
				side={normalizeSide(t.side)}
				status={t.status}
				pnl={num(t.pnl) ?? null}
				entryPrice={num(t.entry_price) ?? null}
				exitPrice={num(t.exit_price) ?? null}
				quantity={num(t.quantity) ?? null}
				rr={rowRiskReward(t)}
				openedAt={t.opened_at}
				closedAt={t.closed_at}
			/>
		{/if}
	</div>
</ScrollArea>

<Sheet.Root bind:open={payoutSheetOpen}>
	<Sheet.Content side="right" class="w-[min(100vw,400px)] sm:max-w-[400px]">
		<Sheet.Header>
			<Sheet.Title>Add payout</Sheet.Title>
			<Sheet.Description>Record a payout received from this funded account.</Sheet.Description>
		</Sheet.Header>

<div class="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Gross profit ($)</div>
				<Input bind:value={payoutGross} type="number" inputmode="decimal" placeholder="e.g. 1000" class="rounded-md" />
				{#if payoutGross && Number(payoutGross) > 0 && activeAccount?.profit_split}
					{@const split = activeAccount.profit_split}
					{@const payout = Number(payoutGross) * split}
					<div class="rounded-md bg-muted/50 border px-3 py-2 text-xs space-y-0.5">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Split</span>
							<span>{Math.round(split * 100)}% / {Math.round((1 - split) * 100)}%</span>
						</div>
						<div class="flex justify-between font-medium">
							<span class="text-muted-foreground">You receive</span>
							<span class="text-emerald-700 dark:text-emerald-400">{formatUsd(payout)}</span>
						</div>
					</div>
				{:else if payoutGross && Number(payoutGross) > 0}
					<p class="text-[11px] text-muted-foreground">No profit split set on this account — set one in Settings → Accounts to enable auto-calculation.</p>
				{/if}
			</div>
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Payout date</div>
				<DateTimePicker
					value={payoutDate}
					onValueChange={(v) => (payoutDate = v ?? toDatetimeLocalValue(new Date()))}
				/>
			</div>
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Notes</div>
				<textarea
					bind:value={payoutNotes}
					rows="3"
					class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
					placeholder="Optional"
				></textarea>
			</div>
		</div>

		<Sheet.Footer class="border-t">
			<div class="flex justify-end gap-2">
				<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (payoutSheetOpen = false)}>Cancel</Button>
				<Button class="rounded-md cursor-pointer" disabled={payoutSaving} onclick={submitPayout}>
					{payoutSaving ? "Saving…" : "Request payout"}
				</Button>
			</div>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
