<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import AppSidebar from "$lib/components/layout/app-sidebar.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { supabase } from "$lib/supabase/client";
	import { ensureProfile } from "$lib/auth/ensure-profile";
	import type { Session } from "@supabase/supabase-js";

	let { children } = $props();

	let session = $state<Session | null>(null);
	let ready = $state(false);

	const sidebarUser = $derived.by(() => {
		const u = session?.user;
		if (!u) {
			return { name: "", email: "", avatar: "" };
		}
		const email = u.email ?? "";
		const meta = u.user_metadata as { full_name?: string; avatar_url?: string } | undefined;
		const name =
			meta?.full_name ??
			(email ? email.split("@")[0] : "User");
		return {
			name,
			email,
			avatar: meta?.avatar_url ?? "",
		};
	});

	onMount(() => {
		const holder: { subscription?: { unsubscribe: () => void } } = {};

		void (async () => {
			const {
				data: { session: initial },
			} = await supabase.auth.getSession();
			if (!initial) {
				await goto(resolve("/login-04"), { replaceState: true });
				return;
			}
			session = initial;
			await ensureProfile(initial.user.id);
			ready = true;

			const { data } = supabase.auth.onAuthStateChange(async (_event, next) => {
				if (!next) {
					session = null;
					ready = false;
					await goto(resolve("/login-04"), { replaceState: true });
					return;
				}
				session = next;
				await ensureProfile(next.user.id);
				ready = true;
			});
			holder.subscription = data.subscription;
		})();

		return () => holder.subscription?.unsubscribe();
	});
</script>

{#if !ready}
	<div class="bg-background flex min-h-svh items-center justify-center p-6">
		<p class="text-muted-foreground text-sm">Loading…</p>
	</div>
{:else}
	<Sidebar.Provider>
		<AppSidebar user={sidebarUser} />
		<Sidebar.Inset class="overflow-hidden">
			{@render children()}
		</Sidebar.Inset>
	</Sidebar.Provider>
{/if}
