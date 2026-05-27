<script lang="ts">
	import { onMount } from "svelte";
	import { confirm } from "$lib/components/ui/confirm-dialog";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { PencilSimpleIcon, PlusIcon, TrashIcon, ChartLineUpIcon, ChartLineDownIcon } from "phosphor-svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { supabase } from "$lib/supabase/client";
	import { strategyStore, type Strategy } from "$lib/stores/strategies.svelte";
	import { mistakeStore, type Mistake } from "$lib/stores/mistakes.svelte";
	import { checklistStore, type ChecklistItem } from "$lib/stores/checklist.svelte";
	import { toast } from "svelte-sonner";

	type Kind = "strategy" | "mistake";
	type Item = Strategy | Mistake;

	type SlimTrade = {
		id: string;
		symbol: string | null;
		side: string | null;
		status: string | null;
		pnl: number | null;
		opened_at: string | null;
		account_id: string | null;
		strategy_ids: string[];
		mistake_ids: string[];
	};

	let allTrades = $state<SlimTrade[]>([]);
	let tradesLoading = $state(false);

	// ── Edit / create sheet ───────────────────────────────────────────────────
	let sheetOpen = $state(false);
	let kind = $state<Kind>("strategy");
	let editingId = $state<string | null>(null);
	let formName = $state("");
	let formDescription = $state("");
	let saving = $state(false);

	const isEditing = $derived(editingId != null);

	// ── Checklist ─────────────────────────────────────────────────────────────
	let checklistNewLabel = $state("");
	let checklistEditingId = $state<string | null>(null);
	let checklistEditingLabel = $state("");
	let checklistSaving = $state(false);

	async function addChecklistItem() {
		const label = checklistNewLabel.trim();
		if (!label) return;
		checklistSaving = true;
		try {
			const nextOrder = (checklistStore.items.at(-1)?.sort_order ?? 0) + 10;
			await checklistStore.createItem(supabase, { label, sort_order: nextOrder });
			checklistNewLabel = "";
			toast.success("Checklist item added.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to add item.");
		} finally {
			checklistSaving = false;
		}
	}

	function startEditChecklistItem(item: ChecklistItem) {
		checklistEditingId = item.id;
		checklistEditingLabel = item.label;
	}

	async function saveChecklistEdit() {
		if (!checklistEditingId) return;
		const label = checklistEditingLabel.trim();
		if (!label) return;
		try {
			await checklistStore.updateItem(supabase, checklistEditingId, { label });
			checklistEditingId = null;
			checklistEditingLabel = "";
			toast.success("Updated.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to update.");
		}
	}

	async function removeChecklistItem(item: ChecklistItem) {
		const ok = await confirm({
			title: `Delete "${item.label}"?`,
			description: "Any past trade ticks for this item will be removed.",
			destructive: true,
		});
		if (!ok) return;
		try {
			await checklistStore.deleteItem(supabase, item.id);
			toast.success(`"${item.label}" deleted.`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete.");
		}
	}

	// ── Trades dialog ─────────────────────────────────────────────────────────
	let dialogOpen = $state(false);
	let dialogItem = $state<Item | null>(null);
	let dialogKind = $state<Kind>("strategy");

	const dialogTrades = $derived.by(() => {
		if (!dialogItem) return [];
		return allTrades.filter((t) =>
			dialogKind === "strategy"
				? t.strategy_ids.includes(dialogItem!.id)
				: t.mistake_ids.includes(dialogItem!.id)
		);
	});

	function tradesForItem(k: Kind, item: Item): SlimTrade[] {
		return allTrades.filter((t) =>
			k === "strategy"
				? t.strategy_ids.includes(item.id)
				: t.mistake_ids.includes(item.id)
		);
	}

	function openTradesDialog(k: Kind, item: Item) {
		dialogKind = k;
		dialogItem = item;
		dialogOpen = true;
	}

	function fmtUsd(v: number | null) {
		if (v == null || !Number.isFinite(v)) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency", currency: "USD", signDisplay: "exceptZero",
		}).format(v);
	}

	function fmtDate(iso: string | null) {
		if (!iso) return "—";
		return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
	}

	// ── Edit / create ─────────────────────────────────────────────────────────
	function openCreate(k: Kind) {
		kind = k;
		editingId = null;
		formName = "";
		formDescription = "";
		sheetOpen = true;
	}

	function openEdit(k: Kind, item: Item) {
		kind = k;
		editingId = item.id;
		formName = item.name;
		formDescription = item.description ?? "";
		sheetOpen = true;
	}

	function closeSheet() {
		sheetOpen = false;
		editingId = null;
	}

	async function submit() {
		const name = formName.trim();
		if (!name) {
			toast.error("Name is required.");
			return;
		}
		saving = true;
		try {
			const description = formDescription.trim() || null;
			if (kind === "strategy") {
				if (editingId) await strategyStore.updateStrategy(supabase, editingId, { name, description });
				else await strategyStore.createStrategy(supabase, { name, description });
			} else {
				if (editingId) await mistakeStore.updateMistake(supabase, editingId, { name, description });
				else await mistakeStore.createMistake(supabase, { name, description });
			}
			closeSheet();
			toast.success(editingId ? "Updated." : "Created.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save.");
		} finally {
			saving = false;
		}
	}

	async function remove(k: Kind, item: Item) {
		const ok = await confirm({
			title: `Delete "${item.name}"?`,
			description: "This will also unlink it from any trades.",
			destructive: true,
		});
		if (!ok) return;
		try {
			if (k === "strategy") await strategyStore.deleteStrategy(supabase, item.id);
			else await mistakeStore.deleteMistake(supabase, item.id);
			toast.success(`"${item.name}" deleted.`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete.");
		}
	}

	onMount(async () => {
		void strategyStore.getStrategies(supabase);
		void mistakeStore.getMistakes(supabase);
		void checklistStore.getItems(supabase);
		tradesLoading = true;
		try {
			const res = await fetch("/api/trades/all", { credentials: "include" });
			const result = await res.json();
			if (result.success) allTrades = result.data;
		} finally {
			tradesLoading = false;
		}
	});
</script>

{#snippet tradePill(t: SlimTrade)}
	{@const pnl = t.pnl != null && Number.isFinite(t.pnl) ? t.pnl : null}
	{@const side = (t.side ?? "").toLowerCase()}
	<span class={[
		"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
		side === "long" ? "bg-emerald-700/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-700/10 text-rose-700 dark:text-rose-400",
	]}>
		{#if side === "long"}<ChartLineUpIcon size={10} />{:else}<ChartLineDownIcon size={10} />{/if}
		{t.symbol ?? "—"}
		{#if pnl != null}
			<span class={pnl >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
				{fmtUsd(pnl)}
			</span>
		{/if}
	</span>
{/snippet}

{#snippet itemList(k: Kind, items: Item[], loading: boolean, emptyTitle: string, emptyHint: string)}
	<div class="rounded-md border bg-background">
		{#if loading}
			<ul class="divide-y">
				{#each [0, 1, 2, 3] as _}
					<li class="flex items-start justify-between gap-3 px-4 py-3">
						<div class="min-w-0 flex-1 space-y-1.5">
							<Skeleton class="h-3.5 w-32" />
							<Skeleton class="h-3 w-48" />
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<Skeleton class="h-8 w-8" />
							<Skeleton class="h-8 w-8" />
						</div>
					</li>
				{/each}
			</ul>
		{:else if items.length === 0}
			<div class="p-10 text-center">
				<div class="text-sm font-medium">{emptyTitle}</div>
				<div class="mt-1 text-sm text-muted-foreground">{emptyHint}</div>
			</div>
		{:else}
			<ul class="divide-y">
				{#each items as item (item.id)}
					{@const trades = tradesForItem(k, item)}
					{@const preview = trades.slice(0, 3)}
					<li class="px-4 py-3 space-y-2">
						<div class="flex items-start justify-between gap-3">
							<button
								type="button"
								class="min-w-0 text-left cursor-pointer group"
								onclick={() => openTradesDialog(k, item)}
							>
								<div class="text-sm font-medium group-hover:text-primary transition-colors">{item.name}</div>
								{#if item.description}
									<div class="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
								{/if}
							</button>
							<div class="flex shrink-0 items-center gap-1">
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8 cursor-pointer"
									onclick={() => openEdit(k, item)}
									aria-label="Edit"
								>
									<PencilSimpleIcon size={16} class="text-muted-foreground" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
									onclick={() => remove(k, item)}
									aria-label="Delete"
								>
									<TrashIcon size={16} />
								</Button>
							</div>
						</div>

						<!-- Trade previews -->
						{#if tradesLoading}
							<div class="flex gap-1.5">
								{#each [0,1,2] as _}<Skeleton class="h-5 w-20 rounded-md" />{/each}
							</div>
						{:else if trades.length === 0}
							<p class="text-[11px] text-muted-foreground">No trades tagged yet.</p>
						{:else}
							<div class="flex flex-wrap items-center gap-1.5">
								{#each preview as t (t.id)}
									{@render tradePill(t)}
								{/each}
								{#if trades.length > 3}
									<button
										type="button"
										class="text-[11px] text-primary hover:underline cursor-pointer"
										onclick={() => openTradesDialog(k, item)}
									>
										+{trades.length - 3} more
									</button>
								{:else}
									<button
										type="button"
										class="text-[11px] text-muted-foreground hover:text-primary cursor-pointer"
										onclick={() => openTradesDialog(k, item)}
									>
										View all
									</button>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Page>Strategies & Mistakes</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">The Playbook is where you define your trading strategies and track recurring mistakes.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Create strategies to tag trades and measure their individual performance.</li>
			<li>Log mistakes to identify patterns in your trading behaviour over time.</li>
			<li>Each strategy and mistake shows a trade count and recent trade preview.</li>
			<li>Edit or delete entries using the menu on each card.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-8xl space-y-6 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Strategies & Mistakes</h1>
			<p class="text-sm text-muted-foreground">
				Tag setups you trade and execution errors you want to track.
			</p>
		</div>

		<div class="flex flex-col gap-6">
			<section class="space-y-3">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold">Strategies</h2>
						<p class="text-xs text-muted-foreground">Tag any trade with the setup used.</p>
					</div>
					<Button
						onclick={() => openCreate("strategy")}
						size="sm"
						class="cursor-pointer rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
					>
						<PlusIcon size={14} /> New
					</Button>
				</div>
				{@render itemList("strategy", strategyStore.strategies, strategyStore.loading, "No strategies yet", "Create one to start tagging trades.")}
			</section>

			<section class="space-y-3">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold">Mistakes</h2>
						<p class="text-xs text-muted-foreground">Reviewed only on closed trades.</p>
					</div>
					<Button
						onclick={() => openCreate("mistake")}
						size="sm"
						class="cursor-pointer rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
					>
						<PlusIcon size={14} /> New
					</Button>
				</div>
				{@render itemList("mistake", mistakeStore.mistakes, mistakeStore.loading, "No mistakes catalogued", "Add common errors you want to track (e.g. \"Moved stop\").")}
			</section>

			<section class="space-y-3">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold">Pre-trade checklist</h2>
						<p class="text-xs text-muted-foreground">Rules you tick off before saving any entry.</p>
					</div>
				</div>

				<div class="rounded-md border bg-background">
					<div class="flex items-center gap-2 border-b p-3">
						<Input
							bind:value={checklistNewLabel}
							placeholder='e.g. "In session window", "Risk ≤ 1%", "Not revenge trading"'
							class="rounded-md"
							onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addChecklistItem(); } }}
						/>
						<Button
							size="sm"
							class="cursor-pointer rounded-md"
							disabled={checklistSaving || !checklistNewLabel.trim()}
							onclick={addChecklistItem}
						>
							<PlusIcon size={14} /> Add
						</Button>
					</div>
					{#if checklistStore.loading}
						<ul class="divide-y">
							{#each [0, 1, 2] as _}
								<li class="px-4 py-3"><Skeleton class="h-4 w-48" /></li>
							{/each}
						</ul>
					{:else if checklistStore.items.length === 0}
						<div class="p-8 text-center">
							<div class="text-sm font-medium">No checklist items yet</div>
							<div class="mt-1 text-sm text-muted-foreground">Add the rules you want to confirm before every trade.</div>
						</div>
					{:else}
						<ul class="divide-y">
							{#each checklistStore.items as item (item.id)}
								<li class="flex items-center justify-between gap-3 px-4 py-2.5">
									{#if checklistEditingId === item.id}
										<Input
											bind:value={checklistEditingLabel}
											class="rounded-md"
											onkeydown={(e) => {
												if (e.key === "Enter") { e.preventDefault(); void saveChecklistEdit(); }
												if (e.key === "Escape") { checklistEditingId = null; }
											}}
										/>
										<div class="flex shrink-0 items-center gap-1">
											<Button size="sm" class="cursor-pointer rounded-md" onclick={saveChecklistEdit}>Save</Button>
											<Button size="sm" variant="ghost" class="cursor-pointer rounded-md" onclick={() => (checklistEditingId = null)}>Cancel</Button>
										</div>
									{:else}
										<div class="min-w-0 flex-1 text-sm">{item.label}</div>
										<div class="flex shrink-0 items-center gap-1">
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 cursor-pointer"
												onclick={() => startEditChecklistItem(item)}
												aria-label="Edit"
											>
												<PencilSimpleIcon size={16} class="text-muted-foreground" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
												onclick={() => removeChecklistItem(item)}
												aria-label="Delete"
											>
												<TrashIcon size={16} />
											</Button>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>
		</div>
	</div>
</ScrollArea>

<!-- Trades dialog -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-lg max-h-[80vh] flex flex-col">
		<Dialog.Header>
			<Dialog.Title>{dialogItem?.name}</Dialog.Title>
			<Dialog.Description>
				{dialogTrades.length} trade{dialogTrades.length === 1 ? "" : "s"} tagged with this {dialogKind}.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex-1 overflow-y-auto">
			{#if dialogTrades.length === 0}
				<div class="py-10 text-center text-sm text-muted-foreground">No trades tagged yet.</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:font-medium [&>th]:text-left [&>th]:whitespace-nowrap">
								<th>Symbol</th>
								<th>Side</th>
								<th>Status</th>
								<th>P&L</th>
								<th>Date</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each dialogTrades as t (t.id)}
								{@const pnl = t.pnl != null && Number.isFinite(t.pnl) ? t.pnl : null}
								{@const side = (t.side ?? "").toLowerCase()}
								<tr class="[&>td]:px-4 [&>td]:py-2.5 hover:bg-muted/30">
									<td class="font-medium text-xs">{t.symbol ?? "—"}</td>
									<td>
										<span class={[
											"inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize",
											side === "long" ? "bg-emerald-700/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-700/10 text-rose-700 dark:text-rose-400",
										]}>
											{#if side === "long"}<ChartLineUpIcon size={10} />{:else}<ChartLineDownIcon size={10} />{/if}
											{t.side ?? "—"}
										</span>
									</td>
									<td>
										<span class={[
											"inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize",
											t.status === "open" ? "bg-amber-700/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground",
										]}>
											{t.status ?? "—"}
										</span>
									</td>
									<td class={[
										"text-xs font-medium tabular-nums",
										pnl != null && pnl > 0 && "text-emerald-700 dark:text-emerald-400",
										pnl != null && pnl < 0 && "text-rose-700 dark:text-rose-400",
										(pnl == null || pnl === 0) && "text-muted-foreground",
									]}>
										{t.status === "open" ? "—" : fmtUsd(pnl)}
									</td>
									<td class="text-xs text-muted-foreground tabular-nums">{fmtDate(t.opened_at)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit / create sheet -->
<Sheet.Root bind:open={sheetOpen} onOpenChange={(o: boolean) => { if (!o) closeSheet(); }}>
	<Sheet.Content side="right" class="w-[min(100vw,560px)] sm:max-w-[560px]">
		<Sheet.Header>
			<Sheet.Title>
				{isEditing ? "Edit" : "New"}
				{kind === "strategy" ? "strategy" : "mistake"}
			</Sheet.Title>
			<Sheet.Description>
				{kind === "strategy"
					? "A setup or pattern you trade."
					: "An execution error you want to flag on closed trades."}
			</Sheet.Description>
		</Sheet.Header>

		<div class="flex-1 overflow-y-auto space-y-4 px-4 pb-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Name</div>
				<Input
					bind:value={formName}
					placeholder={kind === "strategy" ? "e.g. ORB, Liquidity sweep" : "e.g. Moved stop, Chased entry"}
					class="rounded-md"
				/>
			</div>
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Description</div>
				<textarea
					bind:value={formDescription}
					rows="3"
					placeholder="Optional"
					class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1"
				></textarea>
			</div>
		</div>

		<Sheet.Footer class="border-t">
			<div class="flex justify-end gap-2">
				<Button variant="outline" class="rounded-md cursor-pointer" onclick={closeSheet}>Cancel</Button>
				<Button
					class="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground cursor-pointer"
					disabled={saving || !formName.trim()}
					onclick={submit}
				>
					{saving ? "Saving…" : isEditing ? "Save changes" : "Create"}
				</Button>
			</div>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
