<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { supabase } from "$lib/supabase/client";
	import { tradeStore } from "$lib/stores/trades.svelte";
	import { getAuthToken } from "$lib/utils/auth-token";

	let confirmText = $state("");
	let wiping = $state(false);
	let msg = $state<{ kind: "ok" | "err"; text: string } | null>(null);

	async function wipe() {
		if (confirmText !== "DELETE ALL TRADES") {
			msg = { kind: "err", text: "Type the confirmation phrase exactly to proceed." };
			return;
		}
		wiping = true;
		msg = null;
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
			msg = { kind: "ok", text: "All trades deleted." };
		} catch (e) {
			msg = { kind: "err", text: e instanceof Error ? e.message : "Failed to wipe." };
		} finally {
			wiping = false;
		}
	}
</script>

<div class="space-y-8">
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

			{#if msg}
				<div class={[
					"rounded-md border px-3 py-2 text-xs",
					msg.kind === "ok"
						? "border-emerald-700/30 bg-emerald-700/5 text-emerald-700 dark:text-emerald-400"
						: "border-destructive/40 bg-destructive/10 text-destructive",
				]}>
					{msg.text}
				</div>
			{/if}

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
