<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import * as Select from "$lib/components/ui/select/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Button } from "$lib/components/ui/button";
	import { CaretLeftIcon, CaretRightIcon, ShareNetworkIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore, type TradeCalendarRow } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import PnlShareDialog from "$lib/components/pnl-share-sheet/pnl-share-dialog.svelte";

	const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	const MONTHS = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	];

	/** Sentinel for the account filter's combined-book option. */
	const ALL_ACCOUNTS = "all";

	let session = $state<{ user: { id: string } } | null>(null);
	let today = new Date();
	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth());
	let shareOpen = $state(false);
	let calendarRows = $state<TradeCalendarRow[]>([]);
	let selectedAccountId = $state<string>(ALL_ACCOUNTS);
	/** Day the share card is showing, as a `yyyy-mm-dd` key. */
	let shareDayKey = $state<string | null>(null);
	let dayShareOpen = $state(false);

	function openDayShare(key: string) {
		shareDayKey = key;
		dayShareOpen = true;
	}

	function prevMonth() {
		if (viewMonth === 0) { viewMonth = 11; viewYear--; }
		else viewMonth--;
	}

	function nextMonth() {
		if (viewMonth === 11) { viewMonth = 0; viewYear++; }
		else viewMonth++;
	}

	function toLocalDateKey(iso: string): string {
		const d = new Date(iso);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	}

	/** Rows narrowed to the account filter. Empty filter = the combined book. */
	const visibleRows = $derived(
		selectedAccountId === ALL_ACCOUNTS
			? calendarRows
			: calendarRows.filter((r) => r.account_id === selectedAccountId)
	);

	/**
	 * Per-day buckets, keyed by local `closed_at` day. Each bucket keeps every
	 * trade's P&L in chronological order — a trade is one complete round-trip
	 * position (flat → open → flat), which is exactly one `trades` row, so
	 * scale-in and scale-out fills within a position never add entries. The day
	 * share card reads `pnls` directly; the grid only needs the sum and length.
	 */
	const dayIndex = $derived.by(() => {
		const rows = visibleRows
			.filter((r) => r.closed_at)
			.slice()
			.sort((a, b) => a.closed_at!.localeCompare(b.closed_at!));

		const map = new Map<string, { pnls: number[]; accounts: Set<string> }>();
		for (const t of rows) {
			const key = toLocalDateKey(t.closed_at!);
			let bucket = map.get(key);
			if (!bucket) {
				bucket = { pnls: [], accounts: new Set() };
				map.set(key, bucket);
			}
			bucket.pnls.push(typeof t.pnl === "number" ? t.pnl : Number(t.pnl ?? 0));
			if (t.account_id) bucket.accounts.add(t.account_id);
		}
		return map;
	});

	const pnlByDay = $derived.by(() => {
		const map = new Map<string, number>();
		for (const [key, bucket] of dayIndex) {
			map.set(key, bucket.pnls.reduce((sum, p) => sum + p, 0));
		}
		return map;
	});

	const countByDay = $derived.by(() => {
		const map = new Map<string, number>();
		for (const [key, bucket] of dayIndex) map.set(key, bucket.pnls.length);
		return map;
	});

	function accountName(id: string): string | undefined {
		return accountStore.accounts.find((a) => a.id === id)?.name;
	}

	/**
	 * The scope line printed on a share card: the account name when a single
	 * account produced the numbers, otherwise a count like "3 accounts". This
	 * lives on the card only — the calendar grid never shows it.
	 */
	function accountLabelFor(accounts: Set<string>): string | null {
		if (selectedAccountId !== ALL_ACCOUNTS) return accountName(selectedAccountId) ?? null;
		if (accounts.size === 0) return null;
		if (accounts.size === 1) return accountName([...accounts][0]) ?? "1 account";
		return `${accounts.size} accounts`;
	}

	/** Bars for the day share card — one per trade closed that day. */
	function toBars(pnls: number[]) {
		if (pnls.length === 0) return [];
		const max = Math.max(...pnls.map((p) => Math.abs(p)));
		return pnls.map((pnl) => ({ pnl, pct: max > 0 ? Math.abs(pnl) / max : 0 }));
	}

	const calendarDays = $derived.by(() => {
		const firstDay = new Date(viewYear, viewMonth, 1);
		const startOffset = (firstDay.getDay() + 6) % 7;
		const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
		const days: Array<{ date: Date; key: string; inMonth: boolean }> = [];

		for (let i = startOffset - 1; i >= 0; i--) {
			const d = new Date(viewYear, viewMonth, -i);
			days.push({ date: d, key: toLocalDateKey(d.toISOString()), inMonth: false });
		}
		for (let i = 1; i <= daysInMonth; i++) {
			const d = new Date(viewYear, viewMonth, i);
			days.push({ date: d, key: toLocalDateKey(d.toISOString()), inMonth: true });
		}
		const remainder = days.length % 7;
		if (remainder !== 0) {
			for (let i = 1; i <= 7 - remainder; i++) {
				const d = new Date(viewYear, viewMonth + 1, i);
				days.push({ date: d, key: toLocalDateKey(d.toISOString()), inMonth: false });
			}
		}
		return days;
	});

	const monthStats = $derived.by(() => {
		const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
		let total = 0;
		let best = -Infinity;
		let worst = Infinity;
		let tradingDays = 0;
		let winDays = 0;

		for (const [key, pnl] of pnlByDay) {
			if (!key.startsWith(prefix)) continue;
			total += pnl;
			if (pnl > 0 && pnl > best) best = pnl;
			if (pnl < 0 && pnl < worst) worst = pnl;
			tradingDays++;
			if (pnl > 0) winDays++;
		}

		return {
			total,
			best: best === -Infinity ? null : best,
			worst: worst === Infinity ? null : worst,
			tradingDays,
			winRate: tradingDays > 0 ? winDays / tradingDays : null,
		};
	});

	/** Day bars for the share card mini chart — only days in the viewed month. */
	const dayBars = $derived.by(() => {
		const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
		const entries: { key: string; pnl: number; pct: number }[] = [];
		for (const [key, pnl] of pnlByDay) {
			if (key.startsWith(prefix)) entries.push({ key, pnl, pct: 0 });
		}
		entries.sort((a, b) => a.key.localeCompare(b.key));
		if (entries.length === 0) return entries;
		const max = Math.max(...entries.map((e) => Math.abs(e.pnl)));
		entries.forEach((e) => { e.pct = max > 0 ? Math.abs(e.pnl) / max : 0; });
		return entries;
	});

	/** Accounts that actually traded in the viewed month, for the share card. */
	const monthAccountLabel = $derived.by(() => {
		const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
		const accounts = new Set<string>();
		for (const [key, bucket] of dayIndex) {
			if (!key.startsWith(prefix)) continue;
			for (const id of bucket.accounts) accounts.add(id);
		}
		return accountLabelFor(accounts);
	});

	const dayShare = $derived.by(() => {
		if (!shareDayKey) return null;
		const bucket = dayIndex.get(shareDayKey);
		if (!bucket) return null;

		const { pnls } = bucket;
		const wins = pnls.filter((p) => p > 0).length;
		const decided = pnls.filter((p) => p !== 0).length;

		return {
			date: shareDayKey,
			accountLabel: accountLabelFor(bucket.accounts),
			tradeBars: toBars(pnls),
			stats: {
				total: pnls.reduce((sum, p) => sum + p, 0),
				trades: pnls.length,
				winRate: decided > 0 ? wins / decided : null,
				best: pnls.length > 0 ? Math.max(...pnls) : null,
				worst: pnls.length > 0 ? Math.min(...pnls) : null,
			},
		};
	});

	function formatUsd(v: number | null, sign = true) {
		if (v == null) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: "USD",
			signDisplay: sign ? "exceptZero" : "auto",
		}).format(v);
	}

	function isToday(date: Date) {
		return (
			date.getFullYear() === today.getFullYear() &&
			date.getMonth() === today.getMonth() &&
			date.getDate() === today.getDate()
		);
	}

	const selectedAccountLabel = $derived(
		selectedAccountId === ALL_ACCOUNTS
			? "All accounts"
			: accountName(selectedAccountId) ?? "All accounts"
	);

	onMount(async () => {
		const { data: { session: s } } = await supabase.auth.getSession();
		session = s;
	});

	// Spans every account — the calendar is a whole-book view, so it deliberately
	// ignores the active account selection.
	$effect(() => {
		if (!session?.user?.id) return;
		void tradeStore.getCalendarSummary(supabase).then((rows) => {
			calendarRows = rows;
		});
	});
