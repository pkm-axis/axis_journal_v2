<script lang="ts">
	import type { Session } from "@supabase/supabase-js";
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import TradeCard from "$lib/components/trades/trade-card.svelte";
	import {
		ChartLineDownIcon,
		ChartLineUpIcon,
		EyeIcon,
		FlaskIcon,
		PencilSimpleIcon,
		RowsIcon,
		ShareNetworkIcon,
		SquaresFourIcon
	} from "phosphor-svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { strategyStore } from "$lib/stores/strategies.svelte";
	import { mistakeStore } from "$lib/stores/mistakes.svelte";
	import { num, normalizeSide } from "$lib/utils/number";
	import { formatPrice, formatQty, formatRiskReward, formatUsd, formatWhen } from "$lib/utils/format";
	import { rowRiskReward, type TradeRow } from "./trade-utils";

	let {
		trades,
		loading,
		session,
		viewMode = $bindable("table"),
		total,
		pageSize,
		currentPage,
		onview,
		onshare,
		onedit,
		onpage
	}: {
		trades: TradeRow[];
		loading: boolean;
		session: Session | null;
		viewMode?: "table" | "gallery";
		total: number;
		pageSize: number;
		currentPage: number;
		onview: (t: TradeRow) => void;
		onshare: (t: TradeRow) => void;
		onedit: (t: TradeRow) => void;
		onpage: (p: number) => void;
	} = $props();
</script>

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
	{:else if trades.length === 0}
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
			{#each trades as t (t.id)}
				<TradeCard
					trade={t}
					strategies={strategyStore.strategies}
					mistakes={mistakeStore.mistakes}
					onshare={onshare}
					onedit={onedit}
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
					{#each trades as t (t.id)}
						{@const side = normalizeSide(t.side)}
						{@const pnl = num(t.pnl)}
						<tr class="[&>td]:px-4 [&>td]:py-3 hover:bg-muted/30">
							<td class="font-medium whitespace-nowrap text-xs">
								<div class="inline-flex items-center gap-1.5">
									<span>{t.symbol}</span>
									{#if t.is_backtest}
										<span class="inline-flex items-center gap-0.5 rounded-md bg-indigo-700/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-400" title="Backtest trade">
											<FlaskIcon size={10} /> BT
										</span>
									{/if}
								</div>
							</td>
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
										onclick={() => onview(t)}
									>
										<EyeIcon size={16} class="text-muted-foreground" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="h-8 w-8 shrink-0 cursor-pointer"
										aria-label="Share trade"
										onclick={() => onshare(t)}
									>
										<ShareNetworkIcon size={16} class="text-muted-foreground" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="h-8 w-8 shrink-0 cursor-pointer"
										aria-label="Edit trade"
										onclick={() => onedit(t)}
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
	{#if !loading && total > 0}
		{@const totalPages = Math.ceil(total / pageSize)}
		<div class="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
			<span class="tabular-nums">
				{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of {total} {total === 1 ? "trade" : "trades"}
			</span>
			<div class="flex items-center gap-1">
				<Button variant="outline" size="sm" class="h-7 px-2 text-xs" disabled={currentPage <= 1} onclick={() => onpage(currentPage - 1)}>Previous</Button>
				<span class="px-2 tabular-nums">{currentPage} / {totalPages}</span>
				<Button variant="outline" size="sm" class="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onclick={() => onpage(currentPage + 1)}>Next</Button>
			</div>
		</div>
	{/if}
</div>
