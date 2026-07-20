<script lang="ts">
	import { onMount } from "svelte";
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { Button } from "$lib/components/ui/button";
	import { DateTimePicker } from "$lib/components/ui/date-time-picker";
	import { confirm } from "$lib/components/ui/confirm-dialog";
	import { TrashIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";
	import { supabase } from "$lib/supabase/client";
	import { journalStore, type DailyJournalEntry } from "$lib/stores/journal.svelte";

	let session = $state<{ user: { id: string } } | null>(null);
	let saving = $state(false);

	/** Local "YYYY-MM-DD" for a Date. */
	function toDateKey(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	}

	// DateTimePicker emits "YYYY-MM-DDT00:00" in dateOnly mode. Default to today.
	let dateIso = $state<string>(`${toDateKey(new Date())}T00:00`);
	const selectedDate = $derived(dateIso ? dateIso.split("T")[0] : toDateKey(new Date()));

	// Editor form fields.
	let rating = $state<number | null>(null);
	let wentWell = $state("");
	let wentWrong = $state("");
	let lessons = $state("");

	// Prefill the editor whenever the selected date or the loaded entries change.
	$effect(() => {
		const key = selectedDate;
		const existing = journalStore.entries.find((e) => e.entry_date === key);
		rating = existing?.rating ?? null;
		wentWell = existing?.what_went_well ?? "";
		wentWrong = existing?.what_went_wrong ?? "";
		lessons = existing?.lessons ?? "";
	});

	const isEmpty = $derived(
		rating == null && !wentWell.trim() && !wentWrong.trim() && !lessons.trim()
	);

	function formatDate(dateKey: string): string {
		const [y, m, d] = dateKey.split("-").map(Number);
		if (!y || !m || !d) return dateKey;
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			weekday: "short",
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	}

	function preview(e: DailyJournalEntry): string {
		return e.what_went_well || e.what_went_wrong || e.lessons || "No notes";
	}

	async function save() {
		if (isEmpty) {
			toast.error("Add a rating or some notes before saving.");
			return;
		}
		try {
			saving = true;
			await journalStore.saveEntry(supabase, {
				entry_date: selectedDate,
				rating,
				what_went_well: wentWell.trim() || null,
				what_went_wrong: wentWrong.trim() || null,
				lessons: lessons.trim() || null,
			});
			toast.success(`Journal saved for ${formatDate(selectedDate)}.`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to save journal entry.");
		} finally {
			saving = false;
		}
	}

	async function remove(entry: DailyJournalEntry) {
		const ok = await confirm({
			title: `Delete entry for ${formatDate(entry.entry_date)}?`,
			description: "This journal entry will be permanently removed.",
			destructive: true,
		});
		if (!ok) return;
		try {
			await journalStore.deleteEntry(supabase, entry.id);
			toast.success("Journal entry deleted.");
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete entry.");
		}
	}

	const textareaClass =
		"border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[88px] w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50";

	onMount(async () => {
		const {
			data: { session: s },
		} = await supabase.auth.getSession();
		session = s;
		if (s?.user?.id) void journalStore.getEntries(supabase);
	});
</script>

<HeaderNavbar links={true} {helpContent}>
	<Breadcrumb.Root>
		<Breadcrumb.List>
			<Breadcrumb.Item>Overview</Breadcrumb.Item>
			<Breadcrumb.Separator />
			<Breadcrumb.Page>Journal</Breadcrumb.Page>
		</Breadcrumb.List>
	</Breadcrumb.Root>
</HeaderNavbar>

{#snippet helpContent()}
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">
			The Journal is your post-session review — reflect on the whole trading day, not a single trade.
		</p>
		<ul class="list-disc list-inside space-y-1 text-muted-foreground">
			<li>Pick a date, rate the day 1–5, and jot what went well, what went wrong, and lessons.</li>
			<li>There's one entry per day; saving the same date again updates it.</li>
			<li>Entries are personal and span all your accounts.</li>
		</ul>
	</div>
{/snippet}

<ScrollArea class="h-[calc(100vh-3.5rem)]">
	<div class="container mx-auto max-w-3xl space-y-4 p-4 md:p-6">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Journal</h1>
			<p class="text-sm text-muted-foreground">Post-session daily reflection.</p>
		</div>

		<!-- Editor -->
		<div class="space-y-4 rounded-md border bg-background p-4 md:p-5">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Date</div>
					<DateTimePicker
						value={dateIso}
						dateOnly
						onValueChange={(v) => (dateIso = v ?? `${toDateKey(new Date())}T00:00`)}
						class="w-full sm:w-56"
					/>
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Day rating</div>
					<div class="flex items-center gap-1.5">
						{#each [1, 2, 3, 4, 5] as n}
							{@const on = rating === n}
							<button
								type="button"
								onclick={() => (rating = on ? null : n)}
								class={[
									"flex h-9 w-9 items-center justify-center rounded-md border text-sm font-medium tabular-nums cursor-pointer transition-colors",
									on
										? "border-primary bg-primary text-primary-foreground"
										: "border-input bg-background text-muted-foreground hover:bg-muted/50",
								]}
							>
								{n}
							</button>
						{/each}
						<span class="ml-2 text-[11px] text-muted-foreground">1 = rough · 5 = great</span>
					</div>
				</div>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">What went well</div>
				<textarea
					bind:value={wentWell}
					rows="3"
					class={textareaClass}
					placeholder="Trades, discipline, process — what you did right today…"
				></textarea>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">What went wrong</div>
				<textarea
					bind:value={wentWrong}
					rows="3"
					class={textareaClass}
					placeholder="Mistakes, rule breaks, missed setups, emotions that got in the way…"
				></textarea>
			</div>

			<div class="space-y-1.5">
				<div class="text-xs font-medium">Lessons & adjustments</div>
				<textarea
					bind:value={lessons}
					rows="3"
					class={textareaClass}
					placeholder="What will you do differently tomorrow?"
				></textarea>
			</div>

			<div class="flex justify-end">
				<Button class="cursor-pointer rounded-md" onclick={save} disabled={saving || isEmpty}>
					{saving ? "Saving…" : "Save entry"}
				</Button>
			</div>
		</div>

		<!-- Past entries -->
		<div class="rounded-md border bg-background">
			<div class="border-b px-4 py-3 text-sm font-semibold">Past entries</div>
			{#if journalStore.entries.length === 0}
				<div class="p-6 text-center text-sm text-muted-foreground">
					No journal entries yet. Reflect on today's session above.
				</div>
			{:else}
				<div class="divide-y">
					{#each journalStore.entries as entry (entry.id)}
						<div class="flex items-center gap-3 px-4 py-3">
							<button
								type="button"
								class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
								onclick={() => (dateIso = `${entry.entry_date}T00:00`)}
							>
								<div class="w-32 shrink-0 text-sm font-medium tabular-nums">
									{formatDate(entry.entry_date)}
								</div>
								{#if entry.rating != null}
									<span
										class="shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
									>
										{entry.rating}/5
									</span>
								{/if}
								<div class="min-w-0 flex-1 truncate text-sm text-muted-foreground">
									{preview(entry)}
								</div>
							</button>
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8 shrink-0 cursor-pointer text-muted-foreground hover:text-rose-700 dark:hover:text-rose-400"
								onclick={() => remove(entry)}
							>
								<TrashIcon size={16} />
							</Button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</ScrollArea>