</script>

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Tools</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>P&L Calendar</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet dayBody(
	date: Date,
	pnl: number | undefined,
	count: number,
	inMonth: boolean,
	hasTrades: boolean,
	isProfit: boolean,
	isLoss: boolean,
	isBreakeven: boolean
)}
	<div class={[
		"text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
		!inMonth && "text-muted-foreground/40",
		inMonth && !hasTrades && "text-muted-foreground",
		isToday(date) && "bg-primary text-primary-foreground",
		!isToday(date) && isProfit && "text-emerald-700 dark:text-emerald-400",
		!isToday(date) && isLoss && "text-rose-700 dark:text-rose-400",
		!isToday(date) && isBreakeven && "text-muted-foreground",
	]}>
		{date.getDate()}
	</div>
	{#if hasTrades && inMonth}
		<div class="mt-auto flex flex-col gap-0.5">
			<div class={[
				"text-xs font-semibold tabular-nums",
				isProfit && "text-emerald-700 dark:text-emerald-400",
				isLoss && "text-rose-700 dark:text-rose-400",
				isBreakeven && "text-muted-foreground",
			]}>
				{formatUsd(pnl!)}
			</div>
			<div class="text-[10px] text-muted-foreground tabular-nums">
				{count} {count === 1 ? "trade" : "trades"}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">The P&L Calendar shows your daily profit and loss laid out in a calendar grid so you can spot patterns across the week or month.</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Every day combines all of your accounts by default. Use the account filter to narrow it to one.</li>
			<li>Green days are profitable, red days are losing days.</li>
			<li>Navigate between months using the arrow buttons at the top of the calendar.</li>
			<li>Use the share button to export the whole month as an image, or click any day with trades to share just that day.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-4 p-4 md:p-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">P&L Calendar</h1>
				<p class="text-sm text-muted-foreground">Daily profit and loss from closed trades across all accounts.</p>
			</div>
			<div class="flex items-center gap-2">
				<Select.Root type="single" bind:value={selectedAccountId}>
					<Select.Trigger class="w-[190px] rounded-md cursor-pointer" aria-label="Filter by account">
						<span class="truncate">{selectedAccountLabel}</span>
					</Select.Trigger>
					<Select.Content class="rounded-md">
						<Select.Item value={ALL_ACCOUNTS} class="cursor-pointer">
							<div class="flex flex-col">
								<span>All accounts</span>
								<span class="text-[10px] text-muted-foreground">Combined book</span>
							</div>
						</Select.Item>
						{#each accountStore.accounts as a (a.id)}
							<Select.Item value={a.id} class="cursor-pointer">
								<div class="flex flex-col">
									<span>{a.name}</span>
									<span class="text-[10px] text-muted-foreground capitalize">{a.account_type ?? ""}</span>
								</div>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				<Button
					variant="outline"
					class="cursor-pointer rounded-md"
					onclick={() => (shareOpen = true)}
				>
					<ShareNetworkIcon size={16} />
					Share
				</Button>
			</div>
		</div>

		<!-- Month stats -->
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Monthly P&L</div>
				<div class={[
					"mt-1 text-2xl font-semibold tabular-nums",
					monthStats.total > 0 && "text-emerald-700 dark:text-emerald-400",
					monthStats.total < 0 && "text-rose-700 dark:text-rose-400",
				]}>
					{formatUsd(monthStats.total)}
				</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Trading days</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{monthStats.tradingDays || "—"}</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Best day</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
					{formatUsd(monthStats.best ?? 0)}
				</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Worst day</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
					{formatUsd(monthStats.worst ?? 0)}
				</div>
			</div>
		</div>

		<!-- Calendar -->
		<div class="rounded-md border bg-background">
			<div class="flex items-center justify-between border-b px-4 py-3">
				<Button variant="ghost" size="icon" class="h-8 w-8 cursor-pointer" onclick={prevMonth}>
					<CaretLeftIcon size={16} />
				</Button>
				<div class="text-sm font-semibold">{MONTHS[viewMonth]} {viewYear}</div>
				<Button variant="ghost" size="icon" class="h-8 w-8 cursor-pointer" onclick={nextMonth}>
					<CaretRightIcon size={16} />
				</Button>
			</div>

			<div class="grid grid-cols-7 border-b">
				{#each DAYS as day}
					<div class="py-2 text-center text-xs font-medium text-muted-foreground">{day}</div>
				{/each}
			</div>

			<div class="grid grid-cols-7">
				{#each calendarDays as { date, key, inMonth }, i}
					{@const pnl = pnlByDay.get(key)}
					{@const count = countByDay.get(key) ?? 0}
					{@const hasTrades = pnl !== undefined}
					{@const isProfit = hasTrades && pnl! > 0}
					{@const isLoss = hasTrades && pnl! < 0}
					{@const isBreakeven = hasTrades && pnl === 0}
					{@const lastInRow = (i + 1) % 7 === 0}
					{@const shareable = hasTrades && inMonth}
					{@const cellClass = [
						"min-h-[80px] p-2 flex flex-col text-left",
						!lastInRow && "border-r",
						i < calendarDays.length - 7 && "border-b",
						!inMonth && "bg-muted/20",
						isProfit && "bg-emerald-700/5",
						isLoss && "bg-rose-700/5",
					]}
					{#if shareable}
						<button
							type="button"
							class={[...cellClass, "group relative cursor-pointer transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"]}
							onclick={() => openDayShare(key)}
							aria-label={`Share P&L for ${key}`}
						>
							<span class="absolute right-1.5 top-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
								<ShareNetworkIcon size={12} />
							</span>
							{@render dayBody(date, pnl, count, inMonth, hasTrades, isProfit, isLoss, isBreakeven)}
						</button>
					{:else}
						<div class={cellClass}>
							{@render dayBody(date, pnl, count, inMonth, hasTrades, isProfit, isLoss, isBreakeven)}
						</div>
					{/if}
				{/each}
			</div>
		</div>
	</div>
</ScrollArea>

<PnlShareDialog
	variant="month"
	bind:open={shareOpen}
	month={viewMonth}
	year={viewYear}
	stats={monthStats}
	dayBars={dayBars}
	accountLabel={monthAccountLabel}
/>

{#if dayShare}
	<PnlShareDialog
		variant="day"
		bind:open={dayShareOpen}
		date={dayShare.date}
		stats={dayShare.stats}
		tradeBars={dayShare.tradeBars}
		accountLabel={dayShare.accountLabel}
	/>
{/if}
