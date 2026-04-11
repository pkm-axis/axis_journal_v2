<script lang="ts">
	import { onMount } from "svelte";
	import type { Session } from "@supabase/supabase-js";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import {
		CaretDownIcon,
		CaretUpIcon,
		ChartLineDownIcon,
		ChartLineUpIcon,
		FunnelIcon,
		MagnifyingGlassIcon,
		PlusIcon,
		PulseIcon
	} from "phosphor-svelte";
	import * as Select from "$lib/components/ui/select/index.js";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { supabase } from "$lib/supabase/client";

	/** Row shape from `trading.trades` (PostgREST may return numeric columns as string). */
	type TradeRow = {
		id: string;
		user_id: string;
		account_id: string | null;
		instrument_id: string | null;
		symbol: string;
		market: string | null;
		side: "long" | "short" | null;
		entry_price: string | number;
		exit_price: string | number | null;
		quantity: string | number;
		stop_loss: string | number | null;
		take_profit: string | number | null;
		risk: string | number | null;
		pnl: string | number | null;
		r_multiple: string | number | null;
		status: "open" | "closed";
		opened_at: string;
		closed_at: string | null;
		duration_seconds: number | null;
		notes: string | null;
		created_at: string;
		updated_at: string;
	};

	type SideFilter = "all" | "long" | "short";
	type StatusFilter = "all" | "open" | "closed";

	function toDatetimeLocalValue(d: Date) {
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	let trades = $state<TradeRow[]>([]);
	let session = $state<Session | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let saveError = $state<string | null>(null);
	let saving = $state(false);

	let searchQuery = $state("");
	let directionFilter = $state<SideFilter>("all");
	let statusFilter = $state<StatusFilter>("all");

	let newTradeOpen = $state(false);
	let formSymbol = $state("");
	let formSide = $state<"long" | "short">("long");
	let formStatus = $state<"open" | "closed">("open");
	let formEntryPrice = $state("");
	let formQuantity = $state("1");
	let formOpenedAt = $state(toDatetimeLocalValue(new Date()));
	let formExitPrice = $state("");
	let formClosedAt = $state<string | null>(null);
	let formPnl = $state("");
	let formRMultiple = $state("");
	let formNotes = $state("");

	function resetNewTradeForm() {
		formSymbol = "";
		formSide = "long";
		formStatus = "open";
		formEntryPrice = "";
		formQuantity = "1";
		formOpenedAt = toDatetimeLocalValue(new Date());
		formExitPrice = "";
		formClosedAt = null;
		formPnl = "";
		formRMultiple = "";
		formNotes = "";
	}

	function num(v: string | number | null | undefined): number | undefined {
		if (v == null || v === "") return undefined;
		const n = typeof v === "number" ? v : Number(v);
		return Number.isFinite(n) ? n : undefined;
	}

	const filteredTrades = $derived.by((): TradeRow[] => {
		const q = searchQuery.trim().toLowerCase();
		return trades.filter((t) => {
			if (directionFilter !== "all" && (t.side ?? "") !== directionFilter) return false;
			if (statusFilter !== "all" && t.status !== statusFilter) return false;
			if (!q) return true;
			return (
				t.symbol.toLowerCase().includes(q) ||
				(t.side ?? "").toLowerCase().includes(q) ||
				t.status.toLowerCase().includes(q)
			);
		});
	});

	function formatUsd(value?: number | null) {
		if (value == null || Number.isNaN(value)) return "—";
		return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
	}

	function formatRM(value?: number | null) {
		if (value == null || Number.isNaN(value)) return "—";
		const sign = value > 0 ? "+" : "";
		return `${sign}${value.toFixed(2)}R`;
	}

	function formatPrice(value: string | number | null | undefined) {
		const n = num(value);
		if (n == null) return "—";
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(n);
	}

	function formatQty(value: string | number | null | undefined) {
		const n = num(value);
		if (n == null) return "—";
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(n);
	}

	function formatWhen(iso: string | null | undefined) {
		if (!iso) return "—";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "—";
		return new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit"
		}).format(d);
	}

	const stats = $derived.by(() => {
		const rows = filteredTrades;
		const closed = rows.filter((t) => t.status === "closed");
		const netPnl = rows.reduce((acc, t) => acc + (num(t.pnl) ?? 0), 0);
		const totalR = rows.reduce((acc, t) => acc + (num(t.r_multiple) ?? 0), 0);
		const wins = closed.filter((t) => (num(t.pnl) ?? 0) > 0).length;
		const winRate = closed.length ? wins / closed.length : null;
		return { count: rows.length, netPnl, totalR, winRate };
	});

	async function refreshSessionAndLoad() {
		loadError = null;
		loading = true;
		const { data: { session: s } } = await supabase.auth.getSession();
		session = s;
		await loadTrades();
		loading = false;
	}

	async function loadTrades() {
		loadError = null;
		if (!session) {
			trades = [];
			return;
		}
		const { data, error } = await supabase
			.schema("trading")
			.from("trades")
			.select("*")
			.order("opened_at", { ascending: false });

		if (error) {
			loadError = error.message;
			trades = [];
			return;
		}
		trades = (data ?? []) as TradeRow[];
	}

	async function createTradeFromForm() {
		saveError = null;
		if (!session?.user?.id) {
			saveError = "Sign in to create a trade.";
			return;
		}

		const symbol = formSymbol.trim().toUpperCase();
		const entryPrice = num(formEntryPrice);
		const qty = num(formQuantity);
		if (!symbol || entryPrice == null || qty == null) {
			saveError = "Symbol, entry price, and quantity are required.";
			return;
		}

		saving = true;
		const openedAtIso = new Date(formOpenedAt).toISOString();
		const exitPrice = formStatus === "closed" ? num(formExitPrice) : null;
		const closedAtIso =
			formStatus === "closed" && formClosedAt?.trim()
				? new Date(formClosedAt).toISOString()
				: formStatus === "closed"
					? null
					: null;

		const { error } = await supabase.schema("trading").from("trades").insert({
			user_id: session.user.id,
			symbol,
			market: null,
			side: formSide,
			entry_price: entryPrice,
			quantity: qty,
			opened_at: openedAtIso,
			status: formStatus,
			exit_price: exitPrice,
			closed_at: closedAtIso,
			pnl: num(formPnl) ?? null,
			r_multiple: num(formRMultiple) ?? null,
			notes: formNotes.trim() || null
		});

		saving = false;
		if (error) {
			saveError = error.message;
			return;
		}

		newTradeOpen = false;
		resetNewTradeForm();
		await loadTrades();
	}

	onMount(() => {
		resetNewTradeForm();
		void refreshSessionAndLoad();
		const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
			void refreshSessionAndLoad();
		});
		return () => subscription.unsubscribe();
	});
