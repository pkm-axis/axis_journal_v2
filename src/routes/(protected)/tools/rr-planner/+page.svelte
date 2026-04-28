<script lang="ts">
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Input } from "$lib/components/ui/input";

	let winRate = $state("50");
	let rrRatio = $state("2"); // reward per 1 risk

	function num(v: unknown): number | null {
		if (v == null || v === "") return null;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : null;
	}

	const wr = $derived.by(() => {
		const v = num(winRate);
		if (v == null) return null;
		return Math.max(0, Math.min(100, v)) / 100;
	});

	const rr = $derived.by(() => {
		const v = num(rrRatio);
		if (v == null || v <= 0) return null;
		return v;
	});

	/** Expectancy in R-multiples per trade. */
	const expectancyR = $derived.by(() => {
		if (wr == null || rr == null) return null;
		return wr * rr - (1 - wr);
	});

	/** Minimum R:R needed to break even at the current win rate. */
	const minRrForBreakeven = $derived.by(() => {
		if (wr == null || wr <= 0 || wr >= 1) return null;
		return (1 - wr) / wr;
	});

	/** Minimum win rate needed to break even at the current R:R. */
	const minWrForBreakeven = $derived.by(() => {
		if (rr == null) return null;
		return 1 / (1 + rr);
	});

	const TABLE_WIN_RATES = [20, 30, 40, 50, 60, 70, 80];
	const TABLE_RRS = [0.5, 1, 1.5, 2, 3, 4, 5];

	function expectancyAt(p: number, r: number) {
		return p * r - (1 - p);
	}

	function fmtR(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return `${v.toFixed(2)}R`;
	}

	function fmtRR(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return `1:${v.toFixed(2)}`;
	}

	function fmtPct(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return `${(v * 100).toFixed(1)}%`;
	}
</script>

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Tools</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Risk-to-Reward Planner</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-4 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Risk-to-Reward Planner</h1>
			<p class="text-sm text-muted-foreground">
				Find the win-rate / R:R combinations that produce a positive edge.
			</p>
		</div>

		<div class="grid gap-4 lg:grid-cols-[1fr_1fr]">
			<!-- Inputs -->
			<div class="rounded-md border bg-background p-4 space-y-4">
				<div class="text-sm font-medium">Inputs</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Win rate (%)</div>
					<Input bind:value={winRate} inputmode="decimal" placeholder="50" class="rounded-md" />
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Risk:Reward (reward per 1 risk)</div>
					<Input bind:value={rrRatio} inputmode="decimal" placeholder="2" class="rounded-md" />
					<p class="text-[11px] text-muted-foreground leading-snug">
						2 means a typical winner makes 2× what a typical loser loses (1:2).
					</p>
				</div>
			</div>

			<!-- Outputs -->
			<div class="rounded-md border bg-muted/20 p-4 space-y-4">
				<div class="text-sm font-medium">Edge</div>

				<div>
					<div class="text-xs text-muted-foreground">Expectancy / trade</div>
					<div class={[
						"mt-1 text-3xl font-bold tabular-nums",
						expectancyR != null && expectancyR > 0 && "text-emerald-700 dark:text-emerald-400",
						expectancyR != null && expectancyR < 0 && "text-rose-700 dark:text-rose-400",
					]}>
						{fmtR(expectancyR)}
					</div>
					<p class="mt-1 text-[11px] text-muted-foreground">
						Per trade, in units of risk (1R = whatever you risk per trade).
					</p>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<div class="text-xs text-muted-foreground">Min R:R for break-even</div>
						<div class="mt-1 text-lg font-semibold tabular-nums">
							{fmtRR(minRrForBreakeven)}
						</div>
						<p class="mt-1 text-[11px] text-muted-foreground">at {fmtPct(wr)} win rate</p>
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Min win rate for break-even</div>
						<div class="mt-1 text-lg font-semibold tabular-nums">{fmtPct(minWrForBreakeven)}</div>
						<p class="mt-1 text-[11px] text-muted-foreground">at {fmtRR(rr)}</p>
					</div>
				</div>

				{#if expectancyR != null && expectancyR > 0}
					<div class="rounded-md border border-emerald-700/30 bg-emerald-700/5 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
						Positive edge — this combination makes money over many trades.
					</div>
				{:else if expectancyR != null && expectancyR < 0}
					<div class="rounded-md border border-rose-700/30 bg-rose-700/5 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-400">
						Negative edge — you'd need a higher win rate or wider R:R.
					</div>
				{:else if expectancyR === 0}
					<div class="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
						Break-even — no edge, no losses (before fees).
					</div>
				{/if}
			</div>
		</div>

		<!-- Edge matrix -->
		<div class="rounded-md border bg-background">
			<div class="border-b px-4 py-3">
				<div class="text-sm font-medium">Edge matrix</div>
				<p class="text-xs text-muted-foreground">Expectancy in R for each (win rate × R:R) combo. Green = profitable.</p>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="bg-muted/30 text-muted-foreground">
						<tr class="[&>th]:px-3 [&>th]:py-2 [&>th]:text-center [&>th]:font-medium">
							<th class="text-left whitespace-nowrap">Win rate ↓ &nbsp; R:R →</th>
							{#each TABLE_RRS as r}
								<th class="whitespace-nowrap">1:{r}</th>
							{/each}
						</tr>
					</thead>
					<tbody class="[&>tr:not(:last-child)]:border-b">
						{#each TABLE_WIN_RATES as p}
							<tr class="[&>td]:px-3 [&>td]:py-2 [&>td]:text-center">
								<td class="text-left text-xs font-medium tabular-nums">{p}%</td>
								{#each TABLE_RRS as r}
									{@const ev = expectancyAt(p / 100, r)}
									<td class={[
										"text-xs tabular-nums",
										ev > 0 && "bg-emerald-700/10 text-emerald-700 dark:text-emerald-400 font-medium",
										ev < 0 && "bg-rose-700/10 text-rose-700 dark:text-rose-400",
										ev === 0 && "text-muted-foreground",
									]}>
										{ev > 0 ? "+" : ""}{ev.toFixed(2)}R
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>
</ScrollArea>
