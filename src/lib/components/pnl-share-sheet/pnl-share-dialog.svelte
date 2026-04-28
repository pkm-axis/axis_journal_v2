<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Button } from "$lib/components/ui/button";
	import { DownloadSimpleIcon } from "phosphor-svelte";
	import { toPng } from "html-to-image";

	const MONTHS = [
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December"
	];

	type MonthStats = {
		total: number;
		tradingDays: number;
		winRate: number | null;
		best: number | null;
		worst: number | null;
	};

	type DayBar = { pnl: number; pct: number };

	type MonthProps = {
		variant: "month";
		month: number;
		year: number;
		stats: MonthStats;
		dayBars: DayBar[];
	};

	type TradeProps = {
		variant: "trade";
		symbol: string;
		side: "long" | "short" | null;
		status: "open" | "closed";
		pnl: number | null;
		entryPrice: number | null;
		exitPrice: number | null;
		quantity: number | null;
		rr: number | null;
		openedAt: string | null;
		closedAt: string | null;
	};

	type Props = { open: boolean } & (MonthProps | TradeProps);

	let { open = $bindable(false), ...data }: Props = $props();

	let cardEl = $state<HTMLDivElement | null>(null);
	let downloading = $state(false);

	const filename = $derived(
		data.variant === "month"
			? `pnl-${MONTHS[data.month].toLowerCase()}-${data.year}.png`
			: `trade-${data.variant === "trade" ? data.symbol : "card"}.png`
	);

	const title = $derived(data.variant === "month" ? "Share P&L Card" : "Share Trade");
	const description = $derived(
		data.variant === "month"
			? "Download your monthly summary as an image to share anywhere."
			: "Download this trade as an image to share anywhere."
	);

	async function download() {
		if (!cardEl) return;
		downloading = true;
		try {
			const dataUrl = await toPng(cardEl, { pixelRatio: 2 });
			const a = document.createElement("a");
			a.href = dataUrl;
			a.download = filename;
			a.click();
		} finally {
			downloading = false;
		}
	}

	function fmt(v: number | null, sign = true) {
		if (v == null) return "—";
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: "USD",
			signDisplay: sign ? "exceptZero" : "auto",
		}).format(v);
	}

	function fmtNum(v: number | null) {
		if (v == null) return "—";
		return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(v);
	}

	function fmtWhen(iso: string | null) {
		if (!iso) return "—";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "—";
		return new Intl.DateTimeFormat(undefined, {
			month: "short", day: "numeric", year: "numeric",
			hour: "2-digit", minute: "2-digit",
		}).format(d);
	}

	function fmtRR(rr: number | null) {
		if (rr == null || !Number.isFinite(rr)) return "—";
		return `1:${rr.toFixed(2)}`;
	}

	const pnlColor = (pnl: number | null) =>
		pnl != null && pnl > 0 ? "#4ade80" : pnl != null && pnl < 0 ? "#f87171" : "#e2e8f0";

	type Theme = {
		id: "midnight" | "sage" | "plum";
		label: string;
		bg: string;
		accent: string;
		divider: string;
		swatch: string;
	};

	const THEMES: Theme[] = [
		{
			id: "midnight",
			label: "Midnight",
			bg: "linear-gradient(135deg, #0f1117 0%, #1a1f2e 100%)",
			accent: "#6b8f6e",
			divider: "#1e293b",
			swatch: "#1a1f2e",
		},
		{
			id: "sage",
			label: "Sage",
			bg: "linear-gradient(135deg, #0d1f15 0%, #1a3a25 100%)",
			accent: "#86efac",
			divider: "#1f3b29",
			swatch: "#1a3a25",
		},
		{
			id: "plum",
			label: "Plum",
			bg: "linear-gradient(135deg, #15101f 0%, #2d1b3d 100%)",
			accent: "#c084fc",
			divider: "#2a1f3a",
			swatch: "#2d1b3d",
		},
	];

	let selectedThemeId = $state<Theme["id"]>("midnight");
	const theme = $derived(THEMES.find((t) => t.id === selectedThemeId) ?? THEMES[0]);
</script>

