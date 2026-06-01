<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { DateTimePicker } from "$lib/components/ui/date-time-picker";
	import { toast } from "svelte-sonner";
	import { supabase } from "$lib/supabase/client";
	import { accountStore } from "$lib/stores/accounts.svelte";
	import { payoutStore } from "$lib/stores/payouts.svelte";
	import { formatUsd } from "$lib/utils/format";
	import { toDatetimeLocalValue } from "$lib/utils/datetime";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const activeAccount = $derived(
		accountStore.accounts.find((a) => a.id === accountStore.activeAccountId) ?? null
	);

	let payoutGross = $state("");
	let payoutDate = $state(toDatetimeLocalValue(new Date()));
	let payoutNotes = $state("");
	let payoutSaving = $state(false);

	async function submitPayout() {
		const gross = Number(payoutGross);
		if (!payoutGross || !Number.isFinite(gross) || gross <= 0) {
			toast.error("Enter a valid gross profit amount.");
			return;
		}
		const accountId = accountStore.activeAccountId;
		if (!accountId) return;
		payoutSaving = true;
		try {
			await payoutStore.createPayout(supabase, {
				account_id: accountId,
				gross_amount: gross,
				payout_date: new Date(payoutDate).toISOString(),
				notes: payoutNotes.trim() || null,
			});
			open = false;
			payoutGross = "";
			payoutDate = toDatetimeLocalValue(new Date());
			payoutNotes = "";
			toast.success("Payout requested.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save payout.");
		} finally {
			payoutSaving = false;
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-[min(100vw,400px)] sm:max-w-[400px]">
		<Sheet.Header>
			<Sheet.Title>Add payout</Sheet.Title>
			<Sheet.Description>Record a payout received from this funded account.</Sheet.Description>
		</Sheet.Header>

<div class="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Gross profit ($)</div>
				<Input bind:value={payoutGross} type="number" inputmode="decimal" placeholder="e.g. 1000" class="rounded-md" />
				{#if payoutGross && Number(payoutGross) > 0 && activeAccount?.profit_split}
					{@const split = activeAccount.profit_split}
					{@const payout = Number(payoutGross) * split}
					<div class="rounded-md bg-muted/50 border px-3 py-2 text-xs space-y-0.5">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Split</span>
							<span>{Math.round(split * 100)}% / {Math.round((1 - split) * 100)}%</span>
						</div>
						<div class="flex justify-between font-medium">
							<span class="text-muted-foreground">You receive</span>
							<span class="text-emerald-700 dark:text-emerald-400">{formatUsd(payout)}</span>
						</div>
					</div>
				{:else if payoutGross && Number(payoutGross) > 0}
					<p class="text-[11px] text-muted-foreground">No profit split set on this account — set one in Settings → Accounts to enable auto-calculation.</p>
				{/if}
			</div>
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Payout date</div>
				<DateTimePicker
					value={payoutDate}
					onValueChange={(v) => (payoutDate = v ?? toDatetimeLocalValue(new Date()))}
				/>
			</div>
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Notes</div>
				<textarea
					bind:value={payoutNotes}
					rows="3"
					class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-xs shadow-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
					placeholder="Optional"
				></textarea>
			</div>
		</div>

		<Sheet.Footer class="border-t">
			<div class="flex justify-end gap-2">
				<Button variant="outline" class="rounded-md cursor-pointer" onclick={() => (open = false)}>Cancel</Button>
				<Button class="rounded-md cursor-pointer" disabled={payoutSaving} onclick={submitPayout}>
					{payoutSaving ? "Saving…" : "Request payout"}
				</Button>
			</div>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
