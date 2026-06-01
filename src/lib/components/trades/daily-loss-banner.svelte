<script lang="ts">
	import { WarningIcon } from "phosphor-svelte";
	import { formatUsd } from "$lib/utils/format";

	let {
		status
	}: {
		status: {
			limit: number;
			todayPnl: number;
			lossUsed: number;
			buffer: number;
			pct: number;
			breached: boolean;
			danger: boolean;
		};
	} = $props();

	const fmtUsdShort = (v: number, sign = false) => formatUsd(v, { sign, maxFractionDigits: 0 });
</script>

<div class={[
	"rounded-md border px-4 py-3 text-sm flex items-start gap-3",
	status.breached
		? "border-rose-700/40 bg-rose-700/10 text-rose-700 dark:text-rose-400"
		: "border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-400",
]}>
	<WarningIcon size={18} weight="fill" class="mt-0.5 shrink-0" />
	<div class="min-w-0 flex-1">
		<div class="font-medium">
			{#if status.breached}
				Daily loss limit breached — stop trading for the day.
			{:else}
				Inside the daily loss danger zone ({Math.round(status.pct)}% of limit used).
			{/if}
		</div>
		<div class="text-xs opacity-90 mt-0.5">
			Today: <span class="font-medium tabular-nums">{fmtUsdShort(status.todayPnl, true)}</span>
			· Limit: <span class="tabular-nums">{fmtUsdShort(status.limit)}</span>
			· Buffer left: <span class="font-medium tabular-nums">{fmtUsdShort(status.buffer)}</span>
		</div>
	</div>
</div>
