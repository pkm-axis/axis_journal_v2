<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import {
		ChartLineDownIcon,
		ChartLineUpIcon,
		PencilSimpleIcon,
		ShareNetworkIcon
	} from "phosphor-svelte";

	let screenshotOpen = $state(false);

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
		screenshot_url?: string | null;
		created_at: string;
		updated_at: string;
		strategy_ids?: string[];
		mistake_ids?: string[];
	}

	interface Strategy { id: string; name: string }
	interface Mistake { id: string; name: string }

	let {
		trade,
		strategies = [],
		mistakes = [],
		onshare,
		onedit
	}: {
		trade: TradeRow;
		strategies?: Strategy[];
		mistakes?: Mistake[];
		onshare: (t: TradeRow) => void;
		onedit: (t: TradeRow) => void;
	} = $props();

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

	const side = $derived(normalizeSide(trade.side));
	const pnl = $derived(num(trade.pnl));
	const rr = $derived(() => {
		const e = num(trade.entry_price);
		const sl = num(trade.stop_loss);
		const tp = num(trade.take_profit);
		if (e == null || sl == null || tp == null || (side !== "long" && side !== "short")) return null;
		return riskRewardRatio(e, sl, tp, side);
	});
</script>

<div class="rounded-md border bg-background flex flex-col overflow-hidden">
	<!-- Cover photo -->
	{#if trade.screenshot_url}
		<button
			type="button"
			class="relative h-36 w-full overflow-hidden bg-muted cursor-zoom-in"
			onclick={() => (screenshotOpen = true)}
			aria-label="View screenshot"
		>
			<img
				src={trade.screenshot_url}
				alt="Trade screenshot"
				class="h-full w-full object-cover"
			/>
		</button>

		<Dialog.Root bind:open={screenshotOpen}>
			<Dialog.Content class="sm:max-w-3xl p-0 overflow-hidden" showCloseButton={true}>
				<img
					src={trade.screenshot_url}
					alt="Trade screenshot"
					class="w-full max-h-[80vh] object-contain"
				/>
			</Dialog.Content>
		</Dialog.Root>
	{/if}

	<!-- Header -->
	<div class="flex items-center justify-between px-4 pt-4 pb-3">
		<div class="flex items-center gap-2">
			<span class="text-base font-semibold">{trade.symbol}</span>
			{#if side === "long"}
				<span class="inline-flex items-center gap-1 rounded-md bg-emerald-700/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
					<ChartLineUpIcon size={11} /> Long
				</span>
			{:else if side === "short"}
				<span class="inline-flex items-center gap-1 rounded-md bg-rose-700/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">
					<ChartLineDownIcon size={11} /> Short
				</span>
			{/if}
			<span class={[
				"inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize",
				trade.status === "open"
					? "bg-amber-700/10 text-amber-700 dark:text-amber-400"
					: "bg-muted text-muted-foreground"
			]}>
				{trade.status}
			</span>
		</div>
		<div class="inline-flex items-center gap-0.5">
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7 shrink-0 cursor-pointer"
				aria-label="Share trade"
				onclick={() => onshare(trade)}
			>
				<ShareNetworkIcon size={14} class="text-muted-foreground" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7 shrink-0 cursor-pointer"
				aria-label="Edit trade"
				onclick={() => onedit(trade)}
			>
				<PencilSimpleIcon size={15} class="text-muted-foreground" />
			</Button>
		</div>
	</div>

	<!-- P&L -->
	{#if pnl != null}
		<div class={[
			"mx-4 mb-3 rounded-md px-3 py-2 text-center tabular-nums",
			pnl > 0 && "bg-emerald-700/10",
			pnl < 0 && "bg-rose-700/10",
			pnl === 0 && "bg-muted"
		]}>
			<div class="text-[10px] text-muted-foreground mb-0.5">P&L</div>
			<div class={[
				"text-lg font-semibold",
				pnl > 0 && "text-emerald-700 dark:text-emerald-400",
				pnl < 0 && "text-rose-700 dark:text-rose-400"
			]}>
				{formatUsd(pnl)}
			</div>
		</div>
	{/if}

	<!-- Details grid -->
	<div class="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pb-3 text-xs">
		<div>
			<div class="text-muted-foreground">Entry</div>
			<div class="tabular-nums font-medium">{formatPrice(trade.entry_price)}</div>
		</div>
		<div>
			<div class="text-muted-foreground">Exit</div>
			<div class="tabular-nums font-medium">{formatPrice(trade.exit_price)}</div>
		</div>
		<div>
			<div class="text-muted-foreground">Qty</div>
			<div class="tabular-nums font-medium">{formatQty(trade.quantity)}</div>
		</div>
		<div>
			<div class="text-muted-foreground">R:R</div>
			<div class="tabular-nums font-medium">{formatRiskReward(rr())}</div>
		</div>
		<div>
			<div class="text-muted-foreground">Opened</div>
			<div class="tabular-nums font-medium">{formatWhen(trade.opened_at)}</div>
		</div>
		<div>
			<div class="text-muted-foreground">Closed</div>
			<div class="tabular-nums font-medium">{formatWhen(trade.closed_at)}</div>
		</div>
	</div>

	<!-- Tags -->
	{#if (trade.strategy_ids ?? []).length > 0 || (trade.mistake_ids ?? []).length > 0}
		<div class="flex flex-wrap gap-1 border-t px-4 py-2.5">
			{#each (trade.strategy_ids ?? []) as sid}
				{@const name = strategies.find((s) => s.id === sid)?.name}
				{#if name}
					<span class="inline-flex items-center rounded-md bg-emerald-700/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
						{name}
					</span>
				{/if}
			{/each}
			{#each (trade.mistake_ids ?? []) as mid}
				{@const name = mistakes.find((m) => m.id === mid)?.name}
				{#if name}
					<span class="inline-flex items-center rounded-md bg-rose-700/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">
						{name}
					</span>
				{/if}
			{/each}
		</div>
	{/if}
</div>
