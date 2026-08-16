<script lang="ts">
	import { onMount } from "svelte";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { PencilSimpleIcon, PlusIcon, TrashIcon, LockSimpleIcon, ArrowCounterClockwiseIcon, ArchiveIcon, ArrowUUpLeftIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import {
		accountStore,
		ACCOUNT_STATUS_LABELS,
		type Account,
		type AccountStatus
	} from "$lib/stores/accounts.svelte";
	import { expenseStore } from "$lib/stores/expenses.svelte";
	import { formatUsd } from "$lib/utils/format";
	import { confirm } from "$lib/components/ui/confirm-dialog";
	import { toast } from "svelte-sonner";

	const ACCOUNT_TYPES: { value: string; label: string; disabled?: boolean }[] = [
		{ value: "prop firm", label: "Prop Firm" },
		{ value: "paper trading", label: "Paper Trading" },
		{ value: "live", label: "Live (coming soon)", disabled: true },
		{ value: "crypto", label: "Crypto (coming soon)", disabled: true },
	];
	const DRAWDOWN_TYPES: { value: string; label: string; disabled?: boolean }[] = [
		{ value: "eod", label: "End of day (EOD)" },
		{ value: "intraday", label: "Intraday (trailing)" },
		{ value: "static", label: "Static (coming soon)", disabled: true },
	];
	const loading = $derived(accountStore.loading);

	let dialogOpen = $state(false);
	let editingId = $state<string | null>(null);
	let formName = $state("");
	let formType = $state<string>("prop firm");
	let formStartingBalance = $state<string>("");
	let formPropFirmName = $state("");
	let formPropFirmType = $state("");
	let formProfitTarget = $state<string>("");
	let formMaxDrawdown = $state<string>("");
	let formDailyLossLimit = $state<string>("");
	let formConsistencyRule = $state("");
	let formMaxContracts = $state("");
	let formDrawdownType = $state<string>("eod");
	let formChallengeCost = $state<string>("");
	let formProfitSplit = $state<string>("");
	/** Lets a past account be entered already retired, for backfilling history. */
	let formStatus = $state<AccountStatus>("active");
	let saving = $state(false);

	const isPropFirm = $derived(formType === "prop firm");
	const isPaperTrading = $derived(formType === "paper trading");
	const hasTradingRules = $derived(isPropFirm || isPaperTrading);
	const isFunded = $derived(formPropFirmType.trim().toLowerCase() === "funded");

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
		formType = "prop firm";
		formStartingBalance = "";
		formPropFirmName = "";
		formPropFirmType = "";
		formProfitTarget = "";
		formMaxDrawdown = "";
		formDailyLossLimit = "";
		formConsistencyRule = "";
		formMaxContracts = "";
		formDrawdownType = "eod";
		formChallengeCost = "";
		formProfitSplit = "";
		formStatus = "active";
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
		formType = a.account_type ?? "prop firm";
		formStartingBalance = a.starting_balance != null ? String(a.starting_balance) : "";
		formPropFirmName = a.prop_firm_name ?? "";
		formPropFirmType = a.prop_firm_type ?? "";
		formProfitTarget = a.prop_firm_profit_target != null ? String(a.prop_firm_profit_target) : "";
		formMaxDrawdown = a.prop_firm_max_drawdown != null ? String(a.prop_firm_max_drawdown) : "";
		formDailyLossLimit = a.prop_firm_daily_loss_limit != null ? String(a.prop_firm_daily_loss_limit) : "";
		formConsistencyRule = a.prop_firm_consistency_rule ?? "";
		formMaxContracts = a.prop_firm_max_contracts ?? "";
		formDrawdownType = a.prop_firm_drawdown_type ?? "eod";
		// Cost isn't editable here — it lives in the expense ledger once the account
		// exists, and the field is hidden on edit.
		formChallengeCost = "";
		formProfitSplit = a.profit_split != null ? String(a.profit_split * 100) : "";
		dialogOpen = true;
	}

	function numOrNull(v: unknown): number | null {
		if (v == null || v === "") return null;
		if (typeof v === "number") return Number.isFinite(v) ? v : null;
		const t = String(v).trim();
		if (!t) return null;
		const n = Number(t);
		return Number.isFinite(n) ? n : null;
	}

	function strOrNull(v: unknown): string | null {
		if (v == null) return null;
		const t = String(v).trim();
		return t ? t : null;
	}

	async function submit() {
		const name = formName.trim();
		if (!name) {
			toast.error("Name is required.");
			return;
		}
		saving = true;
		try {
			const payload: Record<string, unknown> = {
				name,
				account_type: formType,
				starting_balance: numOrNull(formStartingBalance),
			};
			// Only on create — archiving an existing account goes through the row
			// action, which sends status on its own to clear the graduated lock.
			if (!editingId && formStatus !== "active") payload.status = formStatus;
			if (hasTradingRules) {
				payload.prop_firm_profit_target = numOrNull(formProfitTarget);
				payload.prop_firm_max_drawdown = numOrNull(formMaxDrawdown);
			}
			if (isPropFirm) {
				payload.prop_firm_daily_loss_limit = numOrNull(formDailyLossLimit);
				payload.prop_firm_consistency_rule = strOrNull(formConsistencyRule);
				payload.prop_firm_max_contracts = strOrNull(formMaxContracts);
				payload.prop_firm_drawdown_type = formDrawdownType || null;
			}
			if (isPropFirm) {
				payload.prop_firm_name = strOrNull(formPropFirmName);
				payload.prop_firm_type = strOrNull(formPropFirmType);
				// Create only: the endpoint turns this into the account's first ledger
				// entry. On edit, costs are managed on the Expenses page.
				if (!editingId) payload.challenge_cost = numOrNull(formChallengeCost);
				const rawSplit = parseFloat(String(formProfitSplit));
				payload.profit_split = Number.isFinite(rawSplit) && rawSplit > 0 ? rawSplit / 100 : null;
			}
			if (editingId) {
				await accountStore.updateAccount(supabase, editingId, payload);
				toast.success("Account updated.");
			} else {
				await accountStore.createAccount(supabase, payload);
				toast.success("Account created.");
			}
			dialogOpen = false;
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save.");
		} finally {
			saving = false;
		}
	}

	async function reset(a: Account) {
		const ok = await confirm({
			title: `Reset "${a.name}"?`,
			description: "All trades and payouts will be permanently deleted, but the account will remain.",
			confirmLabel: "Reset",
			destructive: true,
		});
		if (!ok) return;
		try {
			const res = await fetch(`/api/accounts/${a.id}/reset`, { method: "POST" });
			const body = await res.json();
			if (!body.success) throw new Error(body.message);
			toast.success(`"${a.name}" has been reset.`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to reset.");
		}
	}

	async function remove(a: Account) {
		const ok = await confirm({
			title: `Delete "${a.name}"?`,
			description: "All trades on this account will also be deleted.",
			destructive: true,
		});
		if (!ok) return;
		try {
			await accountStore.deleteAccount(supabase, a.id);
			toast.success(`"${a.name}" deleted.`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete.");
		}
	}

	function setActive(a: Account) {
		accountStore.setActiveAccountId(a.id);
	}

	/**
	 * Archiving retires an account without touching its trades, payouts or
	 * expenses — that history is the reason to keep the row at all. It drops out
	 * of the sidebar switcher; everything cost-related still counts it.
	 */
	async function archive(a: Account, status: AccountStatus) {
		const label = ACCOUNT_STATUS_LABELS[status].toLowerCase();
		const ok = await confirm({
			title: `Mark "${a.name}" as ${label}?`,
			description:
				"It leaves the account switcher and stops appearing where you pick an account to trade on. Its trades, payouts and costs are kept and still count toward your totals. You can restore it later.",
			confirmLabel: `Mark as ${label}`,
		});
		if (!ok) return;
		try {
			await accountStore.setStatus(supabase, a.id, status);
			toast.success(`"${a.name}" archived as ${label}.`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to archive.");
		}
	}

	async function restore(a: Account) {
		try {
			await accountStore.setStatus(supabase, a.id, "active");
			toast.success(`"${a.name}" restored.`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to restore.");
		}
	}

	function statusOf(a: Account): AccountStatus {
		return a.status ?? "active";
	}

	// Archived rows show what the account cost, which is the reason they're kept.
	onMount(() => {
		void expenseStore.getAll(supabase);
	});
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
		{:else if accountStore.activeAccounts.length === 0}
			<div class="p-10 text-center">
				<div class="text-sm font-medium">No active accounts</div>
				<div class="mt-1 text-sm text-muted-foreground">
					Every account is archived. Restore one below, or create a new one to start trading again.
				</div>
			</div>
		{:else}
			{@const grouped = (() => {
				const propFirmMap = new Map<string, typeof accountStore.accounts>();
				const others: typeof accountStore.accounts = [];
				// Archived accounts get their own section below.
				for (const a of accountStore.activeAccounts) {
					if (a.account_type === "prop firm" && a.prop_firm_name) {
						if (!propFirmMap.has(a.prop_firm_name)) propFirmMap.set(a.prop_firm_name, []);
						propFirmMap.get(a.prop_firm_name)!.push(a);
					} else {
						others.push(a);
					}
				}
				const sections: { label: string | null; accounts: typeof accountStore.accounts }[] = [];
				for (const [name, accts] of propFirmMap) sections.push({ label: name, accounts: accts });
				if (others.length > 0) sections.push({ label: null, accounts: others });
				return sections;
			})()}
			<ul class="divide-y">
				{#each grouped as section}
					{#if section.label}
						<li class="flex items-center gap-2 bg-muted/30 px-4 py-2">
							<span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{section.label}</span>
						</li>
					{/if}
					{#each section.accounts as a (a.id)}
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
									{a.account_type}{#if a.account_type === "prop firm" && a.prop_firm_type} · {a.prop_firm_type}{/if}
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
								class="h-8 w-8 cursor-pointer text-amber-600 hover:bg-amber-600/10 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-400"
								aria-label="Reset"
								title="Delete all trades and payouts, keep the account"
								onclick={() => reset(a)}
							>
								<ArrowCounterClockwiseIcon size={16} />
							</Button>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="ghost"
											size="icon"
											class="h-8 w-8 cursor-pointer"
											aria-label="Archive account"
											title="Retire this account, keeping its history"
										>
											<ArchiveIcon size={16} class="text-muted-foreground" />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="rounded-md">
									<DropdownMenu.Item class="cursor-pointer" onSelect={() => archive(a, "breached")}>
										Mark as breached
									</DropdownMenu.Item>
									<DropdownMenu.Item class="cursor-pointer" onSelect={() => archive(a, "closed")}>
										Mark as closed
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
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
				{/each}
			</ul>
		{/if}
	</div>

	{#if accountStore.archivedAccounts.length > 0}
		<div class="rounded-md border bg-background">
			<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
				<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Archived
				</span>
				<span class="text-[11px] text-muted-foreground">
					Kept for cost and trade history · hidden from the switcher
				</span>
			</div>
			<ul class="divide-y">
				{#each accountStore.archivedAccounts as a (a.id)}
					{@const spend = expenseStore.totalForAccount(a.id)}
					<li class="flex items-center justify-between gap-3 px-4 py-3">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<div class="text-sm font-medium text-muted-foreground">{a.name}</div>
								<span
									class={[
										"inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize",
										statusOf(a) === "breached"
											? "bg-rose-700/10 text-rose-700 dark:text-rose-400"
											: "bg-muted text-muted-foreground",
									]}
								>
									{ACCOUNT_STATUS_LABELS[statusOf(a)]}
								</span>
							</div>
							<div class="mt-0.5 text-xs text-muted-foreground capitalize">
								{a.account_type}{#if a.prop_firm_name} · {a.prop_firm_name}{/if}
								{#if spend > 0}
									<span class="tabular-nums normal-case"> · {formatUsd(spend)} spent</span>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-1">
							<Button
								variant="ghost"
								size="sm"
								class="h-8 cursor-pointer px-2 text-xs"
								onclick={() => restore(a)}
							>
								<ArrowUUpLeftIcon size={14} />
								Restore
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-lg max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{editingId ? "Edit account" : "New account"}</Dialog.Title>
			<Dialog.Description>
				{editingId ? "Update the account's details." : "Create a new trading account."}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-5">
			<!-- Basics -->
			<section class="space-y-3">
				<div class="flex items-baseline justify-between">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basics</h3>
				</div>
				<div class="space-y-3">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Name</div>
						<Input bind:value={formName} placeholder="e.g. Apex 50K, Live IB" class="rounded-md" />
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Type</div>
							<Select.Root type="single" bind:value={formType}>
								<Select.Trigger class="w-full rounded-md cursor-pointer">
									<span class="capitalize">{ACCOUNT_TYPES.find((t) => t.value === formType)?.label ?? formType}</span>
								</Select.Trigger>
								<Select.Content class="rounded-md">
									{#each ACCOUNT_TYPES as t}
										<Select.Item value={t.value} disabled={t.disabled} class="cursor-pointer">{t.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Starting balance</div>
							<Input bind:value={formStartingBalance} type="number" inputmode="decimal" placeholder="50000" class="rounded-md" />
						</div>
					</div>
					{#if !editingId}
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Status</div>
							<Select.Root type="single" bind:value={formStatus}>
								<Select.Trigger class="w-full cursor-pointer rounded-md">
									<span>{ACCOUNT_STATUS_LABELS[formStatus]}</span>
								</Select.Trigger>
								<Select.Content class="rounded-md">
									{#each Object.entries(ACCOUNT_STATUS_LABELS) as [value, label] (value)}
										<Select.Item {value} class="cursor-pointer">{label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<p class="text-[11px] leading-snug text-muted-foreground">
								Recording a past account? Create it already breached or closed — it stays out
								of the switcher, but its trades and costs still count.
							</p>
						</div>
					{/if}
				</div>
			</section>

			{#if isPropFirm}
				<!-- Firm identity -->
				<section class="space-y-3 border-t pt-4">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Firm</h3>
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
				</section>
			{/if}

			{#if hasTradingRules}
				<!-- Trading rules -->
				<section class="space-y-3 border-t pt-4">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trading rules</h3>
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">{isFunded ? "Min. payout threshold ($)" : "Profit target ($)"}</div>
							<Input bind:value={formProfitTarget} type="number" inputmode="decimal" placeholder={isFunded ? "e.g. 2000" : "3000"} class="rounded-md" />
							{#if isFunded}
								<p class="text-[11px] text-muted-foreground">Minimum profit required before you can request a payout.</p>
							{/if}
						</div>
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Max drawdown ($)</div>
							<Input bind:value={formMaxDrawdown} type="number" inputmode="decimal" placeholder="2500" class="rounded-md" />
						</div>
						{#if isPropFirm}
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Daily loss limit ($)</div>
								<Input bind:value={formDailyLossLimit} type="number" inputmode="decimal" placeholder="1500" class="rounded-md" />
							</div>
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Max contracts</div>
								<Input bind:value={formMaxContracts} placeholder="e.g. 10" class="rounded-md" />
							</div>
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Drawdown type</div>
								<Select.Root type="single" bind:value={formDrawdownType}>
									<Select.Trigger class="w-full rounded-md cursor-pointer">
										<span>{DRAWDOWN_TYPES.find((t) => t.value === formDrawdownType)?.label ?? "Select"}</span>
									</Select.Trigger>
									<Select.Content class="rounded-md">
										{#each DRAWDOWN_TYPES as t}
											<Select.Item value={t.value} disabled={t.disabled} class="cursor-pointer">{t.label}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
						{/if}
					</div>
					{#if isPropFirm && formDrawdownType === "intraday"}
						<p class="text-[11px] text-muted-foreground leading-snug">
							Intraday drawdown trails your peak equity during the day. When logging a trade you'll be
							asked for its highest unrealized profit so cushion consumption can be tracked.
						</p>
					{/if}
					{#if isPropFirm}
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Consistency rule</div>
							<Input bind:value={formConsistencyRule} placeholder="e.g. 30% (best day max share of total profit)" class="rounded-md" />
							<p class="text-[11px] text-muted-foreground">Enter the cap as a percentage (e.g. 30% or 0.3). Leave blank if not applicable.</p>
						</div>
					{/if}
				</section>
			{/if}

			{#if isPropFirm}
				<!-- Cost / payout -->
				<section class="space-y-3 border-t pt-4">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{isFunded ? "Payout" : "Cost"}
					</h3>
					{#if !isFunded && !editingId}
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Challenge cost ($)</div>
							<Input bind:value={formChallengeCost} type="number" inputmode="decimal" placeholder="e.g. 149" class="rounded-md" />
							<p class="text-[11px] text-muted-foreground">
								What you paid for this evaluation. Recorded as the account's first expense —
								add resets and monthly fees on the Expenses page.
							</p>
						</div>
					{:else if !isFunded}
						<!-- Costs live in the expense ledger once the account exists, so editing
						     a single number here would write a column nothing reads. -->
						<p class="text-[11px] leading-snug text-muted-foreground">
							Costs for this account are tracked on the
							<a href="/analytics/expenses" class="text-primary hover:underline">Expenses</a>
							page, where resets and recurring fees can be recorded too.
						</p>
					{:else}
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Profit split (%)</div>
							<Input bind:value={formProfitSplit} type="number" inputmode="decimal" placeholder="e.g. 80" class="rounded-md" />
							<p class="text-[11px] text-muted-foreground">Your share of profits on payouts (e.g. 80 for an 80/20 split).</p>
						</div>
					{/if}
				</section>
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
