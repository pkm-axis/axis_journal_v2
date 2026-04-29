<script lang="ts">
	import type { Account } from "$lib/stores/accounts.svelte";
	import type { Trade } from "$lib/stores/trades.svelte";
	import { WarningIcon, CheckCircleIcon, TrophyIcon } from "phosphor-svelte";
	import { Button } from "$lib/components/ui/button";

	let {
		account,
		trades,
		onGraduate,
		graduatedTo,
		onSwitchToGraduated,
	}: {
		account: Account;
		trades: Trade[];
		onGraduate?: () => void;
		graduatedTo?: Account | null;
		onSwitchToGraduated?: () => void;
	} = $props();

	function num(v: unknown): number {
		if (v == null || v === "") return 0;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : 0;
	}

	function fmtUsd(v: number | null | undefined, sign = false) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: "USD",
			signDisplay: sign ? "exceptZero" : "auto",
		}).format(v);
	}

	const closedTrades = $derived(trades.filter((t) => t.status === "closed"));

	const netPnl = $derived(closedTrades.reduce((a, t) => a + num(t.pnl), 0));

	// Today's P&L (closed_at within current local day).
	const todayPnl = $derived.by(() => {
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		const startMs = start.getTime();
		const endMs = startMs + 24 * 60 * 60 * 1000;
		return closedTrades
			.filter((t) => {
				if (!t.closed_at) return false;
				const at = new Date(t.closed_at).getTime();
				return at >= startMs && at < endMs;
			})
			.reduce((a, t) => a + num(t.pnl), 0);
	});

	// Best single day's P&L (for consistency rule check).
	const bestDayPnl = $derived.by(() => {
		const byDay = new Map<string, number>();
		for (const t of closedTrades) {
			if (!t.closed_at) continue;
			const d = new Date(t.closed_at);
			const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
			byDay.set(key, (byDay.get(key) ?? 0) + num(t.pnl));
		}
		let best = 0;
		for (const v of byDay.values()) if (v > best) best = v;
		return best;
	});

	// Distance from peak equity (max drawdown tracking).
	const drawdownFromPeak = $derived.by(() => {
		const sorted = closedTrades
			.filter((t) => t.closed_at)
			.map((t) => ({ at: new Date(t.closed_at!).getTime(), pnl: num(t.pnl) }))
			.sort((a, b) => a.at - b.at);
		let cum = 0;
		let peak = 0;
		for (const p of sorted) {
			cum += p.pnl;
			if (cum > peak) peak = cum;
		}
		return peak - cum; // positive = how far below peak we are
	});

	const profitTarget = $derived(account.prop_firm_profit_target ?? null);
	const maxDrawdown = $derived(account.prop_firm_max_drawdown ?? null);
	const dailyLossLimit = $derived(account.prop_firm_daily_loss_limit ?? null);
	const consistencyRule = $derived(account.prop_firm_consistency_rule ?? null);

	// Parse "30%" or "0.3" into a fraction (0–1).
	const consistencyFraction = $derived.by(() => {
		if (!consistencyRule) return null;
		const m = consistencyRule.match(/([\d.]+)/);
		if (!m) return null;
		const n = Number(m[1]);
		if (!Number.isFinite(n)) return null;
		return n > 1 ? n / 100 : n;
	});

	// Best day's share of total profit. Only meaningful when net is positive.
	const bestDayShare = $derived.by(() => {
		if (netPnl <= 0 || bestDayPnl <= 0) return null;
		return bestDayPnl / netPnl;
	});

	function clampPct(v: number) {
		if (!Number.isFinite(v)) return 0;
		return Math.max(0, Math.min(100, v));
	}

	// Heuristic: treat as evaluation if phase mentions "eval" / "challenge", or no phase set.
	const isEvaluation = $derived.by(() => {
		const phase = (account.prop_firm_type ?? "").toLowerCase();
		return phase.includes("eval") || phase.includes("challenge") || phase === "";
	});

	const passedAllRules = $derived.by(() => {
		// Must have a profit target and have hit it.
		if (profitTarget == null || netPnl < profitTarget) return false;
		// Drawdown not breached.
		if (maxDrawdown != null && drawdownFromPeak >= maxDrawdown) return false;
		// Daily loss limit never breached on any past day.
		if (dailyLossLimit != null) {
			const byDay = new Map<string, number>();
			for (const t of closedTrades) {
				if (!t.closed_at) continue;
				const d = new Date(t.closed_at);
				const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
				byDay.set(key, (byDay.get(key) ?? 0) + num(t.pnl));
			}
			for (const v of byDay.values()) {
				if (v < 0 && Math.abs(v) >= dailyLossLimit) return false;
			}
		}
		// Consistency rule (if any) not violated.
		if (consistencyFraction != null && bestDayShare != null && bestDayShare >= consistencyFraction) return false;
		return true;
	});

	const showGraduate = $derived(isEvaluation && passedAllRules && !!onGraduate);
