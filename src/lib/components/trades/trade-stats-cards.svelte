<script lang="ts">
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { formatRiskReward, formatUsd } from "$lib/utils/format";

	let {
		stats,
		total,
		loading
	}: {
		stats: { count: number; netPnl: number; winRate: number | null; avgRr: number | null };
		total: number;
		loading: boolean;
	} = $props();
</script>

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
		<div class="mt-1 text-2xl font-semibold tabular-nums">{total}</div>
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
