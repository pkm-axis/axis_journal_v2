<script lang="ts">
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Input } from "$lib/components/ui/input";
	import { ChartLineDownIcon, ChartLineUpIcon } from "phosphor-svelte";
	import { instrumentStore, pointValue, instrumentPnl } from "$lib/stores/instruments.svelte";

	let accountSize = $state("10000");
	let riskPercent = $state("1");
	let symbol = $state("");
	let side = $state<"long" | "short">("long");
	let entryPrice = $state("");
	let stopLoss = $state("");
	let takeProfit = $state("");

	function num(v: unknown): number | null {
		if (v == null || v === "") return null;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : null;
	}

	const selectedInstrument = $derived(
		instrumentStore.instruments?.find((i) => i.symbol === symbol)
	);

	$effect(() => {
		const first = instrumentStore.instruments?.[0];
		if (first && !symbol) symbol = first.symbol;
	});

	const dollarRisk = $derived.by(() => {
		const acct = num(accountSize);
		const pct = num(riskPercent);
		if (acct == null || pct == null) return null;
		return acct * (pct / 100);
	});

	const stopDistance = $derived.by(() => {
		const e = num(entryPrice);
		const s = num(stopLoss);
		if (e == null || s == null) return null;
		return side === "long" ? e - s : s - e;
	});

	const stopDistanceValid = $derived(stopDistance != null && stopDistance > 0);

	/** Position size in contracts / units to risk exactly `dollarRisk`. */
	const positionSize = $derived.by(() => {
		if (dollarRisk == null || !stopDistanceValid || !selectedInstrument) return null;
		const pv = pointValue(selectedInstrument);
		if (!Number.isFinite(pv) || pv <= 0) return null;
		const qty = dollarRisk! / (stopDistance! * pv);
		return qty;
	});

	/** Snap to integer for futures-style instruments where contracts can't be fractional. */
	const positionSizeWhole = $derived(positionSize != null ? Math.floor(positionSize) : null);

	const realizedRisk = $derived.by(() => {
		if (positionSizeWhole == null || !stopDistanceValid || !selectedInstrument) return null;
		const pv = pointValue(selectedInstrument);
		return positionSizeWhole * stopDistance! * pv;
	});

	const tickValue = $derived(selectedInstrument?.tick_value ?? null);
	const ptValue = $derived(selectedInstrument ? pointValue(selectedInstrument) : null);

	const rrRatio = $derived.by(() => {
		const e = num(entryPrice);
		const s = num(stopLoss);
		const tp = num(takeProfit);
		if (e == null || s == null || tp == null) return null;
		const riskDist = side === "long" ? e - s : s - e;
		const rewardDist = side === "long" ? tp - e : e - tp;
		if (riskDist <= 0 || rewardDist <= 0) return null;
		return rewardDist / riskDist;
	});

	const reward = $derived.by(() => {
		if (positionSizeWhole == null || !selectedInstrument) return null;
		const e = num(entryPrice);
		const tp = num(takeProfit);
		if (e == null || tp == null) return null;
		return instrumentPnl(selectedInstrument, side, e, tp, positionSizeWhole);
	});

	function fmtUsd(v: number | null, sign = false) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD",
			signDisplay: sign ? "exceptZero" : "auto",
			maximumFractionDigits: 2,
		}).format(v);
	}

	function fmtNum(v: number | null, digits = 4) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(v);
	}

	function fmtRR(rr: number | null) {
		if (rr == null || !Number.isFinite(rr)) return "—";
		return `1:${rr.toFixed(2)}`;
	}
