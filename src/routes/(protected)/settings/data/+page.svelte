<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { instrumentStore } from "$lib/stores/instruments.svelte";
	import { strategyStore } from "$lib/stores/strategies.svelte";
	import { mistakeStore } from "$lib/stores/mistakes.svelte";
	import { getAuthToken } from "$lib/utils/auth-token";
	import { toast } from "svelte-sonner";

	type Scope = "instruments" | "playbook" | "accounts" | "trades";

	const SCOPES: { id: Scope; label: string; describe: string; wipes: string }[] = [
		{
			id: "instruments",
			label: "Instrument commissions",
			describe: "Suggested commission per side for the 10 seeded futures (NQ, ES, MNQ, MES, GC, MGC, CL, MCL, SI, SIL). The catalog itself is global; this only sets your per-side fee.",
			wipes: "Replaces your existing commission overrides.",
		},
		{
			id: "playbook",
			label: "Playbook",
			describe: "4 strategies (Trend Following, Breakout, Mean Reversion, Opening Range Breakout) and 4 common mistakes.",
			wipes: "Replaces all strategies and mistakes.",
		},
		{
			id: "accounts",
			label: "Accounts + sample payout",
			describe: "Apex 50K Evaluation (cost $137), Apex 50K Funded (graduated, 80/20 split), Topstep 150K Evaluation. Includes one $1,800 payout.",
			wipes: "Replaces all accounts — also deletes their trades and payouts.",
		},
		{
			id: "trades",
			label: "Sample trades",
			describe: "~49 trades over 120 days across the 3 prop firm accounts. Mix of wins, losses, mistakes, and 2 open positions.",
			wipes: "Replaces all trades. Requires Instruments and Accounts to exist (seed those at the same time if you haven't).",
		},
	];

	let selected = $state<Record<Scope, boolean>>({
		instruments: true,
		playbook: true,
		accounts: true,
		trades: true,
	});
	let confirmText = $state("");
	let wiping = $state(false);
	let seeding = $state(false);

	const selectedScopes = $derived(SCOPES.filter((s) => selected[s.id]).map((s) => s.id));

	async function seed() {
		if (selectedScopes.length === 0) {
			toast.error("Pick at least one category to seed.");
			return;
		}
		seeding = true;
		try {
			const token = await getAuthToken(supabase);
			const res = await fetch("/api/data/seed", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({ scopes: selectedScopes }),
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Seed failed.");

			const refreshes: Promise<unknown>[] = [];
			if (selected.accounts) refreshes.push(accountStore.getAllAccounts(supabase));
			if (selected.instruments) refreshes.push(instrumentStore.getInstruments(supabase));
			if (selected.playbook) {
				refreshes.push(strategyStore.getStrategies(supabase));
				refreshes.push(mistakeStore.getMistakes(supabase));
			}
			await Promise.all(refreshes);
			if (selected.trades || selected.accounts) {
				await tradeStore.getTradesByAccount(supabase);
			}
			toast.success(result.message);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Seed failed.");
		} finally {
			seeding = false;
		}
	}

	async function wipe() {
		if (confirmText !== "DELETE ALL TRADES") {
			toast.error("Type the confirmation phrase exactly to proceed.");
			return;
		}
		wiping = true;
		try {
			const token = await getAuthToken(supabase);
			const res = await fetch("/api/data/wipe", {
				method: "DELETE",
				credentials: "include",
				headers: { Authorization: `Bearer ${token}` },
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to wipe trades.");
			confirmText = "";
			tradeStore.clear();
			await tradeStore.getTradesByAccount(supabase);
			toast.success("All trades deleted.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to wipe.");
		} finally {
			wiping = false;
		}
	}
</script>

<div class="space-y-8">
	<section class="space-y-3">
		<div>
			<h2 class="text-lg font-semibold">Seed demo data</h2>
			<p class="text-xs text-muted-foreground">
				Pick the categories you want to populate. Each runs independently — re-seeding one
				doesn't touch the others.
			</p>
		</div>

		<div class="rounded-md border bg-background p-4 space-y-3">
			<div class="flex items-center justify-between gap-2 pb-2 border-b">
				<div class="text-xs font-medium">Categories</div>
				<div class="flex items-center gap-3 text-[11px]">
					<button
						type="button"
						class="text-primary hover:underline cursor-pointer"
						onclick={() => {
							for (const s of SCOPES) selected[s.id] = true;
						}}
					>
						Select all
					</button>
					<button
						type="button"
						class="text-muted-foreground hover:underline cursor-pointer"
						onclick={() => {
							for (const s of SCOPES) selected[s.id] = false;
						}}
					>
						Clear
					</button>
				</div>
			</div>

			<div class="space-y-2">
				{#each SCOPES as s (s.id)}
					<label class="flex items-start gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/40">
						<input
							type="checkbox"
							class="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
							bind:checked={selected[s.id]}
						/>
						<div class="min-w-0 flex-1 space-y-1">
							<div class="text-sm font-medium">{s.label}</div>
							<p class="text-[11px] text-muted-foreground leading-snug">{s.describe}</p>
							<p class="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">{s.wipes}</p>
						</div>
					</label>
				{/each}
			</div>

			<div class="flex justify-end">
				<Button
					variant="outline"
					class="rounded-md cursor-pointer"
					disabled={seeding || selectedScopes.length === 0}
					onclick={seed}
				>
					{seeding ? "Seeding…" : `Seed ${selectedScopes.length} categor${selectedScopes.length === 1 ? "y" : "ies"}`}
				</Button>
			</div>
		</div>
	</section>

	<section class="space-y-3">
		<div>
			<h2 class="text-lg font-semibold text-rose-700 dark:text-rose-400">Wipe all trades</h2>
			<p class="text-xs text-muted-foreground">
				Permanently deletes every trade you've recorded across all accounts. Strategies,
				mistakes, accounts, and instruments are kept.
			</p>
		</div>

		<div class="rounded-md border border-rose-700/30 bg-rose-700/5 p-4 space-y-3">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">
					Type <code class="rounded bg-muted px-1 py-0.5 text-[11px]">DELETE ALL TRADES</code> to confirm
				</div>
				<Input bind:value={confirmText} placeholder="DELETE ALL TRADES" class="rounded-md" />
			</div>

<div class="flex justify-end">
				<Button
					variant="outline"
					class="rounded-md cursor-pointer border-rose-700/40 text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
					disabled={wiping || confirmText !== "DELETE ALL TRADES"}
					onclick={wipe}
				>
					{wiping ? "Wiping…" : "Wipe all trades"}
				</Button>
			</div>
		</div>
	</section>
</div>