</script>

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Page>Trades</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>
<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-6xl space-y-4 p-4 md:p-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Trades</h1>
				<p class="text-sm text-muted-foreground">Create and manage your trades.</p>
			</div>
			<Button
				onclick={() => (newTradeOpen = true)}
				variant="outline"
				class="cursor-pointer rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
				disabled={!session}
			>
				<PlusIcon />
				New Trade
			</Button>
		</div>

		{#if loadError}
			<div class="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
				{loadError}
				<span class="mt-1 block text-xs text-muted-foreground">
					Expose <code class="rounded bg-muted px-1">trading</code> and <code class="rounded bg-muted px-1">app</code> in
					API settings; apply the grant migration in <code class="rounded bg-muted px-1">supabase/migrations/</code>;
					confirm <code class="rounded bg-muted px-1">PUBLIC_SUPABASE_*</code> in <code class="rounded bg-muted px-1">.env</code>.
				</span>
			</div>
		{/if}

		{#if !loading && !session}
			<div class="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
				Sign in with Supabase Auth to load and create trades. Your user must have a row in
				<code class="rounded bg-muted px-1">app.profiles</code> for inserts (FK).
			</div>
		{/if}

		<div class="flex flex-wrap items-center gap-3">
			<div class="relative w-full max-w-sm">
				<Input
					type="text"
					placeholder="Search trades..."
					class="pl-9 rounded-md"
					bind:value={searchQuery}
					disabled={!session}
				/>
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<MagnifyingGlassIcon size={16} class="text-muted-foreground" />
				</div>
			</div>
			<Select.Root type="single" bind:value={directionFilter}>
				<Select.Trigger class="w-[160px] rounded-md cursor-pointer" disabled={!session}>
					<FunnelIcon size={16} class="text-muted-foreground" />
					<span class="capitalize">{directionFilter === "all" ? "All sides" : directionFilter}</span>
				</Select.Trigger>
				<Select.Content class="rounded-md">
					<Select.Item value="all" class="cursor-pointer">All sides</Select.Item>
					<Select.Item value="long" class="cursor-pointer">
						<ChartLineUpIcon class="mr-2 h-4 w-4" />
						Long
					</Select.Item>
					<Select.Item value="short" class="cursor-pointer">
						<ChartLineDownIcon class="mr-2 h-4 w-4" />
						Short
					</Select.Item>
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={statusFilter}>
				<Select.Trigger class="w-[160px] rounded-md cursor-pointer" disabled={!session}>
					<PulseIcon class="mr-2 h-4 w-4" />
					<span class="capitalize">
						{statusFilter === "all" ? "All statuses" : statusFilter}
					</span>
				</Select.Trigger>
				<Select.Content class="rounded-md">
					<Select.Item value="all" class="cursor-pointer">All statuses</Select.Item>
					<Select.Item value="open" class="cursor-pointer">
						<CaretUpIcon size={16} />
						Open
					</Select.Item>
					<Select.Item value="closed" class="cursor-pointer">
						<CaretDownIcon size={16} />
						Closed
					</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>

		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Trades</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{stats.count}</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Net P&amp;L</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{formatUsd(stats.netPnl)}</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Total R</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{formatRM(stats.totalR)}</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Win rate (closed)</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">
					{stats.winRate == null ? "—" : `${Math.round(stats.winRate * 100)}%`}
				</div>
			</div>
		</div>

		<div class="rounded-md border bg-background">
			<div class="flex items-center justify-between gap-3 border-b px-4 py-3">
				<div class="text-sm font-medium">All trades</div>
				<div class="text-xs text-muted-foreground">
					{#if loading}
						Loading…
					{:else}
						Showing <span class="tabular-nums">{filteredTrades.length}</span>
					{/if}
				</div>
			</div>

			{#if loading}
				<div class="p-10 text-center text-sm text-muted-foreground">Loading trades…</div>
			{:else if filteredTrades.length === 0}
				<div class="p-10 text-center">
					<div class="text-sm font-medium">No trades found</div>
					<div class="mt-1 text-sm text-muted-foreground">
						{!session
							? "Sign in to see your trades."
							: trades.length === 0
								? "Create your first trade to see it here."
								: "Try adjusting your search or filters."}
					</div>
					<div class="mt-4 flex justify-center">
						<Button
							onclick={() => (newTradeOpen = true)}
							class="cursor-pointer rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
							disabled={!session}
						>
							<PlusIcon />
							New Trade
						</Button>
					</div>
				</div>
			{:else}
				<div class="w-full overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="bg-muted/30 text-muted-foreground">
							<tr class="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
								<th>Symbol</th>
								<th>Side</th>
								<th>Status</th>
								<th class="text-right">Entry</th>
								<th class="text-right">Exit</th>
								<th class="text-right">Qty</th>
								<th>Opened</th>
								<th>Closed</th>
								<th class="text-right">P&amp;L</th>
								<th class="text-right">R</th>
							</tr>
						</thead>
						<tbody class="[&>tr:not(:last-child)]:border-b">
							{#each filteredTrades as t (t.id)}
								<tr class="[&>td]:px-4 [&>td]:py-3 hover:bg-muted/30">
									<td class="font-medium">{t.symbol}</td>
									<td class="capitalize">{t.side ?? "—"}</td>
									<td class="capitalize">{t.status}</td>
									<td class="text-right tabular-nums">{formatPrice(t.entry_price)}</td>
									<td class="text-right tabular-nums">{formatPrice(t.exit_price)}</td>
									<td class="text-right tabular-nums">{formatQty(t.quantity)}</td>
									<td class="tabular-nums text-xs">{formatWhen(t.opened_at)}</td>
									<td class="tabular-nums text-xs">{formatWhen(t.closed_at)}</td>
									<td class="text-right tabular-nums">
										<span
											class={num(t.pnl) == null ? "" : (num(t.pnl) ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}
										>
											{formatUsd(num(t.pnl))}
										</span>
									</td>
									<td class="text-right tabular-nums">
										<span
											class={num(t.r_multiple) == null
												? ""
												: (num(t.r_multiple) ?? 0) >= 0
													? "text-emerald-600"
													: "text-red-600"}
										>
											{formatRM(num(t.r_multiple))}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<Sheet.Root bind:open={newTradeOpen}>
			<Sheet.Content side="right" class="w-[min(100vw,520px)] sm:max-w-[520px]">
				<Sheet.Header>
					<Sheet.Title>New trade</Sheet.Title>
					<Sheet.Description>
						Inserts into <code class="rounded bg-muted px-1 text-xs">trading.trades</code>. Requires
						Supabase session and <code class="rounded bg-muted px-1 text-xs">app.profiles</code> for your user.
					</Sheet.Description>
				</Sheet.Header>

				{#if saveError}
					<div class="mx-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						{saveError}
					</div>
				{/if}

				<div class="px-4 pb-2 space-y-4">
					<div class="space-y-1.5">
						<div class="text-xs font-medium">Symbol</div>
						<Input bind:value={formSymbol} placeholder="e.g. ES, BTCUSDT" class="rounded-md" />
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Side</div>
							<Select.Root type="single" bind:value={formSide}>
								<Select.Trigger class="w-full rounded-md cursor-pointer">
									<span class="capitalize">{formSide}</span>
								</Select.Trigger>
								<Select.Content class="rounded-md">
									<Select.Item value="long" class="cursor-pointer">
										<ChartLineUpIcon class="mr-2 h-4 w-4" />
										Long
									</Select.Item>
									<Select.Item value="short" class="cursor-pointer">
										<ChartLineDownIcon class="mr-2 h-4 w-4" />
										Short
									</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>

						<div class="space-y-1.5">
							<div class="text-xs font-medium">Status</div>
							<Select.Root type="single" bind:value={formStatus}>
								<Select.Trigger class="w-full rounded-md cursor-pointer">
									<span class="capitalize">{formStatus}</span>
								</Select.Trigger>
								<Select.Content class="rounded-md">
									<Select.Item value="open" class="cursor-pointer">
										<CaretUpIcon size={16} />
										Open
									</Select.Item>
									<Select.Item value="closed" class="cursor-pointer">
										<CaretDownIcon size={16} />
										Closed
									</Select.Item>
								</Select.Content>
							</Select.Root>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Entry price</div>
							<Input bind:value={formEntryPrice} inputmode="decimal" placeholder="Required" class="rounded-md" />
						</div>
						<div class="space-y-1.5">
							<div class="text-xs font-medium">Quantity</div>
							<Input bind:value={formQuantity} inputmode="decimal" placeholder="Required" class="rounded-md" />
						</div>
					</div>

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Opened at</div>
						<Input type="datetime-local" bind:value={formOpenedAt} class="rounded-md" />
					</div>

					{#if formStatus === "closed"}
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Exit price</div>
								<Input bind:value={formExitPrice} inputmode="decimal" placeholder="Optional" class="rounded-md" />
							</div>
							<div class="space-y-1.5">
								<div class="text-xs font-medium">Closed at</div>
								<Input
									type="datetime-local"
									value={formClosedAt ?? ""}
									oninput={(e) => (formClosedAt = (e.currentTarget as HTMLInputElement).value || null)}
									class="rounded-md"
								/>
							</div>
						</div>
					{/if}

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<div class="text-xs font-medium">P&amp;L</div>
							<Input bind:value={formPnl} inputmode="decimal" placeholder="Optional" class="rounded-md" />
						</div>
						<div class="space-y-1.5">
							<div class="text-xs font-medium">R multiple</div>
							<Input bind:value={formRMultiple} inputmode="decimal" placeholder="Optional" class="rounded-md" />
						</div>
					</div>

					<div class="space-y-1.5">
						<div class="text-xs font-medium">Notes</div>
						<textarea
							bind:value={formNotes}
							rows="3"
							class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
							placeholder="Optional"
						></textarea>
					</div>
				</div>

				<Sheet.Footer class="border-t">
					<div class="flex justify-end gap-2">
						<Button
							variant="outline"
							class="rounded-md cursor-pointer"
							onclick={() => {
								newTradeOpen = false;
								saveError = null;
								resetNewTradeForm();
							}}
						>
							Cancel
						</Button>
						<Button
							class="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground cursor-pointer"
							disabled={!formSymbol.trim() || saving || !session}
							onclick={createTradeFromForm}
						>
							{saving ? "Saving…" : "Create trade"}
						</Button>
					</div>
				</Sheet.Footer>
			</Sheet.Content>
		</Sheet.Root>
	</div>
</ScrollArea>
