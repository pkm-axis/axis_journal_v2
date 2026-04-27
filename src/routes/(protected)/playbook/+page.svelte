<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { PencilSimpleIcon, PlusIcon, TrashIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { strategyStore, type Strategy } from "$lib/stores/strategies.svelte";
	import { mistakeStore, type Mistake } from "$lib/stores/mistakes.svelte";

	type Kind = "strategy" | "mistake";
	type Item = Strategy | Mistake;

	let sheetOpen = $state(false);
	let kind = $state<Kind>("strategy");
	let editingId = $state<string | null>(null);
	let formName = $state("");
	let formDescription = $state("");
	let saving = $state(false);
	let error = $state<string | null>(null);

	const isEditing = $derived(editingId != null);

	function openCreate(k: Kind) {
		kind = k;
		editingId = null;
		formName = "";
		formDescription = "";
		error = null;
		sheetOpen = true;
	}

	function openEdit(k: Kind, item: Item) {
		kind = k;
		editingId = item.id;
		formName = item.name;
		formDescription = item.description ?? "";
		error = null;
		sheetOpen = true;
	}

	function closeSheet() {
		sheetOpen = false;
		editingId = null;
		error = null;
	}

	async function submit() {
		const name = formName.trim();
		if (!name) {
			error = "Name is required.";
			return;
		}
		saving = true;
		error = null;
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
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to save.";
		} finally {
			saving = false;
		}
	}

	async function remove(k: Kind, item: Item) {
		if (!confirm(`Delete "${item.name}"? This will also unlink it from any trades.`)) return;
		try {
			if (k === "strategy") await strategyStore.deleteStrategy(supabase, item.id);
			else await mistakeStore.deleteMistake(supabase, item.id);
		} catch (e) {
			alert(e instanceof Error ? e.message : "Failed to delete.");
		}
	}

	onMount(() => {
		void strategyStore.getStrategies(supabase);
		void mistakeStore.getMistakes(supabase);
	});
</script>

{#snippet itemList(
	k: Kind,
	items: Item[],
	loading: boolean,
	emptyTitle: string,
	emptyHint: string
)}
	<div class="rounded-md border bg-background">
		{#if loading}
			<div class="p-10 text-center text-sm text-muted-foreground">Loading…</div>
		{:else if items.length === 0}
			<div class="p-10 text-center">
				<div class="text-sm font-medium">{emptyTitle}</div>
				<div class="mt-1 text-sm text-muted-foreground">{emptyHint}</div>
			</div>
		{:else}
			<ul class="divide-y">
				{#each items as item (item.id)}
					<li class="flex items-start justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<div class="text-sm font-medium">{item.name}</div>
							{#if item.description}
								<div class="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
							{/if}
						</div>
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
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Page>Strategies & Mistakes</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>
<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Strategies & Mistakes</h1>
			<p class="text-sm text-muted-foreground">
				Tag setups you trade and execution errors you want to track.
			</p>
		</div>

		<div class="grid gap-6 lg:grid-cols-2">
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
						<PlusIcon size={14} />
						New
					</Button>
				</div>
				{@render itemList(
					"strategy",
					strategyStore.strategies,
					strategyStore.loading,
					"No strategies yet",
					"Create one to start tagging trades."
				)}
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
						<PlusIcon size={14} />
						New
					</Button>
				</div>
				{@render itemList(
					"mistake",
					mistakeStore.mistakes,
					mistakeStore.loading,
					"No mistakes catalogued",
					"Add common errors you want to track (e.g. \"Moved stop\")."
				)}
			</section>
		</div>

		<Sheet.Root
			bind:open={sheetOpen}
			onOpenChange={(o: boolean) => {
				if (!o) closeSheet();
			}}
		>
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

				{#if error}
					<div class="mx-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						{error}
					</div>
				{/if}

				<div class="flex-1 overflow-y-auto space-y-4 px-4 pb-4">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Name</div>
						<Input
							bind:value={formName}
							placeholder={kind === "strategy"
								? "e.g. ORB, Liquidity sweep"
								: "e.g. Moved stop, Chased entry"}
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
						<Button variant="outline" class="rounded-md cursor-pointer" onclick={closeSheet}>
							Cancel
						</Button>
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
	</div>
</ScrollArea>
