<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { getAuthToken } from "$lib/utils/auth-token";
	import { toast } from "svelte-sonner";

	let confirmText = $state("");
	let wiping = $state(false);
	let seeding = $state(false);

	async function seed() {
		seeding = true;
		try {
			const token = await getAuthToken(supabase);
			const res = await fetch("/api/data/seed", {
				method: "POST",
				credentials: "include",
				headers: { Authorization: `Bearer ${token}` },
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Seed failed.");
			await accountStore.getAllAccounts(supabase);
			await tradeStore.getTradesByAccount(supabase);
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
				Populate your account with realistic sample data to explore the app. Creates two prop firm accounts
				(evaluation + funded), 3 instruments, 4 strategies, 4 mistakes, 26 trades, and 1 payout.
			</p>
		</div>

		<div class="rounded-md border bg-background p-4 space-y-3">
			<ul class="text-xs text-muted-foreground space-y-1 list-disc list-inside">
				<li>Instruments: NQ, ES, MNQ (CME futures)</li>
				<li>Strategies: Trend Following, Breakout, Mean Reversion, Opening Range Breakout</li>
				<li>Mistakes: Sized too large, Moved stop early, Revenge trade, Ignored invalidation</li>
				<li>Accounts: Apex 50K Evaluation (cost $137) + Apex 50K Funded (graduated)</li>
				<li>26 trades across the last 90 days with wins, losses, and 2 open positions</li>
				<li>1 sample payout of $1,800 on the funded account</li>
			</ul>

<div class="flex justify-end">
				<Button
					variant="outline"
					class="rounded-md cursor-pointer"
					disabled={seeding}
					onclick={seed}
				>
					{seeding ? "Seeding…" : "Seed demo data"}
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
