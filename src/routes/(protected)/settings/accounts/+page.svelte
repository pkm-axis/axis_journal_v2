<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { PencilSimpleIcon, PlusIcon, TrashIcon, LockSimpleIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { accountStore, type Account } from "$lib/stores/accounts.svelte";

	const ACCOUNT_TYPES = ["live", "demo", "prop firm", "paper"];
	const loading = $derived(accountStore.loading);

	let dialogOpen = $state(false);
	let editingId = $state<string | null>(null);
	let formName = $state("");
	let formType = $state<string>("live");
	let formStartingBalance = $state<string>("");
	let formPropFirmName = $state("");
	let formPropFirmType = $state("");
	let formProfitTarget = $state<string>("");
	let formMaxDrawdown = $state<string>("");
	let formDailyLossLimit = $state<string>("");
	let formConsistencyRule = $state("");
	let formMaxContracts = $state("");
	let saving = $state(false);
	let error = $state<string | null>(null);

	const isPropFirm = $derived(formType === "prop firm");

	// An account is "graduated" if another account points to it as parent.
	const graduatedIds = $derived(
		new Set(
			accountStore.accounts
				.map((a) => a.parent_account_id)
				.filter((id): id is string => !!id)
		)
	);

	function resetForm() {
		formName = "";
		formType = "live";
		formStartingBalance = "";
		formPropFirmName = "";
		formPropFirmType = "";
		formProfitTarget = "";
		formMaxDrawdown = "";
		formDailyLossLimit = "";
		formConsistencyRule = "";
		formMaxContracts = "";
		error = null;
	}

	function openCreate() {
		editingId = null;
		resetForm();
		dialogOpen = true;
	}

	function openEdit(a: Account) {
		if (graduatedIds.has(a.id)) return;
		editingId = a.id;
		resetForm();
		formName = a.name;
		formType = a.account_type ?? "live";
		formStartingBalance = a.starting_balance != null ? String(a.starting_balance) : "";
		formPropFirmName = a.prop_firm_name ?? "";
		formPropFirmType = a.prop_firm_type ?? "";
		formProfitTarget = a.prop_firm_profit_target != null ? String(a.prop_firm_profit_target) : "";
		formMaxDrawdown = a.prop_firm_max_drawdown != null ? String(a.prop_firm_max_drawdown) : "";
		formDailyLossLimit = a.prop_firm_daily_loss_limit != null ? String(a.prop_firm_daily_loss_limit) : "";
		formConsistencyRule = a.prop_firm_consistency_rule ?? "";
		formMaxContracts = a.prop_firm_max_contracts ?? "";
		dialogOpen = true;
	}

	function numOrNull(v: string): number | null {
		const t = v.trim();
		if (!t) return null;
		const n = Number(t);
		return Number.isFinite(n) ? n : null;
	}

	function strOrNull(v: string): string | null {
		const t = v.trim();
		return t ? t : null;
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
			const payload: Record<string, unknown> = {
				name,
				account_type: formType,
				starting_balance: numOrNull(formStartingBalance),
			};
			if (isPropFirm) {
				payload.prop_firm_name = strOrNull(formPropFirmName);
				payload.prop_firm_type = strOrNull(formPropFirmType);
				payload.prop_firm_profit_target = numOrNull(formProfitTarget);
				payload.prop_firm_max_drawdown = numOrNull(formMaxDrawdown);
				payload.prop_firm_daily_loss_limit = numOrNull(formDailyLossLimit);
				payload.prop_firm_consistency_rule = strOrNull(formConsistencyRule);
				payload.prop_firm_max_contracts = strOrNull(formMaxContracts);
			}
			if (editingId) {
				await accountStore.updateAccount(supabase, editingId, payload);
			} else {
				await accountStore.createAccount(supabase, payload);
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
					{@const isGraduated = graduatedIds.has(a.id)}
					<li class="flex items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<div class="text-sm font-medium">{a.name}</div>
								{#if isActive}
									<span class="inline-flex items-center rounded-md bg-emerald-700/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
										Active
									</span>
								{/if}
								{#if isGraduated}
									<span class="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
										<LockSimpleIcon size={10} weight="fill" /> Graduated
									</span>
								{/if}
							</div>
							<div class="mt-0.5 text-xs text-muted-foreground capitalize">
								{a.account_type}{#if a.account_type === "prop firm" && a.prop_firm_name} · {a.prop_firm_name}{/if}
							</div>
						</div>
						<div class="flex items-center gap-1">
							{#if !isActive}
								<button type="button" class="text-xs text-primary hover:underline cursor-pointer mr-2" onclick={() => setActive(a)}>
									Set active
								</button>
							{/if}
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 cursor-pointer disabled:cursor-not-allowed"
								aria-label="Edit"
								disabled={isGraduated}
								title={isGraduated ? "Graduated accounts are locked from editing." : undefined}
								onclick={() => openEdit(a)}
							>
								<PencilSimpleIcon size={16} class="text-muted-foreground" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400 disabled:cursor-not-allowed"
								aria-label="Delete"
								disabled={isGraduated}
								title={isGraduated ? "Graduated accounts are locked from deletion." : undefined}
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
	<Dialog.Content class="sm:max-w-lg max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{editingId ? "Edit account" : "New account"}</Dialog.Title>
			<Dialog.Description>
				{editingId ? "Update the account's details." : "Create a new trading account."}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Name</div>
				<Input bind:value={formName} placeholder="e.g. Apex 50K, Live IB" class="rounded-md" />
			</div>
			<div class="grid grid-cols-2 gap-3">
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
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Starting balance</div>
					<Input bind:value={formStartingBalance} type="number" inputmode="decimal" placeholder="50000" class="rounded-md" />
				</div>
			</div>

			{#if isPropFirm}
				<div class="rounded-md border bg-muted/20 p-3 space-y-3">
					<div class="text-xs font-medium text-muted-foreground">Prop firm rules</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Firm name</div>
							<Input bind:value={formPropFirmName} placeholder="e.g. Apex, Topstep" class="rounded-md" />
						</div>
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Phase / type</div>
							<Input bind:value={formPropFirmType} placeholder="e.g. Eval, Funded" class="rounded-md" />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Profit target ($)</div>
							<Input bind:value={formProfitTarget} type="number" inputmode="decimal" placeholder="3000" class="rounded-md" />
						</div>
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Max drawdown ($)</div>
							<Input bind:value={formMaxDrawdown} type="number" inputmode="decimal" placeholder="2500" class="rounded-md" />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Daily loss limit ($)</div>
							<Input bind:value={formDailyLossLimit} type="number" inputmode="decimal" placeholder="1500" class="rounded-md" />
						</div>
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Max contracts</div>
							<Input bind:value={formMaxContracts} placeholder="e.g. 10" class="rounded-md" />
						</div>
					</div>
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Consistency rule</div>
						<Input bind:value={formConsistencyRule} placeholder="e.g. 30% (best day max share of total profit)" class="rounded-md" />
						<p class="text-[11px] text-muted-foreground">Enter the cap as a percentage (e.g. 30% or 0.3). Leave blank if not applicable.</p>
					</div>
				</div>
			{/if}

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
