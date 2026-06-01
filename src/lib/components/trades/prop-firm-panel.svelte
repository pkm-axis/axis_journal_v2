<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { PlusIcon, TrashIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { payoutStore } from "$lib/stores/payouts.svelte";
	import { formatUsd, formatWhen } from "$lib/utils/format";

	let {
		propFirmStats,
		onaddpayout
	}: {
		propFirmStats: {
			cost: number | null;
			totalPayouts: number;
			roi: number | null;
			remaining: number | null;
			breakEvenReached: boolean;
		} | null;
		onaddpayout: () => void;
	} = $props();
</script>

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
		<Button variant="outline" size="sm" class="rounded-md cursor-pointer h-7 text-xs" onclick={onaddpayout}>
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
