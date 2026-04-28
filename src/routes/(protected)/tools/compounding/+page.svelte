<script lang="ts">
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Input } from "$lib/components/ui/input";

	let startBalance = $state("10000");
	let returnPerTrade = $state("0.5"); // % per trade
	let tradesPerPeriod = $state("20");
	let periods = $state("12"); // e.g. months

	function num(v: unknown): number | null {
		if (v == null || v === "") return null;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : null;
	}

	const projection = $derived.by(() => {
		const start = num(startBalance);
		const ret = num(returnPerTrade);
		const tpp = num(tradesPerPeriod);
		const n = num(periods);
		if (start == null || ret == null || tpp == null || n == null) return null;
		if (start <= 0 || tpp < 0 || n < 0) return null;
		const rPerTrade = ret / 100;
		const factor = Math.pow(1 + rPerTrade, tpp);
		const rows: { period: number; balance: number; gain: number }[] = [];
		let bal = start;
		for (let i = 1; i <= Math.min(n, 240); i++) {
			const next = bal * factor;
			rows.push({ period: i, balance: next, gain: next - bal });
			bal = next;
		}
		return { start, rows, final: bal };
	});

	const totalReturn = $derived.by(() => {
		if (!projection) return null;
		return ((projection.final - projection.start) / projection.start) * 100;
	});

	const maxBalance = $derived(projection ? Math.max(projection.start, ...projection.rows.map((r) => r.balance)) : 0);

	function fmtUsd(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD", maximumFractionDigits: 0,
		}).format(v);
	}

	function fmtUsdPrecise(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD", maximumFractionDigits: 2,
		}).format(v);
	}

	function fmtPct(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return `${v.toFixed(2)}%`;
	}
</script>

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Tools</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Compounding</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-4 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Compounding</h1>
			<p class="text-sm text-muted-foreground">
				Project account growth assuming consistent per-trade returns are reinvested.
			</p>
		</div>

		<div class="grid gap-4 lg:grid-cols-[1fr_1fr]">
			<!-- Inputs -->
			<div class="rounded-md border bg-background p-4 space-y-4">
				<div class="text-sm font-medium">Inputs</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Starting balance ($)</div>
					<Input bind:value={startBalance} inputmode="decimal" placeholder="10000" class="rounded-md" />
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Avg return per trade (%)</div>
					<Input bind:value={returnPerTrade} inputmode="decimal" placeholder="0.5" class="rounded-md" />
					<p class="text-[11px] text-muted-foreground leading-snug">
						Net % gained per trade on the current balance. E.g. risking 1% with 0.5R expectancy = 0.5%.
					</p>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Trades per period</div>
						<Input bind:value={tradesPerPeriod} inputmode="decimal" placeholder="20" class="rounded-md" />
					</div>
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Periods</div>
						<Input bind:value={periods} inputmode="decimal" placeholder="12" class="rounded-md" />
					</div>
				</div>
				<p class="text-[11px] text-muted-foreground -mt-2">
					Periods are abstract — months, weeks, whatever you trade in. Capped at 240.
				</p>
			</div>

			<!-- Outputs -->
			<div class="rounded-md border bg-muted/20 p-4 space-y-4">
				<div class="text-sm font-medium">Projection</div>

				<div>
					<div class="text-xs text-muted-foreground">Final balance</div>
					<div class={[
						"mt-1 text-3xl font-bold tabular-nums",
						projection && projection.final > projection.start && "text-emerald-700 dark:text-emerald-400",
						projection && projection.final < projection.start && "text-rose-700 dark:text-rose-400",
					]}>
						{fmtUsd(projection?.final ?? null)}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<div class="text-xs text-muted-foreground">Total return</div>
						<div class={[
							"mt-1 text-lg font-semibold tabular-nums",
							totalReturn != null && totalReturn > 0 && "text-emerald-700 dark:text-emerald-400",
							totalReturn != null && totalReturn < 0 && "text-rose-700 dark:text-rose-400",
						]}>
							{fmtPct(totalReturn)}
						</div>
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Net gain</div>
						<div class="mt-1 text-lg font-semibold tabular-nums">
							{projection ? fmtUsd(projection.final - projection.start) : "—"}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Per-period table + bars -->
		<div class="rounded-md border bg-background">
			<div class="border-b px-4 py-3 text-sm font-medium">Per period</div>
			{#if !projection}
				<div class="p-10 text-center text-sm text-muted-foreground">Fill in all inputs to see the projection.</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
								<th class="w-16 whitespace-nowrap text-left">#</th>
								<th class="text-left whitespace-nowrap">Balance</th>
								<th class="text-left whitespace-nowrap">Gain</th>
								<th class="w-1/2 text-left">Growth</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each projection.rows as r}
								<tr class="[&>td]:px-4 [&>td]:py-2 hover:bg-muted/30">
									<td class="text-xs tabular-nums text-muted-foreground">{r.period}</td>
									<td class="tabular-nums text-xs font-medium">{fmtUsdPrecise(r.balance)}</td>
									<td class={[
										"tabular-nums text-xs",
										r.gain > 0 && "text-emerald-700 dark:text-emerald-400",
										r.gain < 0 && "text-rose-700 dark:text-rose-400",
									]}>
										{fmtUsdPrecise(r.gain)}
									</td>
									<td>
										<div class="h-2 w-full rounded-sm bg-muted">
											<div
												class={[
													"h-full rounded-sm",
													r.gain >= 0 ? "bg-emerald-700/60" : "bg-rose-700/60",
												]}
												style={`width:${maxBalance > 0 ? (r.balance / maxBalance) * 100 : 0}%;`}
											></div>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</ScrollArea>
