<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { ChartLineDownIcon, ChartLineUpIcon, FlaskIcon, PencilSimpleIcon } from "phosphor-svelte";
	import { instrumentStore, instrumentPnl } from "$lib/stores/instruments.svelte";
	import { strategyStore } from "$lib/stores/strategies.svelte";
	import { mistakeStore } from "$lib/stores/mistakes.svelte";
	import { checklistStore } from "$lib/stores/checklist.svelte";
	import { num, normalizeSide } from "$lib/utils/number";
	import { formatPrice, formatQty, formatRiskReward, formatUsd, formatWhen } from "$lib/utils/format";
	import { rowRiskReward, type TradeRow } from "./trade-utils";

	let {
		open = $bindable(false),
		trade,
		onedit
	}: {
		open?: boolean;
		trade: TradeRow | null;
		onedit: (t: TradeRow) => void;
	} = $props();
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-[min(100vw,560px)] sm:max-w-[560px]">
		{#if trade}
			{@const t = trade}
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
			{@const screenshotUrl = t.screenshot_url ?? null}
			{@const psychStates = t.emotional_states ?? []}
			{@const psychConfidence = t.confidence ?? null}
			{@const psychMental = t.mental_state ?? null}
			{@const psychPlan = t.followed_plan ?? null}
			{@const psychEntryReason = t.entry_reason ?? null}
			{@const psychExitReason = t.exit_reason ?? null}

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
					{#if t.is_backtest}
						<span class="inline-flex items-center gap-1 rounded-md bg-indigo-700/10 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-400">
							<FlaskIcon size={12} /> Backtest
						</span>
					{/if}
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
						<div class="text-[11px] text-muted-foreground mb-1">Why entered</div>
						<p class="text-xs whitespace-pre-wrap text-muted-foreground">{psychEntryReason ?? "—"}</p>
					</div>
					{#if t.status === "closed"}
						<div>
							<div class="text-[11px] text-muted-foreground mb-1">Why exited</div>
							<p class="text-xs whitespace-pre-wrap text-muted-foreground">{psychExitReason ?? "—"}</p>
						</div>
					{/if}
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

				<!-- Pre-trade checklist -->
				{#if checklistStore.items.length > 0}
					{@const tChecklistIds = t.checklist_item_ids ?? []}
					<div class="space-y-2">
						<div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pre-trade checklist</div>
						<ul class="space-y-1">
							{#each checklistStore.items as item (item.id)}
								{@const on = tChecklistIds.includes(item.id)}
								<li class="flex items-start gap-2 text-xs">
									<span class={[
										"mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm border text-[10px] font-bold",
										on ? "border-emerald-700/40 bg-emerald-700/10 text-emerald-700 dark:text-emerald-400" : "border-muted-foreground/30 text-muted-foreground/40",
									]}>{on ? "✓" : ""}</span>
									<span class={on ? "" : "text-muted-foreground line-through"}>{item.label}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

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
					<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (open = false)}>Close</Button>
					<Button
						class="rounded-md cursor-pointer"
						onclick={() => {
							open = false;
							onedit(t);
						}}
					>
						<PencilSimpleIcon size={14} /> Edit
					</Button>
				</div>
			</Sheet.Footer>
		{/if}
	</Sheet.Content>
</Sheet.Root>