<Dialog.Root bind:open onOpenChange={(o) => { if (!o) open = false; }}>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<!-- Theme picker -->
			<div class="flex items-center gap-2">
				<span class="text-xs font-medium text-muted-foreground">Theme</span>
				<div class="flex gap-1.5">
					{#each THEMES as t}
						<button
							type="button"
							onclick={() => (selectedThemeId = t.id)}
							class={[
								"flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors",
								selectedThemeId === t.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30",
							]}
							aria-pressed={selectedThemeId === t.id}
						>
							<span class="size-3 rounded-full border border-black/20" style={`background:${t.swatch}`}></span>
							{t.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Shared card shell -->
			<div
				bind:this={cardEl}
				class="relative overflow-hidden rounded-xl p-10 select-none"
				style={`background:${theme.bg}; font-family: 'JetBrains Mono Variable', monospace;`}
			>
				<!-- Branding row -->
				<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
					<div style="display:flex; align-items:center; gap:8px;">
						<div style={`display:flex; width:28px; height:28px; align-items:center; justify-content:center; background:${theme.accent}; flex-shrink:0;`}>
							<svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M7 1L13 13H1L7 1Z" fill="white" />
							</svg>
						</div>
						<span style="color:#e2e8f0; font-size:13px; font-weight:700; letter-spacing:0.15em;">AXIS</span>
					</div>

					{#if data.variant === "month"}
						<span style="color:#64748b; font-size:11px; font-weight:500;">
							{MONTHS[data.month]} {data.year}
						</span>
					{:else}
						<div style="display:flex; align-items:center; gap:6px;">
							<span style={`display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:${data.side === 'long' ? '#4ade8022' : '#f8717122'}; color:${data.side === 'long' ? '#4ade80' : '#f87171'};`}>
								{data.side?.toUpperCase() ?? "—"}
							</span>
							<span style={`display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; background:${data.status === 'open' ? '#fbbf2422' : '#64748b22'}; color:${data.status === 'open' ? '#fbbf24' : '#94a3b8'};`}>
								{data.status.toUpperCase()}
							</span>
						</div>
					{/if}
				</div>

				{#if data.variant === "month"}
					<!-- Month: big P&L label + number -->
					<div style="color:#94a3b8; font-size:11px; font-weight:500; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:4px;">Net P&L</div>
					<div style={`font-size:clamp(2rem,8vw,3rem); font-weight:700; letter-spacing:-0.02em; line-height:1; margin-bottom:20px; color:${pnlColor(data.stats.total)};`}>
						{data.stats.tradingDays === 0 ? "—" : fmt(data.stats.total)}
					</div>

					<!-- Mini bar chart -->
					{#if data.dayBars.length > 0}
						<div style="display:flex; align-items:flex-end; gap:2px; height:40px; margin-bottom:20px;">
							{#each data.dayBars as bar}
								<div
									style={`flex:1; border-radius:2px; height:${Math.max(4, bar.pct * 40)}px; background:${bar.pnl > 0 ? '#4ade8055' : '#f8717155'}; border-top:2px solid ${bar.pnl > 0 ? '#4ade80' : '#f87171'};`}
								></div>
							{/each}
						</div>
					{/if}

					<!-- Month stats row -->
					<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">
						<div>
							<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Trading days</div>
							<div style="color:#e2e8f0; font-size:16px; font-weight:600;">{data.stats.tradingDays || "—"}</div>
						</div>
						<div>
							<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Win rate</div>
							<div style="color:#e2e8f0; font-size:16px; font-weight:600;">
								{data.stats.winRate == null ? "—" : `${Math.round(data.stats.winRate * 100)}%`}
							</div>
						</div>
						<div>
							<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Best day</div>
							<div style="color:#4ade80; font-size:16px; font-weight:600;">{fmt(data.stats.best)}</div>
						</div>
					</div>

				{:else}
					<!-- Trade: symbol + P&L -->
					<div style="color:#94a3b8; font-size:11px; font-weight:500; letter-spacing:0.05em; text-transform:uppercase; margin-bottom:2px;">Symbol</div>
					<div style="color:#e2e8f0; font-size:2rem; font-weight:700; letter-spacing:-0.02em; line-height:1; margin-bottom:4px;">{data.symbol}</div>
					<div style={`font-size:1.5rem; font-weight:700; margin-bottom:20px; color:${pnlColor(data.pnl)};`}>
						{fmt(data.pnl)}
					</div>

					<!-- Trade stats grid -->
					<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">
						<div>
							<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Entry</div>
							<div style="color:#e2e8f0; font-size:13px; font-weight:600;">{fmtNum(data.entryPrice)}</div>
						</div>
						<div>
							<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Exit</div>
							<div style="color:#e2e8f0; font-size:13px; font-weight:600;">{fmtNum(data.exitPrice)}</div>
						</div>
						<div>
							<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">R:R</div>
							<div style="color:#e2e8f0; font-size:13px; font-weight:600;">{fmtRR(data.rr)}</div>
						</div>
						<div>
							<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Qty</div>
							<div style="color:#e2e8f0; font-size:13px; font-weight:600;">{fmtNum(data.quantity)}</div>
						</div>
						<div>
							<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Opened</div>
							<div style="color:#e2e8f0; font-size:13px; font-weight:600;">{fmtWhen(data.openedAt)}</div>
						</div>
						{#if data.closedAt}
							<div>
								<div style="color:#64748b; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Closed</div>
								<div style="color:#e2e8f0; font-size:13px; font-weight:600;">{fmtWhen(data.closedAt)}</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Watermark -->
				<div style={`margin-top:20px; padding-top:12px; border-top:1px solid ${theme.divider}; display:flex; justify-content:flex-end;`}>
					<span style="color:#334155; font-size:10px; letter-spacing:0.05em;">axis journal</span>
				</div>
			</div>

			{#if data.variant === "month"}
				<p class="text-xs text-muted-foreground">
					Only closed trades for {MONTHS[data.month]} {data.year} are included.
				</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (open = false)}>
				Cancel
			</Button>
			<Button
				class="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
				disabled={downloading}
				onclick={download}
			>
				<DownloadSimpleIcon size={16} />
				{downloading ? "Saving…" : "Download PNG"}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
