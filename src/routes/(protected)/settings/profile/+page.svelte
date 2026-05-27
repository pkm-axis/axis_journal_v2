<script lang="ts">
	import { onMount } from "svelte";
	import type { User } from "@supabase/supabase-js";
	import { goto } from "$app/navigation";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { confirm } from "$lib/components/ui/confirm-dialog";
	import { supabase } from "$lib/supabase/client";

	let user = $state<User | null>(null);
	let loading = $state(true);

	let displayName = $state("");
	let email = $state("");
	let savingProfile = $state(false);
	let profileMsg = $state<{ kind: "ok" | "err"; text: string } | null>(null);

	let newPassword = $state("");
	let confirmPassword = $state("");
	let savingPassword = $state(false);
	let passwordMsg = $state<{ kind: "ok" | "err"; text: string } | null>(null);

	let deleting = $state(false);
	let deleteMsg = $state<{ kind: "ok" | "err"; text: string } | null>(null);

	onMount(async () => {
		const { data: { user: u } } = await supabase.auth.getUser();
		user = u;
		displayName = (u?.user_metadata?.display_name as string | undefined) ?? "";
		email = u?.email ?? "";
		loading = false;
	});

	async function saveProfile() {
		profileMsg = null;
		savingProfile = true;
		try {
			const update: Parameters<typeof supabase.auth.updateUser>[0] = {
				data: { display_name: displayName.trim() || null },
			};
			if (email.trim() && email.trim() !== user?.email) {
				update.email = email.trim();
			}
			const { error } = await supabase.auth.updateUser(update);
			if (error) throw error;
			profileMsg = {
				kind: "ok",
				text: update.email
					? "Saved. Check your inbox to confirm the new email."
					: "Profile saved.",
			};
		} catch (e) {
			profileMsg = { kind: "err", text: e instanceof Error ? e.message : "Failed to save." };
		} finally {
			savingProfile = false;
		}
	}

	async function changePassword() {
		passwordMsg = null;
		if (newPassword.length < 8) {
			passwordMsg = { kind: "err", text: "Password must be at least 8 characters." };
			return;
		}
		if (newPassword !== confirmPassword) {
			passwordMsg = { kind: "err", text: "Passwords don't match." };
			return;
		}
		savingPassword = true;
		try {
			const { error } = await supabase.auth.updateUser({ password: newPassword });
			if (error) throw error;
			newPassword = "";
			confirmPassword = "";
			passwordMsg = { kind: "ok", text: "Password updated." };
		} catch (e) {
			passwordMsg = { kind: "err", text: e instanceof Error ? e.message : "Failed to update." };
		} finally {
			savingPassword = false;
		}
	}

	async function deleteAccount() {
		deleteMsg = null;
		const ok = await confirm({
			title: "Permanently delete your account?",
			description:
				"This removes every trade, account, strategy, mistake, instrument, payout, and your login itself. There is no undo.",
			confirmLabel: "Delete account",
			destructive: true,
		});
		if (!ok) return;
		deleting = true;
		try {
			const { data: { session: s } } = await supabase.auth.getSession();
			const res = await fetch("/api/profile/delete", {
				method: "DELETE",
				credentials: "include",
				headers: s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {},
			});
			const body = await res.json();
			if (!body.success) throw new Error(body.message ?? "Failed to delete account.");
			await supabase.auth.signOut();
			await goto("/login", { replaceState: true });
		} catch (e) {
			deleteMsg = { kind: "err", text: e instanceof Error ? e.message : "Failed to delete account." };
			deleting = false;
		}
	}
</script>

<div class="space-y-8">
	<!-- Profile section -->
	<section class="space-y-3">
		<div>
			<h2 class="text-lg font-semibold">Profile</h2>
			<p class="text-xs text-muted-foreground">How you appear in the app.</p>
		</div>
		<div class="rounded-md border bg-background p-4 space-y-4">
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Display name</div>
				<Input bind:value={displayName} placeholder="Your name" class="rounded-md" disabled={loading} />
			</div>
			<div class="space-y-1.5">
				<div class="text-xs font-medium">Email</div>
				<Input bind:value={email} type="email" placeholder="you@example.com" class="rounded-md" disabled={loading} />
				<p class="text-[11px] text-muted-foreground">Changing email sends a confirmation link to the new address.</p>
			</div>
			{#if profileMsg}
				<div class={[
					"rounded-md border px-3 py-2 text-xs",
					profileMsg.kind === "ok" ? "border-emerald-700/30 bg-emerald-700/5 text-emerald-700 dark:text-emerald-400" : "border-destructive/40 bg-destructive/10 text-destructive",
				]}>
					{profileMsg.text}
				</div>
			{/if}
			<div class="flex justify-end">
				<Button class="rounded-md cursor-pointer" disabled={savingProfile || loading} onclick={saveProfile}>
					{savingProfile ? "Saving…" : "Save changes"}
				</Button>
			</div>
		</div>
	</section>

	<!-- Password section -->
	<section class="space-y-3">
		<div>
			<h2 class="text-lg font-semibold">Password</h2>
			<p class="text-xs text-muted-foreground">Use at least 8 characters.</p>
		</div>
		<div class="rounded-md border bg-background p-4 space-y-4">
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<div class="text-xs font-medium">New password</div>
					<Input bind:value={newPassword} type="password" placeholder="••••••••" class="rounded-md" />
				</div>
				<div class="space-y-1.5">
					<div class="text-xs font-medium">Confirm</div>
					<Input bind:value={confirmPassword} type="password" placeholder="••••••••" class="rounded-md" />
				</div>
			</div>
			{#if passwordMsg}
				<div class={[
					"rounded-md border px-3 py-2 text-xs",
					passwordMsg.kind === "ok" ? "border-emerald-700/30 bg-emerald-700/5 text-emerald-700 dark:text-emerald-400" : "border-destructive/40 bg-destructive/10 text-destructive",
				]}>
					{passwordMsg.text}
				</div>
			{/if}
			<div class="flex justify-end">
				<Button
					class="rounded-md cursor-pointer"
					disabled={savingPassword || !newPassword || !confirmPassword}
					onclick={changePassword}
				>
					{savingPassword ? "Updating…" : "Change password"}
				</Button>
			</div>
		</div>
	</section>

	<!-- Danger zone -->
	<section class="space-y-3">
		<div>
			<h2 class="text-lg font-semibold text-rose-700 dark:text-rose-400">Danger zone</h2>
			<p class="text-xs text-muted-foreground">Irreversible — proceed with care.</p>
		</div>
		<div class="rounded-md border border-rose-700/30 bg-rose-700/5 p-4 space-y-3">
			<div>
				<div class="text-sm font-medium">Delete account</div>
				<p class="text-xs text-muted-foreground">
					Permanently removes your account, trades, strategies, mistakes, and accounts. There is no undo.
				</p>
			</div>
			{#if deleteMsg}
				<div class={[
					"rounded-md border px-3 py-2 text-xs",
					deleteMsg.kind === "ok" ? "border-emerald-700/30 bg-emerald-700/5 text-emerald-700 dark:text-emerald-400" : "border-destructive/40 bg-destructive/10 text-destructive",
				]}>
					{deleteMsg.text}
				</div>
			{/if}
			<div class="flex justify-end">
				<Button
					variant="outline"
					class="rounded-md cursor-pointer border-rose-700/40 text-rose-700 hover:bg-rose-700/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-400"
					disabled={deleting}
					onclick={deleteAccount}
				>
					{deleting ? "Deleting…" : "Delete my account"}
				</Button>
			</div>
		</div>
	</section>
</div>
