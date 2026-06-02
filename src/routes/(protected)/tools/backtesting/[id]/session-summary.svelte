<script lang="ts">
	import { backtestFailStatus, type BacktestSession } from "$lib/stores/backtest-sessions.svelte";
	import { Button } from "$lib/components/ui/button";
	import { num, normalizeSide } from "$lib/utils/number";
	import {
		formatDate,
		formatFraction,
		formatNumber,
		formatUsd,
		formatWhen,
	} from "$lib/utils/format";
	import {
		BracketsCurlyIcon,
		ChartLineDownIcon,
		ChartLineUpIcon,
		FileMdIcon,
		FlaskIcon,
		NotePencilIcon,
	} from "phosphor-svelte";

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

	interface NamedRecord {
		id: string;
		name: string;
	}

	let {
		session,
		trades,
		strategies = [],
		mistakes = [],
		instrumentSymbol = null,
	}: {
		session: BacktestSession | null;
		trades: TradeRow[];
		strategies?: NamedRecord[];
		mistakes?: NamedRecord[];
		instrumentSymbol?: string | null;
	} = $props();

	function rTrade(t: TradeRow): number | null {
		const pnl = num(t.pnl);
		const risk = num(t.risk);
		if (pnl == null || risk == null || risk <= 0) return null;
		return pnl / risk;
	}

	function plannedRR(t: TradeRow): number | null {
		const e = num(t.entry_price);
		const sl = num(t.stop_loss);
		const tp = num(t.take_profit);
		const side = normalizeSide(t.side);
		if (e == null || sl == null || tp == null || !side) return null;
		const riskDist = side === "long" ? e - sl : sl - e;
		const rewardDist = side === "long" ? tp - e : e - tp;
		if (riskDist <= 0 || rewardDist <= 0) return null;
		return rewardDist / riskDist;
	}

	const strategyById = $derived(new Map(strategies.map((s) => [s.id, s.name])));
	const mistakeById = $derived(new Map(mistakes.map((m) => [m.id, m.name])));

	const closedTrades = $derived(trades.filter((t) => t.status === "closed"));
	const openTrades = $derived(trades.filter((t) => t.status === "open"));

	const metrics = $derived.by(() => {
		const closed = closedTrades;
		const pnls = closed.map((t) => num(t.pnl) ?? 0);
		const wins = pnls.filter((p) => p > 0);
		const losses = pnls.filter((p) => p < 0);
		const breakeven = pnls.filter((p) => p === 0);

		const netPnl = pnls.reduce((a, b) => a + b, 0);
		const grossWin = wins.reduce((a, b) => a + b, 0);
		const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
		const winRate = closed.length ? wins.length / closed.length : null;
		const lossRate = closed.length ? losses.length / closed.length : null;
		const avgWin = wins.length ? grossWin / wins.length : null;
		const avgLoss = losses.length ? -grossLoss / losses.length : null;
		const expectancy = closed.length
			? netPnl / closed.length
			: null;
		const profitFactor =
			grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null;
		const largestWin = wins.length ? Math.max(...wins) : null;
		const largestLoss = losses.length ? Math.min(...losses) : null;

		const rValues = closed
			.map(rTrade)
			.filter((v): v is number => v != null);
		const avgR = rValues.length
			? rValues.reduce((a, b) => a + b, 0) / rValues.length
			: null;

		const plannedRRValues = trades
			.map(plannedRR)
			.filter((v): v is number => v != null);
		const avgPlannedRR = plannedRRValues.length
			? plannedRRValues.reduce((a, b) => a + b, 0) / plannedRRValues.length
			: null;

		return {
			totalTrades: trades.length,
			closedCount: closed.length,
			openCount: openTrades.length,
			winCount: wins.length,
			lossCount: losses.length,
			breakevenCount: breakeven.length,
			netPnl,
			grossWin,
			grossLoss,
			winRate,
			lossRate,
			avgWin,
			avgLoss,
			expectancy,
			profitFactor,
			largestWin,
			largestLoss,
			avgR,
			avgPlannedRR,
		};
	});

	const failStatus = $derived(backtestFailStatus(session?.max_loss_limit, metrics.netPnl));

	const equity = $derived.by(() => {
		const start = Number(session?.starting_balance ?? 0);
		const sorted = closedTrades
			.filter((t) => t.closed_at)
			.sort(
				(a, b) =>
					new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime()
			);
		let balance = start;
		let peak = start;
		let maxDrawdown = 0;
		let maxDrawdownPct: number | null = null;
		for (const t of sorted) {
			balance += num(t.pnl) ?? 0;
			if (balance > peak) peak = balance;
			const dd = peak - balance;
			if (dd > maxDrawdown) {
				maxDrawdown = dd;
				maxDrawdownPct = peak > 0 ? dd / peak : null;
			}
		}
		const end = balance;
		const pct = start > 0 ? (end - start) / start : null;
		return { start, end, pct, maxDrawdown, maxDrawdownPct };
	});

	const strategyBreakdown = $derived.by(() => {
		const map = new Map<
			string,
			{ id: string; name: string; trades: number; wins: number; pnl: number }
		>();
		for (const t of closedTrades) {
			const ids = t.strategy_ids ?? [];
			const pnl = num(t.pnl) ?? 0;
			const isWin = pnl > 0;
			for (const id of ids) {
				const name = strategyById.get(id) ?? "Unknown";
				const entry = map.get(id) ?? { id, name, trades: 0, wins: 0, pnl: 0 };
				entry.trades += 1;
				entry.wins += isWin ? 1 : 0;
				entry.pnl += pnl;
				map.set(id, entry);
			}
		}
		return Array.from(map.values()).sort((a, b) => b.pnl - a.pnl);
	});

	const mistakeBreakdown = $derived.by(() => {
		const map = new Map<
			string,
			{ id: string; name: string; trades: number; pnl: number }
		>();
		for (const t of closedTrades) {
			const ids = t.mistake_ids ?? [];
			const pnl = num(t.pnl) ?? 0;
			for (const id of ids) {
				const name = mistakeById.get(id) ?? "Unknown";
				const entry = map.get(id) ?? { id, name, trades: 0, pnl: 0 };
				entry.trades += 1;
				entry.pnl += pnl;
				map.set(id, entry);
			}
		}
		return Array.from(map.values()).sort((a, b) => a.pnl - b.pnl);
	});

	const orderedTrades = $derived(
		[...trades].sort((a, b) => {
			const ax = new Date(a.opened_at).getTime();
			const bx = new Date(b.opened_at).getTime();
			return ax - bx;
		})
	);

	const tradesWithNotes = $derived(
		orderedTrades.filter((t) => (t.notes ?? "").trim().length > 0)
	);

	function safeFilename(name: string | null | undefined) {
		const base = (name ?? "session").trim() || "session";
		return base.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "session";
	}

	function triggerDownload(filename: string, content: string, mimeType: string) {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function buildExportPayload() {
		return {
			generated_at: new Date().toISOString(),
			session: session
				? {
					id: session.id,
					name: session.name,
					description: session.description,
					instrument_id: session.instrument_id,
					instrument_symbol: instrumentSymbol,
					starting_balance: session.starting_balance,
					max_loss_limit: session.max_loss_limit,
					failed: failStatus?.breached ?? false,
					period_start: session.period_start,
					period_end: session.period_end,
					notes: session.notes,
					archived: session.archived,
					created_at: session.created_at,
					updated_at: session.updated_at,
				}
				: null,
			metrics: {
				total_trades: metrics.totalTrades,
				closed: metrics.closedCount,
				open: metrics.openCount,
				wins: metrics.winCount,
				losses: metrics.lossCount,
				breakeven: metrics.breakevenCount,
				net_pnl: metrics.netPnl,
				gross_win: metrics.grossWin,
				gross_loss: metrics.grossLoss,
				win_rate: metrics.winRate,
				profit_factor: metrics.profitFactor === Infinity ? null : metrics.profitFactor,
				expectancy_per_trade: metrics.expectancy,
				avg_win: metrics.avgWin,
				avg_loss: metrics.avgLoss,
				largest_win: metrics.largestWin,
				largest_loss: metrics.largestLoss,
				avg_realised_r: metrics.avgR,
				avg_planned_rr: metrics.avgPlannedRR,
			},
			equity: {
				starting_balance: equity.start,
				ending_balance: equity.end,
				return_pct: equity.pct,
				max_drawdown: equity.maxDrawdown,
				max_drawdown_pct: equity.maxDrawdownPct,
			},
			strategy_breakdown: strategyBreakdown.map((s) => ({
				id: s.id,
				name: s.name,
				trades: s.trades,
				wins: s.wins,
				win_rate: s.trades ? s.wins / s.trades : null,
				net_pnl: s.pnl,
			})),
			mistake_breakdown: mistakeBreakdown.map((m) => ({
				id: m.id,
				name: m.name,
				trades: m.trades,
				net_pnl: m.pnl,
			})),
			trades: orderedTrades.map((t) => ({
				id: t.id,
				symbol: t.symbol,
				side: normalizeSide(t.side),
				status: t.status,
				entry_price: num(t.entry_price) ?? null,
				exit_price: num(t.exit_price) ?? null,
				quantity: num(t.quantity) ?? null,
				stop_loss: num(t.stop_loss) ?? null,
				take_profit: num(t.take_profit) ?? null,
				risk: num(t.risk) ?? null,
				pnl: num(t.pnl) ?? null,
				opened_at: t.opened_at,
				closed_at: t.closed_at,
				notes: t.notes,
				realised_r: rTrade(t),
				planned_rr: plannedRR(t),
				strategies: (t.strategy_ids ?? []).map((id) => ({
					id,
					name: strategyById.get(id) ?? null,
				})),
				mistakes: (t.mistake_ids ?? []).map((id) => ({
					id,
					name: mistakeById.get(id) ?? null,
				})),
			})),
		};
	}

	function fmtUsdMd(value?: number | null) {
		if (value == null || !Number.isFinite(value)) return "—";
		const sign = value < 0 ? "-" : "";
		return `${sign}$${Math.abs(value).toFixed(2)}`;
	}

	function fmtPctMd(value?: number | null, digits = 2) {
		if (value == null || !Number.isFinite(value)) return "—";
		return `${(value * 100).toFixed(digits)}%`;
	}

	function buildMarkdown() {
		const lines: string[] = [];
		const name = session?.name ?? "Session";
		lines.push(`# Session Summary: ${name}`);
		lines.push("");
		if (session?.description) {
			lines.push(`> ${session.description.replace(/\n/g, "\n> ")}`);
			lines.push("");
		}

		lines.push("## Overview");
		lines.push("");
		lines.push(`- **Period:** ${formatDate(session?.period_start)} → ${formatDate(session?.period_end)}`);
		if (instrumentSymbol) lines.push(`- **Instrument:** ${instrumentSymbol}`);
		if (session?.starting_balance != null) {
			lines.push(`- **Starting balance:** ${fmtUsdMd(Number(session.starting_balance))}`);
		}
		if (session?.max_loss_limit != null) {
			lines.push(`- **Max loss limit:** ${fmtUsdMd(Number(session.max_loss_limit))}${failStatus?.breached ? " (breached)" : ""}`);
		}
		lines.push(`- **Status:** ${failStatus?.breached ? "Failed" : session?.archived ? "Archived" : "Active"}`);
		lines.push(`- **Created:** ${formatDate(session?.created_at ?? null)}`);
		lines.push(`- **Last updated:** ${formatDate(session?.updated_at ?? null)}`);
		lines.push("");

		if (session?.notes?.trim()) {
			lines.push("## Notes");
			lines.push("");
			lines.push(session.notes);
			lines.push("");
		}

		lines.push("## Key Metrics");
		lines.push("");
		lines.push("| Metric | Value |");
		lines.push("|---|---|");
		lines.push(`| Total trades | ${metrics.totalTrades} (${metrics.closedCount} closed / ${metrics.openCount} open) |`);
		lines.push(`| Net P&L | ${fmtUsdMd(metrics.netPnl)} |`);
		lines.push(`| Win rate | ${fmtPctMd(metrics.winRate, 1)} (${metrics.winCount}W / ${metrics.lossCount}L${metrics.breakevenCount ? ` / ${metrics.breakevenCount}BE` : ""}) |`);
		lines.push(
			`| Profit factor | ${
				metrics.profitFactor == null
					? "—"
					: metrics.profitFactor === Infinity
						? "∞"
						: metrics.profitFactor.toFixed(2)
			} |`
		);
		lines.push(`| Expectancy / trade | ${fmtUsdMd(metrics.expectancy)} |`);
		lines.push(`| Avg realised R | ${metrics.avgR == null ? "—" : `${metrics.avgR.toFixed(2)}R`} |`);
		lines.push(`| Avg planned R:R | ${metrics.avgPlannedRR == null ? "—" : `1:${metrics.avgPlannedRR.toFixed(2)}`} |`);
		lines.push(`| Avg win | ${fmtUsdMd(metrics.avgWin)} |`);
		lines.push(`| Avg loss | ${fmtUsdMd(metrics.avgLoss)} |`);
		lines.push(`| Largest win | ${fmtUsdMd(metrics.largestWin)} |`);
		lines.push(`| Largest loss | ${fmtUsdMd(metrics.largestLoss)} |`);
		lines.push(`| Gross win | ${fmtUsdMd(metrics.grossWin)} |`);
		lines.push(`| Gross loss | ${fmtUsdMd(-metrics.grossLoss)} |`);
		lines.push("");

		lines.push("## Equity");
		lines.push("");
		lines.push(`- Starting balance: ${fmtUsdMd(equity.start)}`);
		lines.push(`- Ending balance: ${fmtUsdMd(equity.end)}`);
		lines.push(`- Return: ${equity.pct == null ? "—" : `${equity.pct > 0 ? "+" : ""}${(equity.pct * 100).toFixed(2)}%`}`);
		lines.push(
			`- Max drawdown: ${equity.maxDrawdown > 0 ? fmtUsdMd(-equity.maxDrawdown) : "—"}${
				equity.maxDrawdownPct != null ? ` (${fmtPctMd(-equity.maxDrawdownPct, 2)})` : ""
			}`
		);
		lines.push("");

		if (strategyBreakdown.length > 0) {
			lines.push("## Performance by strategy");
			lines.push("");
			lines.push("| Strategy | Trades | Win rate | Net P&L |");
			lines.push("|---|---:|---:|---:|");
			for (const s of strategyBreakdown) {
				const wr = s.trades ? s.wins / s.trades : null;
				lines.push(`| ${s.name} | ${s.trades} | ${fmtPctMd(wr, 0)} | ${fmtUsdMd(s.pnl)} |`);
			}
			lines.push("");
		}

		if (mistakeBreakdown.length > 0) {
			lines.push("## Mistake impact");
			lines.push("");
			lines.push("| Mistake | Trades | Net P&L |");
			lines.push("|---|---:|---:|");
			for (const m of mistakeBreakdown) {
				lines.push(`| ${m.name} | ${m.trades} | ${fmtUsdMd(m.pnl)} |`);
			}
			lines.push("");
		}

		lines.push("## Trades");
		lines.push("");
		if (orderedTrades.length === 0) {
			lines.push("_No trades._");
		} else {
			orderedTrades.forEach((t, idx) => {
				const side = normalizeSide(t.side);
				const sideLabel = side ? side.charAt(0).toUpperCase() + side.slice(1) : "—";
				const statusLabel = t.status.charAt(0).toUpperCase() + t.status.slice(1);
				lines.push(`### ${idx + 1}. ${t.symbol} · ${sideLabel} · ${statusLabel} · ${formatWhen(t.opened_at)}`);
				lines.push("");
				const entry = num(t.entry_price);
				const exit = num(t.exit_price);
				const qty = num(t.quantity);
				const sl = num(t.stop_loss);
				const tp = num(t.take_profit);
				const pnl = num(t.pnl);
				if (entry != null) lines.push(`- Entry: ${entry}${exit != null ? ` → Exit: ${exit}` : ""}`);
				if (qty != null) lines.push(`- Quantity: ${qty}`);
				if (sl != null || tp != null) lines.push(`- Stop: ${sl ?? "—"} · Target: ${tp ?? "—"}`);
				if (t.status === "closed") {
					lines.push(`- P&L: ${fmtUsdMd(pnl)}`);
					const r = rTrade(t);
					if (r != null) lines.push(`- Realised R: ${r.toFixed(2)}R`);
					if (t.closed_at) lines.push(`- Closed: ${formatWhen(t.closed_at)}`);
				}
				const stratNames = (t.strategy_ids ?? [])
					.map((id) => strategyById.get(id))
					.filter(Boolean) as string[];
				const mistakeNames = (t.mistake_ids ?? [])
					.map((id) => mistakeById.get(id))
					.filter(Boolean) as string[];
				if (stratNames.length) lines.push(`- Strategies: ${stratNames.join(", ")}`);
				if (mistakeNames.length) lines.push(`- Mistakes: ${mistakeNames.join(", ")}`);
				if (t.notes?.trim()) {
					lines.push("");
					lines.push("**Notes:**");
					lines.push("");
					lines.push(`> ${t.notes.replace(/\n/g, "\n> ")}`);
				}
				lines.push("");
			});
		}

		lines.push("---");
		lines.push(`_Generated ${new Date().toLocaleString()}._`);
		return lines.join("\n");
	}

	function exportJson() {
		const payload = buildExportPayload();
		triggerDownload(
			`${safeFilename(session?.name)}-summary.json`,
			JSON.stringify(payload, null, 2),
			"application/json"
		);
	}

	function exportMarkdown() {
		triggerDownload(
			`${safeFilename(session?.name)}-summary.md`,
			buildMarkdown(),
			"text/markdown"
		);
	}
</script>

<div class="space-y-6">
	<!-- Header summary -->
	<section class="space-y-2">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="flex flex-wrap items-center gap-2">
				<FlaskIcon size={18} class="text-muted-foreground shrink-0" />
				<h2 class="text-lg font-semibold tracking-tight">{session?.name ?? "Session"}</h2>
				{#if failStatus?.breached}
					<span class="rounded-md bg-rose-700/10 px-2 py-0.5 text-[10px] font-medium uppercase text-rose-700 dark:text-rose-400">
						Failed
					</span>
				{/if}
				{#if session?.archived}
					<span class="rounded-md bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
						Archived
					</span>
				{/if}
				{#if instrumentSymbol}
					<span class="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
						{instrumentSymbol}
					</span>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					class="cursor-pointer rounded-md"
					onclick={exportMarkdown}
				>
					<FileMdIcon />
					Markdown
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="cursor-pointer rounded-md"
					onclick={exportJson}
				>
					<BracketsCurlyIcon />
					JSON
				</Button>
			</div>
		</div>
		{#if session?.description}
			<p class="text-sm text-muted-foreground">{session.description}</p>
		{/if}
		<div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground tabular-nums">
			<div>
				<span class="font-medium text-foreground">Period:</span>
				{formatDate(session?.period_start)} → {formatDate(session?.period_end)}
			</div>
			<div>
				<span class="font-medium text-foreground">Created:</span>
				{formatDate(session?.created_at ?? null)}
			</div>
			<div>
				<span class="font-medium text-foreground">Last updated:</span>
				{formatDate(session?.updated_at ?? null)}
			</div>
		</div>
	</section>

	{#if session?.notes?.trim()}
		<section class="rounded-md border bg-muted/20 p-4">
			<div class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<NotePencilIcon size={14} />
				Session notes
			</div>
			<p class="whitespace-pre-line text-sm leading-relaxed">{session.notes}</p>
		</section>
	{/if}

	<!-- Key metrics -->
	<section>
		<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
			Key metrics
		</h3>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
			<div class="rounded-md border bg-background p-3">
				<div class="text-[11px] text-muted-foreground">Trades</div>
				<div class="mt-1 text-xl font-semibold tabular-nums">{metrics.totalTrades}</div>
				<div class="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
					{metrics.closedCount} closed · {metrics.openCount} open
				</div>
			</div>
			<div class={[
				"rounded-md border p-3",
				metrics.netPnl > 0 && "border-emerald-700/30 bg-emerald-700/5",
				metrics.netPnl < 0 && "border-rose-700/30 bg-rose-700/5",
				metrics.netPnl === 0 && "bg-background"
			]}>
				<div class="text-[11px] text-muted-foreground">Net P&amp;L</div>
				<div class={[
					"mt-1 text-xl font-semibold tabular-nums",
					metrics.netPnl > 0 && "text-emerald-700 dark:text-emerald-400",
					metrics.netPnl < 0 && "text-rose-700 dark:text-rose-400"
				]}>
					{formatUsd(metrics.netPnl)}
				</div>
			</div>
			<div class="rounded-md border bg-background p-3">
				<div class="text-[11px] text-muted-foreground">Win rate</div>
				<div class="mt-1 text-xl font-semibold tabular-nums">{formatFraction(metrics.winRate, 1)}</div>
				<div class="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
					{metrics.winCount}W / {metrics.lossCount}L{metrics.breakevenCount ? ` / ${metrics.breakevenCount}BE` : ""}
				</div>
			</div>
			<div class="rounded-md border bg-background p-3">
				<div class="text-[11px] text-muted-foreground">Profit factor</div>
				<div class="mt-1 text-xl font-semibold tabular-nums">
					{metrics.profitFactor == null
						? "—"
						: metrics.profitFactor === Infinity
							? "∞"
							: formatNumber(metrics.profitFactor)}
				</div>
			</div>
			<div class="rounded-md border bg-background p-3">
				<div class="text-[11px] text-muted-foreground">Expectancy / trade</div>
				<div class={[
					"mt-1 text-xl font-semibold tabular-nums",
					metrics.expectancy != null && metrics.expectancy > 0 && "text-emerald-700 dark:text-emerald-400",
					metrics.expectancy != null && metrics.expectancy < 0 && "text-rose-700 dark:text-rose-400"
				]}>
					{formatUsd(metrics.expectancy)}
				</div>
			</div>
			<div class="rounded-md border bg-background p-3">
				<div class="text-[11px] text-muted-foreground">Avg R (realised)</div>
				<div class="mt-1 text-xl font-semibold tabular-nums">
					{metrics.avgR == null ? "—" : `${metrics.avgR.toFixed(2)}R`}
				</div>
			</div>
			<div class="rounded-md border bg-background p-3">
				<div class="text-[11px] text-muted-foreground">Avg planned R:R</div>
				<div class="mt-1 text-xl font-semibold tabular-nums">
					{metrics.avgPlannedRR == null ? "—" : `1:${metrics.avgPlannedRR.toFixed(2)}`}
				</div>
			</div>
			<div class="rounded-md border bg-background p-3">
				<div class="text-[11px] text-muted-foreground">Max drawdown</div>
				<div class="mt-1 text-xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
					{equity.maxDrawdown > 0 ? formatUsd(-equity.maxDrawdown) : "—"}
				</div>
				{#if equity.maxDrawdownPct != null}
					<div class="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
						{formatFraction(-equity.maxDrawdownPct, 2)}
					</div>
				{/if}
			</div>
		</div>
	</section>

	<!-- Equity & wins/losses -->
	<section class="grid gap-3 md:grid-cols-2">
		<div class="rounded-md border bg-background p-4">
			<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equity</div>
			<div class="mt-2 space-y-1.5 text-sm tabular-nums">
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Starting balance</span>
					<span>{formatUsd(equity.start)}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Ending balance</span>
					<span class="font-medium">{formatUsd(equity.end)}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-muted-foreground">Return</span>
					<span class={[
						"font-medium",
						equity.pct != null && equity.pct > 0 && "text-emerald-700 dark:text-emerald-400",
						equity.pct != null && equity.pct < 0 && "text-rose-700 dark:text-rose-400"
					]}>
						{equity.pct == null
							? "—"
							: `${equity.pct > 0 ? "+" : ""}${(equity.pct * 100).toFixed(2)}%`}
					</span>
				</div>
				{#if failStatus}
					<div class="flex items-center justify-between border-t pt-1.5">
						<span class="text-muted-foreground">Max loss limit</span>
						<span class={[
							"font-medium",
							failStatus.breached && "text-rose-700 dark:text-rose-400"
						]}>
							{formatUsd(failStatus.limit)} · {failStatus.breached ? "breached" : "within"}
						</span>
					</div>
				{/if}
			</div>
		</div>

		<div class="rounded-md border bg-background p-4">
			<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Wins vs losses
			</div>
			<div class="mt-2 grid grid-cols-2 gap-3 text-sm tabular-nums">
				<div>
					<div class="text-[11px] text-muted-foreground">Avg win</div>
					<div class="font-medium text-emerald-700 dark:text-emerald-400">
						{formatUsd(metrics.avgWin)}
					</div>
				</div>
				<div>
					<div class="text-[11px] text-muted-foreground">Avg loss</div>
					<div class="font-medium text-rose-700 dark:text-rose-400">
						{formatUsd(metrics.avgLoss)}
					</div>
				</div>
				<div>
					<div class="text-[11px] text-muted-foreground">Largest win</div>
					<div class="font-medium text-emerald-700 dark:text-emerald-400">
						{formatUsd(metrics.largestWin)}
					</div>
				</div>
				<div>
					<div class="text-[11px] text-muted-foreground">Largest loss</div>
					<div class="font-medium text-rose-700 dark:text-rose-400">
						{formatUsd(metrics.largestLoss)}
					</div>
				</div>
				<div>
					<div class="text-[11px] text-muted-foreground">Gross win</div>
					<div class="font-medium">{formatUsd(metrics.grossWin)}</div>
				</div>
				<div>
					<div class="text-[11px] text-muted-foreground">Gross loss</div>
					<div class="font-medium">{formatUsd(-metrics.grossLoss)}</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Strategy breakdown -->
	{#if strategyBreakdown.length > 0}
		<section>
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Performance by strategy
			</h3>
			<div class="overflow-x-auto rounded-md border bg-background">
				<table class="w-full text-xs">
					<thead class="bg-muted/30 text-muted-foreground">
						<tr class="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
							<th>Strategy</th>
							<th class="text-right">Trades</th>
							<th class="text-right">Win rate</th>
							<th class="text-right">Net P&amp;L</th>
						</tr>
					</thead>
					<tbody class="[&>tr:not(:last-child)]:border-b">
						{#each strategyBreakdown as s (s.id)}
							{@const wr = s.trades ? s.wins / s.trades : null}
							<tr class="[&>td]:px-3 [&>td]:py-2">
								<td class="font-medium">{s.name}</td>
								<td class="text-right tabular-nums">{s.trades}</td>
								<td class="text-right tabular-nums">{formatFraction(wr, 0)}</td>
								<td class={[
									"text-right tabular-nums font-medium",
									s.pnl > 0 && "text-emerald-700 dark:text-emerald-400",
									s.pnl < 0 && "text-rose-700 dark:text-rose-400"
								]}>
									{formatUsd(s.pnl)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<!-- Mistake breakdown -->
	{#if mistakeBreakdown.length > 0}
		<section>
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Mistake impact
			</h3>
			<div class="overflow-x-auto rounded-md border bg-background">
				<table class="w-full text-xs">
					<thead class="bg-muted/30 text-muted-foreground">
						<tr class="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
							<th>Mistake</th>
							<th class="text-right">Trades affected</th>
							<th class="text-right">Net P&amp;L</th>
						</tr>
					</thead>
					<tbody class="[&>tr:not(:last-child)]:border-b">
						{#each mistakeBreakdown as m (m.id)}
							<tr class="[&>td]:px-3 [&>td]:py-2">
								<td class="font-medium">{m.name}</td>
								<td class="text-right tabular-nums">{m.trades}</td>
								<td class={[
									"text-right tabular-nums font-medium",
									m.pnl > 0 && "text-emerald-700 dark:text-emerald-400",
									m.pnl < 0 && "text-rose-700 dark:text-rose-400"
								]}>
									{formatUsd(m.pnl)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<!-- Trade notes log -->
	<section>
		<div class="mb-2 flex items-center justify-between">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Trade notes
			</h3>
			<span class="text-[11px] text-muted-foreground">
				{tradesWithNotes.length} of {orderedTrades.length} trades have notes
			</span>
		</div>
		{#if tradesWithNotes.length === 0}
			<div class="rounded-md border bg-muted/10 p-4 text-center text-xs text-muted-foreground">
				No trade-level notes recorded yet.
			</div>
		{:else}
			<ol class="space-y-3">
				{#each tradesWithNotes as t (t.id)}
					{@const side = normalizeSide(t.side)}
					{@const pnl = num(t.pnl)}
					{@const tStrategies = (t.strategy_ids ?? []).map((id) => strategyById.get(id)).filter(Boolean)}
					{@const tMistakes = (t.mistake_ids ?? []).map((id) => mistakeById.get(id)).filter(Boolean)}
					<li class="rounded-md border bg-background p-3">
						<div class="flex flex-wrap items-center gap-2 text-xs">
							<span class="font-semibold">{t.symbol}</span>
							{#if side === "long"}
								<span class="inline-flex items-center gap-1 rounded-md bg-emerald-700/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
									<ChartLineUpIcon size={10} /> Long
								</span>
							{:else if side === "short"}
								<span class="inline-flex items-center gap-1 rounded-md bg-rose-700/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">
									<ChartLineDownIcon size={10} /> Short
								</span>
							{/if}
							<span class={[
								"inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize",
								t.status === "open"
									? "bg-amber-700/10 text-amber-700 dark:text-amber-400"
									: "bg-muted text-muted-foreground"
							]}>
								{t.status}
							</span>
							<span class="text-muted-foreground tabular-nums">{formatWhen(t.opened_at)}</span>
							{#if pnl != null && t.status === "closed"}
								<span class={[
									"ml-auto font-medium tabular-nums",
									pnl > 0 && "text-emerald-700 dark:text-emerald-400",
									pnl < 0 && "text-rose-700 dark:text-rose-400",
									pnl === 0 && "text-muted-foreground"
								]}>
									{formatUsd(pnl)}
								</span>
							{/if}
						</div>
						{#if tStrategies.length || tMistakes.length}
							<div class="mt-1.5 flex flex-wrap gap-1">
								{#each tStrategies as name}
									<span class="rounded-md bg-emerald-700/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
										{name}
									</span>
								{/each}
								{#each tMistakes as name}
									<span class="rounded-md bg-rose-700/10 px-1.5 py-0.5 text-[10px] text-rose-700 dark:text-rose-400">
										{name}
									</span>
								{/each}
							</div>
						{/if}
						<p class="mt-2 whitespace-pre-line text-xs leading-relaxed">{t.notes}</p>
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</div>