</script>

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Tools</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Risk Calculator</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">The Risk Calculator helps you size positions correctly so you never risk more than intended on a single trade.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Enter your account size and risk percentage, then select your instrument and trade side.</li>
			<li>The calculator uses the instrument's tick size and value to work out the correct position size.</li>
			<li>The result shows you how many contracts to trade for your given risk amount.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-4 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Risk Calculator</h1>
			<p class="text-sm text-muted-foreground">
				Plan your position size from account size, risk %, entry, and stop. Tick value and contract size come from the selected instrument.
			</p>
		</div>

		<div class="grid gap-4 lg:grid-cols-[1fr_1fr]">
			<!-- Inputs -->
			<div class="rounded-md border bg-background p-4 space-y-4">
				<div class="text-sm font-medium">Inputs</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Account size ($)</div>
						<Input bind:value={accountSize} inputmode="decimal" placeholder="10000" class="rounded-md" />
					</div>
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Risk per trade (%)</div>
						<Input bind:value={riskPercent} inputmode="decimal" placeholder="1" class="rounded-md" />
					</div>
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Instrument</div>
					<Select.Root type="single" bind:value={symbol}>
						<Select.Trigger class="w-full rounded-md cursor-pointer">
							<span>{symbol || "Select instrument"}</span>
						</Select.Trigger>
						<Select.Content class="rounded-md">
							{#each instrumentStore.instruments as instrument}
								<Select.Item value={instrument.symbol} class="cursor-pointer">
									{instrument.symbol}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					{#if selectedInstrument}
						<p class="text-[11px] text-muted-foreground">
							Tick {fmtNum(selectedInstrument.tick_size, 6)} · ${fmtNum(selectedInstrument.tick_value, 4)}/tick · ${fmtNum(ptValue, 2)}/point
						</p>
					{/if}
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Side</div>
					<Select.Root type="single" bind:value={side}>
						<Select.Trigger class="w-full rounded-md cursor-pointer">
							<span class="capitalize">{side}</span>
						</Select.Trigger>
						<Select.Content class="rounded-md">
							<Select.Item value="long" class="cursor-pointer">
								<ChartLineUpIcon class="mr-2 h-4 w-4" /> Long
							</Select.Item>
							<Select.Item value="short" class="cursor-pointer">
								<ChartLineDownIcon class="mr-2 h-4 w-4" /> Short
							</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Entry price</div>
						<Input bind:value={entryPrice} inputmode="decimal" placeholder="Required" class="rounded-md" />
					</div>
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Stop loss</div>
						<Input bind:value={stopLoss} inputmode="decimal" placeholder="Required" class="rounded-md" />
					</div>
				</div>

				<div class="space-y-1.5">
					<div class="text-xs font-medium">Take profit (optional)</div>
					<Input bind:value={takeProfit} inputmode="decimal" placeholder="For R:R + reward" class="rounded-md" />
				</div>
			</div>

			<!-- Outputs -->
			<div class="rounded-md border bg-muted/20 p-4 space-y-4">
				<div class="text-sm font-medium">Results</div>

				<div>
					<div class="text-xs text-muted-foreground">Position size</div>
					<div class="mt-1 text-3xl font-bold tabular-nums">
						{positionSizeWhole == null ? "—" : positionSizeWhole}
						<span class="ml-1 text-sm font-medium text-muted-foreground">contracts</span>
					</div>
					{#if positionSize != null && positionSizeWhole != null && positionSize !== positionSizeWhole}
						<p class="mt-1 text-[11px] text-muted-foreground">
							Exact: {fmtNum(positionSize, 4)} — rounded down for whole contracts.
						</p>
					{/if}
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<div class="text-xs text-muted-foreground">Dollar risk (target)</div>
						<div class="mt-1 text-lg font-semibold tabular-nums">{fmtUsd(dollarRisk)}</div>
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Realized risk</div>
						<div class="mt-1 text-lg font-semibold tabular-nums text-rose-700 dark:text-rose-400">
							{fmtUsd(realizedRisk)}
						</div>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<div class="text-xs text-muted-foreground">Stop distance</div>
						<div class="mt-1 text-lg font-semibold tabular-nums">
							{stopDistance == null ? "—" : fmtNum(Math.abs(stopDistance), 6)}
						</div>
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Risk / Reward</div>
						<div class="mt-1 text-lg font-semibold tabular-nums">{fmtRR(rrRatio)}</div>
					</div>
				</div>

				{#if reward != null}
					<div>
						<div class="text-xs text-muted-foreground">Reward at target</div>
						<div class="mt-1 text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
							{fmtUsd(reward, true)}
						</div>
					</div>
				{/if}

				{#if !selectedInstrument}
					<div class="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
						Pick an instrument to compute position size.
					</div>
				{:else if entryPrice && stopLoss && !stopDistanceValid}
					<div class="rounded-md border border-rose-700/30 bg-rose-700/5 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-400">
						{side === "long"
							? "For a long, stop must be below entry."
							: "For a short, stop must be above entry."}
					</div>
				{:else if positionSizeWhole === 0 && positionSize != null && positionSize > 0}
					<div class="rounded-md border border-amber-700/30 bg-amber-700/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
						Stop is too wide for this risk budget — even 1 contract would exceed your risk %.
					</div>
				{/if}
			</div>
		</div>
	</div>
</ScrollArea>
