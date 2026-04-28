<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Button } from "$lib/components/ui/button";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { CaretLeftIcon, CaretRightIcon, ShareNetworkIcon, DownloadSimpleIcon } from "phosphor-svelte";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { toPng } from "html-to-image";

	const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	const MONTHS = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	];

	let session = $state<{ user: { id: string } } | null>(null);
	let today = new Date();
	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth());
	let shareOpen = $state(false);
	let shareCardEl = $state<HTMLDivElement | null>(null);
	let downloading = $state(false);

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

	const pnlByDay = $derived.by(() => {
		const map = new Map<string, number>();
		for (const t of tradeStore.trades) {
			if (t.status !== "closed" || !t.closed_at) continue;
			const key = toLocalDateKey(t.closed_at);
			const pnl = typeof t.pnl === "number" ? t.pnl : Number(t.pnl ?? 0);
			map.set(key, (map.get(key) ?? 0) + pnl);
		}
		return map;
	});

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
			if (pnl > best) best = pnl;
			if (pnl < worst) worst = pnl;
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
		const entries: { key: string; pnl: number }[] = [];
		for (const [key, pnl] of pnlByDay) {
			if (key.startsWith(prefix)) entries.push({ key, pnl });
		}
		entries.sort((a, b) => a.key.localeCompare(b.key));
		if (entries.length === 0) return entries;
		const max = Math.max(...entries.map((e) => Math.abs(e.pnl)));
		return entries.map((e) => ({ ...e, pct: max > 0 ? Math.abs(e.pnl) / max : 0 }));
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

	async function downloadCard() {
		if (!shareCardEl) return;
		downloading = true;
		try {
			const dataUrl = await toPng(shareCardEl, { pixelRatio: 2 });
			const a = document.createElement("a");
			a.href = dataUrl;
			a.download = `pnl-${MONTHS[viewMonth].toLowerCase()}-${viewYear}.png`;
			a.click();
		} finally {
			downloading = false;
		}
	}

	onMount(async () => {
		const { data: { session: s } } = await supabase.auth.getSession();
		session = s;
	});

	$effect(() => {
		if (!session?.user?.id) return;
		void accountStore.activeAccountId;
		void tradeStore.getTradesByAccount(supabase);
	});
</script>

<HeaderNavbar links={true}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Tools</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>P&L Calendar</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-5xl space-y-4 p-4 md:p-6">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">P&L Calendar</h1>
				<p class="text-sm text-muted-foreground">Daily profit and loss from closed trades.</p>
			</div>
			<Button
				variant="outline"
				class="cursor-pointer rounded-md"
				onclick={() => (shareOpen = true)}
			>
				<ShareNetworkIcon size={16} />
				Share
			</Button>
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
					{monthStats.tradingDays === 0 ? "—" : formatUsd(monthStats.total)}
				</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Trading days</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums">{monthStats.tradingDays || "—"}</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Best day</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
					{formatUsd(monthStats.best)}
				</div>
			</div>
			<div class="rounded-md border bg-background p-4">
				<div class="text-xs text-muted-foreground">Worst day</div>
				<div class="mt-1 text-2xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
					{formatUsd(monthStats.worst)}
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
					{@const hasTrades = pnl !== undefined}
					{@const isProfit = hasTrades && pnl! > 0}
					{@const isLoss = hasTrades && pnl! < 0}
					{@const isBreakeven = hasTrades && pnl === 0}
					{@const lastInRow = (i + 1) % 7 === 0}
					<div class={[
						"min-h-[80px] p-2 flex flex-col",
						!lastInRow && "border-r",
						i < calendarDays.length - 7 && "border-b",
						!inMonth && "bg-muted/20",
						isProfit && "bg-emerald-700/5",
						isLoss && "bg-rose-700/5",
					]}>
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
							<div class={[
								"mt-auto text-xs font-semibold tabular-nums",
								isProfit && "text-emerald-700 dark:text-emerald-400",
								isLoss && "text-rose-700 dark:text-rose-400",
								isBreakeven && "text-muted-foreground",
							]}>
								{formatUsd(pnl!)}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>
