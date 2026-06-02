<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { confirm } from "$lib/components/ui/confirm-dialog";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { DateTimePicker } from "$lib/components/ui/date-time-picker";
	import { ArchiveIcon, FlaskIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { backtestSessionStore, backtestFailStatus, type BacktestSession } from "$lib/stores/backtest-sessions.svelte";
	import { instrumentStore } from "$lib/stores/instruments.svelte";
	import { toast } from "svelte-sonner";

	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let showArchived = $state(false);

	let formName = $state("");
	let formDescription = $state("");
	let formInstrumentId = $state<string | null>(null);
	let formStartingBalance = $state("");
	let formMaxLossLimit = $state("");
	let formPeriodStart = $state<string | null>(null);
	let formPeriodEnd = $state<string | null>(null);
	let formNotes = $state("");

	const loading = $derived(backtestSessionStore.loading);
	const visibleSessions = $derived(
		showArchived
			? backtestSessionStore.sessions
			: backtestSessionStore.sessions.filter((s) => !s.archived)
	);

	function num(v: string): number | null {
		if (!v.trim()) return null;
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	}

	function resetForm() {
		formName = "";
		formDescription = "";
		formInstrumentId = null;
		formStartingBalance = "";
		formMaxLossLimit = "";
		formPeriodStart = null;
		formPeriodEnd = null;
		formNotes = "";
		editingId = null;
	}

	function openCreate() {
		resetForm();
		formOpen = true;
	}

	function openEdit(s: BacktestSession) {
		editingId = s.id;
		formName = s.name;
		formDescription = s.description ?? "";
		formInstrumentId = s.instrument_id;
		formStartingBalance = s.starting_balance != null ? String(s.starting_balance) : "";
		formMaxLossLimit = s.max_loss_limit != null ? String(s.max_loss_limit) : "";
		formPeriodStart = s.period_start;
		formPeriodEnd = s.period_end;
		formNotes = s.notes ?? "";
		formOpen = true;
	}

	async function submit() {
		const name = formName.trim();
		if (!name) {
			toast.error("Name is required.");
			return;
		}
		saving = true;
		try {
			const payload = {
				name,
				description: formDescription.trim() || null,
				instrument_id: formInstrumentId,
				starting_balance: num(formStartingBalance),
				max_loss_limit: num(formMaxLossLimit),
				period_start: formPeriodStart ? new Date(formPeriodStart).toISOString() : null,
				period_end: formPeriodEnd ? new Date(formPeriodEnd).toISOString() : null,
				notes: formNotes.trim() || null,
			};
			if (editingId) {
				await backtestSessionStore.update(supabase, editingId, payload);
				toast.success("Session updated.");
			} else {
				const created = await backtestSessionStore.create(supabase, payload);
				toast.success("Session created.");
				formOpen = false;
				resetForm();
				await goto(`/tools/backtesting/${created.id}`);
				return;
			}
			formOpen = false;
			resetForm();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save session.");
		} finally {
			saving = false;
		}
	}

	async function toggleArchive(s: BacktestSession) {
		try {
			await backtestSessionStore.update(supabase, s.id, { archived: !s.archived });
			toast.success(s.archived ? "Session restored." : "Session archived.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to update session.");
		}
	}

	async function remove(s: BacktestSession) {
		const ok = await confirm({
			title: `Delete "${s.name}"?`,
			description: "All trades in this session will also be deleted. This cannot be undone.",
			destructive: true,
		});
		if (!ok) return;
		try {
			await backtestSessionStore.remove(supabase, s.id);
			toast.success("Session deleted.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete session.");
		}
	}

	function formatUsd(value?: number | null) {
		if (value == null || Number.isNaN(value)) return "—";
		return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
	}

	function formatDate(iso: string | null) {
		if (!iso) return "—";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "—";
		return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(d);
	}

	function instrumentSymbol(id: string | null) {
		if (!id) return null;
		return instrumentStore.instruments?.find((i) => i.id === id)?.symbol ?? null;
	}

	onMount(() => {
		void backtestSessionStore.getAll(supabase, { includeArchived: true });
		if (!instrumentStore.instruments?.length) {
			void instrumentStore.getInstruments(supabase);
		}
	});
</script>

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Tools</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Backtesting</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-6xl space-y-4 p-4 md:p-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight">
					<FlaskIcon size={22} class="text-muted-foreground" />
					Backtesting
				</h1>
				<p class="text-sm text-muted-foreground">
					Create simulation sessions and journal hypothetical trades against a strategy.
				</p>
			</div>
			<Button onclick={openCreate} class="cursor-pointer rounded-md">
				<PlusIcon />
				New session
			</Button>
		</div>

		<div class="flex items-center gap-2">
			<label class="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
				<input type="checkbox" bind:checked={showArchived} class="h-3.5 w-3.5 cursor-pointer accent-primary" />
				Show archived
			</label>
		</div>

		{#if loading && backtestSessionStore.sessions.length === 0}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each [0, 1, 2] as _}
					<div class="rounded-md border bg-background p-4">
						<Skeleton class="h-5 w-32" />
						<Skeleton class="mt-2 h-3 w-48" />
						<div class="mt-4 space-y-2">
							<Skeleton class="h-3 w-20" />
							<Skeleton class="h-3 w-24" />
						</div>
					</div>
				{/each}
			</div>
		{:else if visibleSessions.length === 0}
			<div class="rounded-md border bg-background p-10 text-center">
				<div class="text-sm font-medium">No backtest sessions yet</div>
				<div class="mt-1 text-sm text-muted-foreground">
					Create one to start journaling hypothetical trades against a strategy.
				</div>
				<Button onclick={openCreate} class="mt-4 cursor-pointer rounded-md">
					<PlusIcon size={14} />
					New session
				</Button>
			</div>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each visibleSessions as s (s.id)}
					{@const sym = instrumentSymbol(s.instrument_id)}
					{@const netPnl = s.net_pnl ?? 0}
					{@const failStatus = backtestFailStatus(s.max_loss_limit, netPnl)}
					<div
						class={[
							"group rounded-md border bg-background p-4 transition-colors hover:bg-muted/30",
							s.archived && "opacity-60"
						]}
					>
						<button
							type="button"
							class="block w-full text-left cursor-pointer"
							onclick={() => goto(`/tools/backtesting/${s.id}`)}
						>
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<div class="flex items-center gap-2">
										<span class="truncate text-sm font-semibold">{s.name}</span>
										{#if failStatus?.breached}
											<span class="rounded-md bg-rose-700/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-rose-700 dark:text-rose-400">Failed</span>
										{/if}
										{#if s.archived}
											<span class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">Archived</span>
										{/if}
									</div>
									{#if s.description}
										<p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
									{/if}
								</div>
							</div>

							<div class="mt-3 grid grid-cols-3 gap-2 text-xs">
								<div>
									<div class="text-[10px] uppercase tracking-wide text-muted-foreground">Trades</div>
									<div class="mt-0.5 font-medium tabular-nums">{s.trade_count ?? 0}</div>
								</div>
								<div>
									<div class="text-[10px] uppercase tracking-wide text-muted-foreground">Net P&amp;L</div>
									<div
										class={[
											"mt-0.5 font-medium tabular-nums",
											netPnl > 0 && "text-emerald-700 dark:text-emerald-400",
											netPnl < 0 && "text-rose-700 dark:text-rose-400"
										]}
									>
										{formatUsd(netPnl)}
									</div>
								</div>
								<div>
									<div class="text-[10px] uppercase tracking-wide text-muted-foreground">Win rate</div>
									<div class="mt-0.5 font-medium tabular-nums">
										{s.win_rate == null ? "—" : `${Math.round(s.win_rate * 100)}%`}
									</div>
								</div>
							</div>

							<div class="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
								{#if sym}
									<span class="rounded-md bg-muted px-1.5 py-0.5">{sym}</span>
								{/if}
								{#if s.period_start || s.period_end}
									<span>{formatDate(s.period_start)} → {formatDate(s.period_end)}</span>
								{/if}
							</div>
						</button>

						<div class="mt-3 flex items-center justify-end gap-0.5 border-t pt-2">
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7 cursor-pointer"
								aria-label="Edit session"
								onclick={() => openEdit(s)}
							>
								<PencilSimpleIcon size={14} class="text-muted-foreground" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7 cursor-pointer"
								aria-label={s.archived ? "Restore session" : "Archive session"}
								onclick={() => toggleArchive(s)}
							>
								<ArchiveIcon size={14} class="text-muted-foreground" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7 cursor-pointer text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
								aria-label="Delete session"
								onclick={() => remove(s)}
							>
								<TrashIcon size={14} />
							</Button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</ScrollArea>

<Dialog.Root bind:open={formOpen} onOpenChange={(o: boolean) => { if (!o) resetForm(); }}>
	<Dialog.Content class="w-[min(100vw,520px)] sm:max-w-[520px] p-0 gap-0">
		<Dialog.Header class="px-5 pt-5 pb-3 border-b">
			<Dialog.Title>{editingId ? "Edit session" : "New backtest session"}</Dialog.Title>
			<Dialog.Description>
				{editingId
					? "Update session details."
					: "Group hypothetical trades under a named strategy run."}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 px-5 py-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Name</div>
				<Input bind:value={formName} placeholder="e.g. ORB on NQ — May 2026" class="rounded-md" />
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Description</div>
				<textarea
					bind:value={formDescription}
					rows="2"
					class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1"
					placeholder="Optional — strategy rules, entry triggers, exit logic"
				></textarea>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Instrument (optional)</div>
					<Select.Root type="single" bind:value={formInstrumentId as string}>
						<Select.Trigger class="w-full rounded-md cursor-pointer">
							<span>{instrumentSymbol(formInstrumentId) ?? "Any"}</span>
						</Select.Trigger>
						<Select.Content class="rounded-md">
							{#each instrumentStore.instruments ?? [] as i}
								<Select.Item value={i.id} class="cursor-pointer">{i.symbol}</Select.Item>
							{:else}
								<div class="px-2 py-3 text-center text-xs text-muted-foreground">No instruments yet.</div>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Starting balance ($)</div>
					<Input bind:value={formStartingBalance} inputmode="decimal" placeholder="Optional" class="rounded-md" />
				</div>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Max loss limit ($)</div>
				<Input bind:value={formMaxLossLimit} inputmode="decimal" placeholder="Optional" class="rounded-md" />
				<p class="text-[11px] text-muted-foreground leading-snug">Optional — the session is marked failed if its net loss reaches this amount.</p>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Period start</div>
					<DateTimePicker value={formPeriodStart} onValueChange={(v) => (formPeriodStart = v)} clearable dateOnly />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Period end</div>
					<DateTimePicker value={formPeriodEnd} onValueChange={(v) => (formPeriodEnd = v)} clearable dateOnly />
				</div>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Notes</div>
				<textarea
					bind:value={formNotes}
					rows="2"
					class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1"
					placeholder="Optional"
				></textarea>
			</div>
		</div>

		<Dialog.Footer class="border-t px-5 py-3">
			<div class="flex w-full justify-end gap-2">
				<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (formOpen = false)}>Cancel</Button>
				<Button class="rounded-md cursor-pointer" disabled={saving} onclick={submit}>
					{saving ? "Saving…" : editingId ? "Save changes" : "Create session"}
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