</script>

<div class="rounded-md border bg-background">
	<div class="flex items-start justify-between gap-3 border-b px-4 py-3">
		<div>
			<div class="flex items-center gap-2">
				<div class="text-sm font-medium">Prop firm rules</div>
				{#if account.prop_firm_name}
					<span class="text-xs text-muted-foreground">· {account.prop_firm_name}</span>
				{/if}
				{#if account.prop_firm_type}
					<span class="text-xs text-muted-foreground capitalize">· {account.prop_firm_type}</span>
				{/if}
			</div>
			<p class="text-xs text-muted-foreground">Live progress against this account's funding rules.</p>
		</div>
		{#if graduatedTo}
			<Button
				size="sm"
				variant="outline"
				class="cursor-pointer rounded-md"
				onclick={onSwitchToGraduated}
			>
				<TrophyIcon size={14} weight="fill" class="text-emerald-700 dark:text-emerald-400" />
				Graduated · open {graduatedTo.name}
			</Button>
		{:else if showGraduate}
			<Button size="sm" class="cursor-pointer rounded-md bg-emerald-700 hover:bg-emerald-800 text-white" onclick={onGraduate}>
				<TrophyIcon size={14} weight="fill" /> Graduate to funded
			</Button>
		{/if}
	</div>

	<div class="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
		<!-- Profit target -->
		<div class="bg-background p-4">
			<div class="text-xs text-muted-foreground">Profit target</div>
			{#if profitTarget == null}
				<div class="mt-1 text-sm text-muted-foreground">Not set</div>
			{:else}
				{@const pct = clampPct((netPnl / profitTarget) * 100)}
				{@const reached = netPnl >= profitTarget}
				<div class="mt-1 flex items-baseline gap-1">
					<div class={[
						"text-xl font-semibold tabular-nums",
						reached && "text-emerald-700 dark:text-emerald-400",
					]}>
						{fmtUsd(netPnl, true)}
					</div>
					<div class="text-xs text-muted-foreground">/ {fmtUsd(profitTarget)}</div>
				</div>
				<div class="mt-2 h-1.5 w-full rounded-sm bg-muted">
					<div
						class={[
							"h-full rounded-sm",
							reached ? "bg-emerald-700/70" : "bg-primary/70",
						]}
						style={`width:${pct}%`}
					></div>
				</div>
				<div class="mt-1 text-[11px] text-muted-foreground">
					{reached ? "Target reached" : `${fmtUsd(profitTarget - netPnl)} to go`}
				</div>
			{/if}
		</div>

		<!-- Max drawdown -->
		<div class="bg-background p-4">
			<div class="text-xs text-muted-foreground">Max drawdown</div>
			{#if maxDrawdown == null}
				<div class="mt-1 text-sm text-muted-foreground">Not set</div>
			{:else}
				{@const used = drawdownFromPeak}
				{@const buffer = maxDrawdown - used}
				{@const pct = clampPct((used / maxDrawdown) * 100)}
				{@const danger = pct >= 70}
				{@const breached = used >= maxDrawdown}
				<div class={[
					"mt-1 flex items-center gap-1.5 text-xl font-semibold tabular-nums",
					breached && "text-rose-700 dark:text-rose-400",
					danger && !breached && "text-amber-700 dark:text-amber-400",
				]}>
					{fmtUsd(buffer)}
					{#if danger || breached}
						<WarningIcon size={16} weight="fill" />
					{/if}
				</div>
				<div class="mt-1 h-1.5 w-full rounded-sm bg-muted">
					<div
						class={[
							"h-full rounded-sm",
							breached ? "bg-rose-700" : danger ? "bg-amber-600" : "bg-emerald-700/70",
						]}
						style={`width:${pct}%`}
					></div>
				</div>
				<div class="mt-1 text-[11px] text-muted-foreground">
					{fmtUsd(used)} from peak · cap {fmtUsd(maxDrawdown)}
				</div>
			{/if}
		</div>

		<!-- Daily loss limit -->
		<div class="bg-background p-4">
			<div class="text-xs text-muted-foreground">Today's P&L</div>
			{#if dailyLossLimit == null}
				<div class="mt-1 flex items-baseline gap-1">
					<div class={[
						"text-xl font-semibold tabular-nums",
						todayPnl > 0 && "text-emerald-700 dark:text-emerald-400",
						todayPnl < 0 && "text-rose-700 dark:text-rose-400",
					]}>
						{fmtUsd(todayPnl, true)}
					</div>
				</div>
				<div class="mt-1 text-[11px] text-muted-foreground">No daily loss limit set</div>
			{:else}
				{@const lossUsed = todayPnl < 0 ? Math.abs(todayPnl) : 0}
				{@const pct = clampPct((lossUsed / dailyLossLimit) * 100)}
				{@const danger = pct >= 70}
				{@const breached = lossUsed >= dailyLossLimit}
				<div class={[
					"mt-1 flex items-center gap-1.5 text-xl font-semibold tabular-nums",
					todayPnl > 0 && "text-emerald-700 dark:text-emerald-400",
					todayPnl < 0 && !danger && "text-rose-700 dark:text-rose-400",
					(danger || breached) && "text-rose-700 dark:text-rose-400",
				]}>
					{fmtUsd(todayPnl, true)}
					{#if danger || breached}
						<WarningIcon size={16} weight="fill" />
					{/if}
				</div>
				<div class="mt-1 h-1.5 w-full rounded-sm bg-muted">
					<div
						class={[
							"h-full rounded-sm",
							breached ? "bg-rose-700" : danger ? "bg-amber-600" : "bg-emerald-700/70",
						]}
						style={`width:${pct}%`}
					></div>
				</div>
				<div class="mt-1 text-[11px] text-muted-foreground">
					Limit {fmtUsd(dailyLossLimit)} · {fmtUsd(Math.max(0, dailyLossLimit - lossUsed))} buffer
				</div>
			{/if}
		</div>

		<!-- Consistency -->
		<div class="bg-background p-4">
			<div class="text-xs text-muted-foreground">Consistency</div>
			{#if !consistencyRule}
				<div class="mt-1 text-sm text-muted-foreground">No rule set</div>
			{:else if consistencyFraction == null || bestDayShare == null}
				<div class="mt-1 text-xl font-semibold tabular-nums">—</div>
				<div class="mt-1 text-[11px] text-muted-foreground">{consistencyRule}</div>
			{:else}
				{@const pct = clampPct((bestDayShare / consistencyFraction) * 100)}
				{@const breached = bestDayShare >= consistencyFraction}
				{@const danger = pct >= 80 && !breached}
				<div class={[
					"mt-1 flex items-center gap-1.5 text-xl font-semibold tabular-nums",
					breached && "text-rose-700 dark:text-rose-400",
					danger && "text-amber-700 dark:text-amber-400",
					!breached && !danger && "text-emerald-700 dark:text-emerald-400",
				]}>
					{Math.round(bestDayShare * 100)}%
					{#if breached}
						<WarningIcon size={16} weight="fill" />
					{:else if !danger}
						<CheckCircleIcon size={16} weight="fill" />
					{/if}
				</div>
				<div class="mt-1 h-1.5 w-full rounded-sm bg-muted">
					<div
						class={[
							"h-full rounded-sm",
							breached ? "bg-rose-700" : danger ? "bg-amber-600" : "bg-emerald-700/70",
						]}
						style={`width:${pct}%`}
					></div>
				</div>
				<div class="mt-1 text-[11px] text-muted-foreground">
					Best day {fmtUsd(bestDayPnl)} · cap {Math.round(consistencyFraction * 100)}%
				</div>
			{/if}
		</div>
	</div>
</div>
