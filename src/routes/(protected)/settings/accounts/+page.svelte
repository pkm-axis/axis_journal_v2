<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { PencilSimpleIcon, PlusIcon, TrashIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { accountStore, type Account } from "$lib/stores/accounts.svelte";

	const ACCOUNT_TYPES = ["live", "demo", "prop", "paper"];
	const loading = $derived(accountStore.loading);

	let dialogOpen = $state(false);
	let editingId = $state<string | null>(null);
	let formName = $state("");
	let formType = $state<string>("live");
	let saving = $state(false);
	let error = $state<string | null>(null);

	function openCreate() {
		editingId = null;
		formName = "";
		formType = "live";
		error = null;
		dialogOpen = true;
	}

	function openEdit(a: Account) {
		editingId = a.id;
		formName = a.name;
		formType = a.account_type ?? "live";
		error = null;
		dialogOpen = true;
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
			if (editingId) {
				await accountStore.updateAccount(supabase, editingId, { name, account_type: formType });
			} else {
				await accountStore.createAccount(supabase, { name, account_type: formType });
			}
			dialogOpen = false;
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to save.";
		} finally {
			saving = false;
		}
	}

	async function remove(a: Account) {
		const ok = confirm(`Delete "${a.name}"? All trades on this account will also be deleted.`);
		if (!ok) return;
		try {
			await accountStore.deleteAccount(supabase, a.id);
		} catch (e) {
			alert(e instanceof Error ? e.message : "Failed to delete.");
		}
	}

	function setActive(a: Account) {
		accountStore.setActiveAccountId(a.id);
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Trading accounts</h2>
			<p class="text-xs text-muted-foreground">Manage the accounts you record trades against.</p>
		</div>
		<Button onclick={openCreate} class="rounded-md cursor-pointer">
			<PlusIcon size={14} /> New account
		</Button>
	</div>

	<div class="rounded-md border bg-background">
		{#if loading && accountStore.accounts.length === 0}
			<ul class="divide-y">
				{#each [0, 1, 2] as _}
					<li class="flex items-center justify-between gap-3 px-4 py-3">
						<div class="space-y-1.5">
							<Skeleton class="h-3.5 w-32" />
							<Skeleton class="h-3 w-16" />
						</div>
						<div class="flex gap-1">
							<Skeleton class="h-8 w-8" />
							<Skeleton class="h-8 w-8" />
						</div>
					</li>
				{/each}
			</ul>
		{:else if accountStore.accounts.length === 0}
			<div class="p-10 text-center">
				<div class="text-sm font-medium">No accounts yet</div>
				<div class="mt-1 text-sm text-muted-foreground">Create your first account to start tracking trades.</div>
			</div>
		{:else}
			<ul class="divide-y">
				{#each accountStore.accounts as a (a.id)}
					{@const isActive = accountStore.activeAccountId === a.id}
					<li class="flex items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<div class="text-sm font-medium">{a.name}</div>
								{#if isActive}
									<span class="inline-flex items-center rounded-md bg-emerald-700/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
										Active
									</span>
								{/if}
							</div>
							<div class="mt-0.5 text-xs text-muted-foreground capitalize">{a.account_type}</div>
						</div>
						<div class="flex items-center gap-1">
							{#if !isActive}
								<button type="button" class="text-xs text-primary hover:underline cursor-pointer mr-2" onclick={() => setActive(a)}>
									Set active
								</button>
							{/if}
							<Button variant="ghost" size="icon" class="h-8 w-8 cursor-pointer" aria-label="Edit" onclick={() => openEdit(a)}>
								<PencilSimpleIcon size={16} class="text-muted-foreground" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
								aria-label="Delete"
								onclick={() => remove(a)}
							>
								<TrashIcon size={16} />
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{editingId ? "Edit account" : "New account"}</Dialog.Title>
			<Dialog.Description>
				{editingId ? "Update the account's name or type." : "Create a new trading account."}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Name</div>
				<Input bind:value={formName} placeholder="e.g. Apex 50K, Live IB" class="rounded-md" />
			</div>
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Type</div>
				<Select.Root type="single" bind:value={formType}>
					<Select.Trigger class="w-full rounded-md cursor-pointer">
						<span class="capitalize">{formType}</span>
					</Select.Trigger>
					<Select.Content class="rounded-md">
						{#each ACCOUNT_TYPES as t}
							<Select.Item value={t} class="cursor-pointer capitalize">{t}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			{#if error}
				<div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{error}
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (dialogOpen = false)}>Cancel</Button>
			<Button class="rounded-md cursor-pointer" disabled={saving || !formName.trim()} onclick={submit}>
				{saving ? "Saving…" : editingId ? "Save changes" : "Create"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
