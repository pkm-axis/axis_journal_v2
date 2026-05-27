<script lang="ts">
	import { onMount } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { PencilSimpleIcon, PlusIcon, TrashIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { instrumentStore, pointValue, type Instrument } from "$lib/stores/instruments.svelte";
	import { confirm } from "$lib/components/ui/confirm-dialog";
	import { toast } from "svelte-sonner";

	const MARKET_TYPES = ["futures", "forex", "stocks", "crypto", "options", "other"];
	const loading = $derived(instrumentStore.loading);

	let dialogOpen = $state(false);
	let editingId = $state<string | null>(null);
	let formSymbol = $state("");
	let formExchange = $state("");
	let formMarketType = $state("futures");
	let formContractSize = $state("1");
	let formTickSize = $state("0.25");
	let formTickValue = $state("12.5");
	let formBaseCurrency = $state("USD");
	let formQuoteCurrency = $state("USD");
	let formCommissionPerSide = $state("0");
	let saving = $state(false);

	function reset() {
		formSymbol = "";
		formExchange = "";
		formMarketType = "futures";
		formContractSize = "1";
		formTickSize = "0.25";
		formTickValue = "12.5";
		formBaseCurrency = "USD";
		formQuoteCurrency = "USD";
		formCommissionPerSide = "0";
	}

	function openCreate() {
		editingId = null;
		reset();
		dialogOpen = true;
	}

	function openEdit(i: Instrument) {
		editingId = i.id;
		formSymbol = i.symbol;
		formExchange = i.exchange ?? "";
		formMarketType = i.market_type ?? "futures";
		formContractSize = String(i.contract_size ?? 1);
		formTickSize = String(i.tick_size ?? 0);
		formTickValue = String(i.tick_value ?? 0);
		formBaseCurrency = i.base_currency ?? "USD";
		formQuoteCurrency = i.quote_currency ?? "USD";
		formCommissionPerSide = String(i.commission_per_side ?? 0);

		dialogOpen = true;
	}

	async function submit() {
		if (!formSymbol.trim()) {
			toast.error("Symbol is required.");
			return;
		}
		saving = true;
		try {
			const payload = {
				symbol: formSymbol.trim().toUpperCase(),
				exchange: formExchange.trim(),
				market_type: formMarketType,
				base_currency: formBaseCurrency.trim().toUpperCase(),
				quote_currency: formQuoteCurrency.trim().toUpperCase(),
				contract_size: Number(formContractSize),
				tick_size: Number(formTickSize),
				tick_value: Number(formTickValue),
				commission_per_side: Number(formCommissionPerSide) || 0,
			};
			if (editingId) {
				await instrumentStore.updateInstrument(supabase, editingId, payload);
				toast.success("Instrument updated.");
			} else {
				await instrumentStore.createInstrument(supabase, payload);
				toast.success("Instrument created.");
			}
			dialogOpen = false;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save.");
		} finally {
			saving = false;
		}
	}

	async function remove(i: Instrument) {
		const ok = await confirm({
			title: `Delete "${i.symbol}"?`,
			description: "This cannot be undone.",
			destructive: true,
		});
		if (!ok) return;
		try {
			await instrumentStore.deleteInstrument(supabase, i.id);
			toast.success(`${i.symbol} deleted.`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete.");
		}
	}

	function fmtNum(v: number, digits = 4) {
		if (!Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(v);
	}

	onMount(() => {
		if (instrumentStore.instruments.length === 0) {
			void instrumentStore.getInstruments(supabase);
		}
	});

	const previewPv = $derived.by(() => {
		const ts = Number(formTickSize);
		const tv = Number(formTickValue);
		const cs = Number(formContractSize);
		if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(tv) || !Number.isFinite(cs)) return null;
		return (tv / ts) * (cs || 1);
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Instruments</h2>
			<p class="text-xs text-muted-foreground">Symbols and tick values used for P&L calculations.</p>
		</div>
		<Button onclick={openCreate} class="rounded-md cursor-pointer">
			<PlusIcon size={14} /> New instrument
		</Button>
	</div>

	<div class="rounded-md border bg-background">
		{#if loading && instrumentStore.instruments.length === 0}
			<div class="divide-y">
				{#each [0, 1, 2] as _}
					<div class="flex items-center gap-4 px-4 py-3">
						<Skeleton class="h-3.5 w-16" />
						<Skeleton class="h-3.5 w-12" />
						<Skeleton class="h-3.5 w-20" />
						<Skeleton class="ml-auto h-8 w-16" />
					</div>
				{/each}
			</div>
		{:else if instrumentStore.instruments.length === 0}
			<div class="p-10 text-center">
				<div class="text-sm font-medium">No instruments yet</div>
				<div class="mt-1 text-sm text-muted-foreground">Add the symbols you trade with their tick value & size.</div>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="bg-muted/30 text-muted-foreground">
						<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
							<th class="whitespace-nowrap">Symbol</th>
							<th class="whitespace-nowrap">Exchange</th>
							<th class="whitespace-nowrap">Type</th>
							<th class="whitespace-nowrap">Tick size</th>
							<th class="whitespace-nowrap">Tick value</th>
							<th class="whitespace-nowrap">Contract</th>
							<th class="whitespace-nowrap">$/point</th>
							<th class="whitespace-nowrap">Comm./side</th>
							<th class="w-20"></th>
						</tr>
					</thead>
					<tbody class="[&>tr:not(:last-child)]:border-b">
						{#each instrumentStore.instruments as i (i.id)}
							<tr class="[&>td]:px-4 [&>td]:py-2 hover:bg-muted/30">
								<td class="text-xs font-medium">{i.symbol}</td>
								<td class="text-xs text-muted-foreground">{i.exchange || "—"}</td>
								<td class="text-xs text-muted-foreground capitalize">{i.market_type}</td>
								<td class="text-xs tabular-nums">{fmtNum(i.tick_size, 6)}</td>
								<td class="text-xs tabular-nums">${fmtNum(i.tick_value, 4)}</td>
								<td class="text-xs tabular-nums">{fmtNum(i.contract_size, 4)}</td>
								<td class="text-xs tabular-nums">${fmtNum(pointValue(i), 2)}</td>
								<td class="text-xs tabular-nums">${fmtNum(i.commission_per_side ?? 0, 4)}</td>
								<td class="text-right whitespace-nowrap">
									<Button variant="ghost" size="icon" class="h-8 w-8 cursor-pointer" aria-label="Edit" onclick={() => openEdit(i)}>
										<PencilSimpleIcon size={16} class="text-muted-foreground" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="h-8 w-8 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
										aria-label="Delete"
										onclick={() => remove(i)}
									>
										<TrashIcon size={16} />
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editingId ? "Edit instrument" : "New instrument"}</Dialog.Title>
			<Dialog.Description>Tick size × tick value drives all P&L math for this symbol.</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Symbol</div>
					<Input bind:value={formSymbol} placeholder="ES, NQ, BTCUSDT" class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Exchange</div>
					<Input bind:value={formExchange} placeholder="CME, NYSE" class="rounded-md" />
				</div>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Type</div>
				<Select.Root type="single" bind:value={formMarketType}>
					<Select.Trigger class="w-full rounded-md cursor-pointer">
						<span class="capitalize">{formMarketType}</span>
					</Select.Trigger>
					<Select.Content class="rounded-md">
						{#each MARKET_TYPES as t}
							<Select.Item value={t} class="cursor-pointer capitalize">{t}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<div class="grid grid-cols-3 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Tick size</div>
					<Input bind:value={formTickSize} inputmode="decimal" placeholder="0.25" class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Tick value ($)</div>
					<Input bind:value={formTickValue} inputmode="decimal" placeholder="12.5" class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Contract size</div>
					<Input bind:value={formContractSize} inputmode="decimal" placeholder="1" class="rounded-md" />
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Base currency</div>
					<Input bind:value={formBaseCurrency} placeholder="USD" class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Quote currency</div>
					<Input bind:value={formQuoteCurrency} placeholder="USD" class="rounded-md" />
				</div>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Commission per side ($/contract)</div>
				<Input bind:value={formCommissionPerSide} inputmode="decimal" placeholder="0.91" class="rounded-md" />
				<p class="text-[11px] text-muted-foreground">
					Charged on entry and on exit. E.g. MNQ/MES $0.91, MGC $1.06. Round-turn =
					<span class="tabular-nums font-medium">${fmtNum((Number(formCommissionPerSide) || 0) * 2, 4)}/contract</span>.
				</p>
			</div>

			<div class="rounded-md border bg-muted/30 px-3 py-2 text-xs">
				<div class="text-muted-foreground">$/point preview</div>
				<div class="mt-0.5 font-medium tabular-nums">
					{previewPv == null ? "—" : `$${fmtNum(previewPv, 4)}/point per contract`}
				</div>
			</div>

		</div>

		<Dialog.Footer>
			<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (dialogOpen = false)}>Cancel</Button>
			<Button class="rounded-md cursor-pointer" disabled={saving} onclick={submit}>
				{saving ? "Saving…" : editingId ? "Save changes" : "Create"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
