<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { confirm } from "$lib/components/ui/confirm-dialog";
	import { toast } from "svelte-sonner";
	import { PlusIcon, TrashIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { accountStore, ACCOUNT_STATUS_LABELS } from "$lib/stores/accounts.svelte";
	import { payoutStore } from "$lib/stores/payouts.svelte";
	import { expenseStore, type Expense } from "$lib/stores/expenses.svelte";
	import {
		EXPENSE_KINDS,
		EXPENSE_KIND_LABELS,
		type ExpenseKind
	} from "$lib/utils/expense-kinds";
	import { formatUsd } from "$lib/utils/format";

	let session = $state<{ user: { id: string } } | null>(null);
	let loading = $state(true);

	let sheetOpen = $state(false);
	let formAccountId = $state<string>("");
	let formKind = $state<ExpenseKind>("reset");
	let formAmount = $state("");
	let formDate = $state(new Date().toISOString().slice(0, 10));
	let formNotes = $state("");
	let saving = $state(false);

	function accountName(id: string) {
		return accountStore.accounts.find((a) => a.id === id)?.name ?? "Unknown account";
	}

	function accountStatus(id: string) {
		return accountStore.accounts.find((a) => a.id === id)?.status ?? "active";
	}

	/**
	 * Every outflow, archived accounts included — a breached account's fees are
	 * exactly the spend this page exists to surface. Payouts are counted only
	 * once actually received; requested or pending money isn't in hand yet.
	 */
	const totals = $derived.by(() => {
		const spent = expenseStore.expenses.reduce((sum, e) => sum + e.amount, 0);
		const received = payoutStore.allPayouts
			.filter((p) => p.status === "received")
			.reduce((sum, p) => sum + Number(p.amount), 0);
		return { spent, received, net: received - spent };
	});

	const byKind = $derived.by(() => {
		const map = new Map<ExpenseKind, number>();
		for (const e of expenseStore.expenses) {
			map.set(e.kind, (map.get(e.kind) ?? 0) + e.amount);
		}
		return [...map.entries()].sort((a, b) => b[1] - a[1]);
	});

	const byFirm = $derived.by(() => {
		const map = new Map<string, { spent: number; received: number }>();
		const bucketFor = (accountId: string) => {
			const acct = accountStore.accounts.find((a) => a.id === accountId);
			return acct?.prop_firm_name || acct?.name || "Unassigned";
		};
		for (const e of expenseStore.expenses) {
			const key = bucketFor(e.account_id);
			const g = map.get(key) ?? { spent: 0, received: 0 };
			g.spent += e.amount;
			map.set(key, g);
		}
		for (const p of payoutStore.allPayouts) {
			if (p.status !== "received") continue;
			const key = bucketFor(p.account_id);
			const g = map.get(key) ?? { spent: 0, received: 0 };
			g.received += Number(p.amount);
			map.set(key, g);
		}
		return [...map.entries()]
			.map(([name, g]) => ({ name, ...g, net: g.received - g.spent }))
			.sort((a, b) => a.net - b.net);
	});

	function openSheet() {
		formAccountId = accountStore.activeAccountId ?? accountStore.accounts[0]?.id ?? "";
		formKind = "reset";
		formAmount = "";
		formDate = new Date().toISOString().slice(0, 10);
		formNotes = "";
		sheetOpen = true;
	}

	async function submit() {
		const amount = Number(formAmount);
		if (!formAccountId) {
			toast.error("Pick an account.");
			return;
		}
		if (!formAmount || !Number.isFinite(amount) || amount <= 0) {
			toast.error("Enter a valid amount.");
			return;
		}
		saving = true;
		try {
			await expenseStore.create(supabase, {
				account_id: formAccountId,
				kind: formKind,
				amount,
				incurred_on: formDate,
				notes: formNotes.trim() || null
			});
			sheetOpen = false;
			toast.success("Expense recorded.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to record expense.");
		} finally {
			saving = false;
		}
	}

	async function remove(e: Expense) {
		const ok = await confirm({
			title: "Delete this expense?",
			description: `${EXPENSE_KIND_LABELS[e.kind]} of ${formatUsd(e.amount)} on ${accountName(e.account_id)}.`,
			destructive: true
		});
		if (!ok) return;
		try {
			await expenseStore.remove(supabase, e.id);
			toast.success("Expense deleted.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to delete.");
		}
	}

	onMount(async () => {
		const {
			data: { session: s }
		} = await supabase.auth.getSession();
		session = s;
	});

	$effect(() => {
		if (!session?.user?.id) return;
		void (async () => {
			loading = true;
			if (accountStore.accounts.length === 0) {
				await accountStore.getAllAccounts(supabase);
			}
			await Promise.all([
				expenseStore.getAll(supabase),
				payoutStore.getAllPayouts(supabase)
			]);
			loading = false;
		})();
	});
</script>

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Analytics</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Expenses</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">
			What prop trading has actually cost you, against what it has paid out.
		</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Challenge fees, resets, activation, platform and data-feed charges.</li>
			<li>Archived and breached accounts are included — that spend still happened.</li>
			<li>Only payouts marked <strong>received</strong> count as income.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-6xl space-y-6 p-4 md:p-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Expenses</h1>
				<p class="text-sm text-muted-foreground">
					Every cost across every account, including the ones you've retired.
				</p>
			</div>
			<Button class="cursor-pointer rounded-md" onclick={openSheet} disabled={accountStore.accounts.length === 0}>
				<PlusIcon size={14} /> Add expense
			</Button>
		</div>

		<div class="grid gap-3 sm:grid-cols-3">
			{#if loading}
				{#each [0, 1, 2] as _}
					<div class="rounded-md border bg-background p-4">
						<Skeleton class="h-3 w-20" />
						<Skeleton class="mt-2 h-7 w-28" />
					</div>
				{/each}
			{:else}
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Total spent</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
						{formatUsd(totals.spent)}
					</div>
				</div>
				<div class="rounded-md border bg-background p-4">
					<div class="text-xs text-muted-foreground">Payouts received</div>
					<div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
						{formatUsd(totals.received)}
					</div>
				</div>
				<div
					class={[
						"rounded-md border bg-background p-4",
						totals.net > 0 && "border-emerald-700/30 bg-emerald-700/5",
						totals.net < 0 && "border-rose-700/30 bg-rose-700/5"
					]}
				>
					<div class="text-xs text-muted-foreground">Net</div>
					<div
						class={[
							"mt-1 text-2xl font-semibold tabular-nums",
							totals.net > 0 && "text-emerald-700 dark:text-emerald-400",
							totals.net < 0 && "text-rose-700 dark:text-rose-400",
							totals.net === 0 && "text-muted-foreground"
						]}
					>
						{formatUsd(totals.net)}
					</div>
				</div>
			{/if}
		</div>

		{#if !loading && byKind.length > 0}
			<div class="rounded-md border bg-background">
				<div class="border-b px-4 py-3 text-sm font-medium">By category</div>
				<table class="w-full text-sm">
					<tbody class="[&>tr:not(:last-child)]:border-b">
						{#each byKind as [kind, amount] (kind)}
							<tr class="[&>td]:px-4 [&>td]:py-2 hover:bg-muted/30">
								<td class="text-xs">{EXPENSE_KIND_LABELS[kind]}</td>
								<td class="text-right text-xs font-medium tabular-nums">{formatUsd(amount)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if !loading && byFirm.length > 0}
			<div class="rounded-md border bg-background">
				<div class="border-b px-4 py-3 text-sm font-medium">By firm</div>
				<div class="w-full overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
								<th class="whitespace-nowrap">Firm</th>
								<th class="text-right whitespace-nowrap">Spent</th>
								<th class="text-right whitespace-nowrap">Received</th>
								<th class="text-right whitespace-nowrap">Net</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each byFirm as f (f.name)}
								<tr class="[&>td]:px-4 [&>td]:py-2 hover:bg-muted/30">
									<td class="text-xs font-medium">{f.name}</td>
									<td class="text-right text-xs tabular-nums">{formatUsd(f.spent)}</td>
									<td class="text-right text-xs tabular-nums">{formatUsd(f.received)}</td>
									<td
										class={[
											"text-right text-xs font-medium tabular-nums",
											f.net > 0 && "text-emerald-700 dark:text-emerald-400",
											f.net < 0 && "text-rose-700 dark:text-rose-400",
											f.net === 0 && "text-muted-foreground"
										]}
									>
										{formatUsd(f.net)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<div class="rounded-md border bg-background">
			<div class="border-b px-4 py-3 text-sm font-medium">All expenses</div>
			{#if loading}
				<div class="divide-y">
					{#each [0, 1, 2, 3] as _}
						<div class="flex items-center gap-4 px-4 py-3">
							<Skeleton class="h-3.5 w-24" />
							<Skeleton class="h-3.5 w-32" />
							<Skeleton class="ml-auto h-3.5 w-16" />
						</div>
					{/each}
				</div>
			{:else if expenseStore.expenses.length === 0}
				<div class="p-10 text-center">
					<div class="text-sm font-medium">No expenses recorded</div>
					<div class="mt-1 text-sm text-muted-foreground">
						Add challenge fees, resets and monthly platform charges to see what this has cost.
					</div>
				</div>
			{:else}
				<div class="w-full overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
								<th class="whitespace-nowrap">Date</th>
								<th class="whitespace-nowrap">Account</th>
								<th class="whitespace-nowrap">Category</th>
								<th class="whitespace-nowrap">Notes</th>
								<th class="text-right whitespace-nowrap">Amount</th>
								<th class="w-10"></th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each expenseStore.expenses as e (e.id)}
								{@const status = accountStatus(e.account_id)}
								<tr class="[&>td]:px-4 [&>td]:py-2 hover:bg-muted/30">
									<td class="text-xs tabular-nums whitespace-nowrap">{e.incurred_on}</td>
									<td class="text-xs whitespace-nowrap">
										<span>{accountName(e.account_id)}</span>
										{#if status !== "active"}
											<span class="ml-1.5 inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
												{ACCOUNT_STATUS_LABELS[status]}
											</span>
										{/if}
									</td>
									<td class="text-xs whitespace-nowrap">{EXPENSE_KIND_LABELS[e.kind]}</td>
									<td class="text-xs text-muted-foreground">{e.notes ?? "—"}</td>
									<td class="text-right text-xs font-medium tabular-nums whitespace-nowrap">
										{formatUsd(e.amount)}
									</td>
									<td class="text-right">
										<Button
											variant="ghost"
											size="icon"
											class="h-8 w-8 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
											aria-label="Delete expense"
											onclick={() => remove(e)}
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
</ScrollArea>

<Sheet.Root bind:open={sheetOpen}>
	<Sheet.Content side="right" class="w-[min(100vw,400px)] sm:max-w-[400px]">
		<Sheet.Header>
			<Sheet.Title>Add expense</Sheet.Title>
			<Sheet.Description>A cost against one of your accounts.</Sheet.Description>
		</Sheet.Header>

		<div class="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Account</div>
				<Select.Root type="single" bind:value={formAccountId}>
					<Select.Trigger class="w-full cursor-pointer rounded-md">
						<span class="truncate">
							{formAccountId ? accountName(formAccountId) : "Pick an account"}
						</span>
					</Select.Trigger>
					<Select.Content class="rounded-md">
						<!-- Archived accounts stay pickable: a reset fee often lands after
						     the account is already blown. -->
						{#each accountStore.accounts as a (a.id)}
							{@const status = a.status ?? "active"}
							<Select.Item value={a.id} class="cursor-pointer">
								<div class="flex flex-col">
									<span>{a.name}</span>
									<span class="text-[10px] text-muted-foreground capitalize">
										{a.account_type ?? ""}{status === "active" ? "" : ` · ${status}`}
									</span>
								</div>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Category</div>
				<Select.Root type="single" bind:value={formKind}>
					<Select.Trigger class="w-full cursor-pointer rounded-md">
						<span>{EXPENSE_KIND_LABELS[formKind]}</span>
					</Select.Trigger>
					<Select.Content class="rounded-md">
						{#each EXPENSE_KINDS as k (k)}
							<Select.Item value={k} class="cursor-pointer">{EXPENSE_KIND_LABELS[k]}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Amount ($)</div>
				<Input bind:value={formAmount} inputmode="decimal" placeholder="e.g. 137" class="rounded-md" />
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Date</div>
				<Input type="date" bind:value={formDate} class="rounded-md" />
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Notes</div>
				<Input bind:value={formNotes} placeholder="Optional" class="rounded-md" />
			</div>
		</div>

		<Sheet.Footer>
			<Button class="w-full cursor-pointer rounded-md" disabled={saving} onclick={submit}>
				{saving ? "Saving…" : "Add expense"}
			</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