</ScrollArea>

<!-- Share sheet -->
<Sheet.Root bind:open={shareOpen} onOpenChange={(o) => { if (!o) shareOpen = false; }}>
	<Sheet.Content side="right" class="w-[min(100vw,520px)] sm:max-w-[520px]">
		<Sheet.Header>
			<Sheet.Title>Share P&L Card</Sheet.Title>
			<Sheet.Description>
				Download your monthly summary as an image to share anywhere.
			</Sheet.Description>
		</Sheet.Header>

		<div class="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
			<!-- Card preview -->
			<div
				bind:this={shareCardEl}
				class="relative overflow-hidden rounded-xl p-6 select-none"
				style="background: linear-gradient(135deg, #0f1117 0%, #1a1f2e 100%); font-family: 'JetBrains Mono Variable', monospace;"
			>
				<!-- Top row: branding + period -->
				<div class="flex items-center justify-between mb-6">
					<div class="flex items-center gap-2">
						<div class="flex size-7 shrink-0 items-center justify-center" style="background:#6b8f6e;">
							<svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M7 1L13 13H1L7 1Z" fill="white" />
							</svg>
						</div>
						<span style="color:#e2e8f0; font-size:13px; font-weight:700; letter-spacing:0.15em;">AXIS</span>
					</div>
					<span style="color:#64748b; font-size:11px; font-weight:500;">
						{MONTHS[viewMonth]} {viewYear}
					</span>
				</div>

				<!-- Big P&L number -->
				<div class="mb-1" style="color:#94a3b8; font-size:11px; font-weight:500; letter-spacing:0.05em; text-transform:uppercase;">
					Net P&L
				</div>
				<div class="mb-6" style={`font-size: clamp(2rem, 8vw, 3rem); font-weight:700; letter-spacing:-0.02em; line-height:1; color:${monthStats.total > 0 ? '#4ade80' : monthStats.total < 0 ? '#f87171' : '#e2e8f0'};`}>
					{monthStats.tradingDays === 0 ? "—" : formatUsd(monthStats.total)}
				</div>

				<!-- Mini bar chart -->
				{#if dayBars.length > 0}
					<div class="flex items-end gap-0.5 mb-6" style="height:40px;">
						{#each dayBars as bar}
							<div
								class="flex-1 rounded-sm"
								style={`height:${Math.max(4, bar.pct * 40)}px; background:${bar.pnl > 0 ? '#4ade8055' : '#f8717155'}; border-top:2px solid ${bar.pnl > 0 ? '#4ade80' : '#f87171'};`}
							></div>
						{/each}
					</div>
				{/if}

				<!-- Stats row -->
				<div class="grid grid-cols-3 gap-3">
					<div>
						<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Trading days</div>
						<div style="color:#e2e8f0; font-size:16px; font-weight:600;">{monthStats.tradingDays || "—"}</div>
					</div>
					<div>
						<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Win rate</div>
						<div style="color:#e2e8f0; font-size:16px; font-weight:600;">
							{monthStats.winRate == null ? "—" : `${Math.round(monthStats.winRate * 100)}%`}
						</div>
					</div>
					<div>
						<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Best day</div>
						<div style="color:#4ade80; font-size:16px; font-weight:600;">{formatUsd(monthStats.best)}</div>
					</div>
				</div>

				<!-- Bottom divider + watermark -->
				<div style="margin-top:20px; padding-top:12px; border-top:1px solid #1e293b; display:flex; justify-content:flex-end;">
					<span style="color:#334155; font-size:10px; letter-spacing:0.05em;">axis journal</span>
				</div>
			</div>

			<p class="text-xs text-muted-foreground">
				Only closed trades for {MONTHS[viewMonth]} {viewYear} are included.
			</p>
		</div>

		<Sheet.Footer class="border-t">
			<div class="flex justify-end gap-2">
				<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (shareOpen = false)}>
					Cancel
				</Button>
				<Button
					class="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
					disabled={downloading}
					onclick={downloadCard}
				>
					<DownloadSimpleIcon size={16} />
					{downloading ? "Saving…" : "Download PNG"}
				</Button>
			</div>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
