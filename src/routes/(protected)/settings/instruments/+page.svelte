<script lang="ts">
	import { onMount } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { PencilSimpleIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { instrumentStore, pointValue, type Instrument } from "$lib/stores/instruments.svelte";
	import { toast } from "svelte-sonner";

	const loading = $derived(instrumentStore.loading);

	let dialogOpen = $state(false);
	let editingId = $state<string | null>(null);
	let editingSymbol = $state("");
	let formCommissionPerSide = $state("0");
	let saving = $state(false);

	function openEdit(i: Instrument) {
		editingId = i.id;
		editingSymbol = i.symbol;
		formCommissionPerSide = String(i.commission_per_side ?? 0);
		dialogOpen = true;
	}

	async function submit() {
		if (!editingId) return;
		saving = true;
		try {
			await instrumentStore.updateInstrument(supabase, editingId, {
				commission_per_side: Number(formCommissionPerSide) || 0,
			});
			toast.success(`${editingSymbol} updated.`);
			dialogOpen = false;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save.");
		} finally {
			saving = false;
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
</script>

<div class="space-y-4">
	<div>
		<h2 class="text-lg font-semibold">Instruments</h2>
		<p class="text-xs text-muted-foreground">
			Shared catalog of futures contracts. Edit your <strong>commission per side</strong> to match your broker.
			Tick size and tick value are global.
		</p>
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
				<div class="text-sm font-medium">No instruments available</div>
				<div class="mt-1 text-sm text-muted-foreground">The catalog hasn't been seeded yet. Contact support.</div>
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
							<th class="whitespace-nowrap">$/point</th>
							<th class="whitespace-nowrap">Your comm./side</th>
							<th class="w-12"></th>
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
								<td class="text-xs tabular-nums">${fmtNum(pointValue(i), 2)}</td>
								<td class="text-xs tabular-nums">
									${fmtNum(i.commission_per_side ?? 0, 4)}
									{#if !i.has_override}
										<span class="text-[10px] text-muted-foreground ml-1">(default)</span>
									{/if}
								</td>
								<td class="text-right whitespace-nowrap">
									<Button
										variant="ghost"
										size="icon"
										class="h-8 w-8 cursor-pointer"
										aria-label="Edit commission"
										onclick={() => openEdit(i)}
									>
										<PencilSimpleIcon size={16} class="text-muted-foreground" />
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
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{editingSymbol} commission</Dialog.Title>
			<Dialog.Description>
				Set the per-side, per-contract commission your broker charges for {editingSymbol}.
				Round-turn cost = this value × quantity × 2.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-1.5">
			<div class="text-xs font-medium">Commission per side ($/contract)</div>
			<Input bind:value={formCommissionPerSide} inputmode="decimal" placeholder="0.91" class="rounded-md" />
			<p class="text-[11px] text-muted-foreground">
				Round-turn ≈ <span class="tabular-nums font-medium">${fmtNum((Number(formCommissionPerSide) || 0) * 2, 4)}/contract</span>.
			</p>
		</div>

		<Dialog.Footer>
			<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (dialogOpen = false)}>Cancel</Button>
			<Button class="rounded-md cursor-pointer" disabled={saving} onclick={submit}>
				{saving ? "Saving…" : "Save"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
