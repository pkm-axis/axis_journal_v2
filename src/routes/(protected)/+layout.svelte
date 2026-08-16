<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import AppSidebar from "$lib/components/layout/app-sidebar.svelte";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { supabase } from "$lib/supabase/client";
	import type { Session } from "@supabase/supabase-js";
    import { accountStore } from "$lib/stores/accounts.svelte";
    import { tradeStore } from "$lib/stores/trades.svelte";
    import { payoutStore } from "$lib/stores/payouts.svelte";
    import { expenseStore } from "$lib/stores/expenses.svelte";

	let { children } = $props();

    let currentUserId: string | null = null;
	let session = $state<Session | null>(null);
	let ready = $state(false);

    onMount(() => {
		const holder: { subscription?: { unsubscribe: () => void } } = {};

		void (async () => {
			const {
				data: { session: initial },
			} = await supabase.auth.getSession();
            
			if (!initial) {
				await goto(resolve("/login"), { replaceState: true });
				return;
			}
			session = initial;
            currentUserId = initial.user.id;
			ready = true;

			const { data } = supabase.auth.onAuthStateChange(async (_event, next) => {
                const newUserId = next?.user?.id ?? null;

                // Detects user switch
                if (currentUserId && currentUserId !== newUserId) {
                    // Every store holding the previous user's rows must be dropped
                    // here, or the incoming user sees stale data until each page
                    // refetches.
                    accountStore.clear();
                    tradeStore.clear();
                    payoutStore.clear();
                    expenseStore.clear();
                }

                currentUserId = newUserId;

				if (!next) {
					session = null;
					ready = false;
					await goto(resolve("/login"), { replaceState: true });
					return;
				}

				session = next;
				ready = true;

                accountStore.getAllAccounts(supabase);
			});
			holder.subscription = data.subscription;
		})();

		return () => holder.subscription?.unsubscribe();
	});

	const sidebarUser = $derived.by(() => {
		const u = session?.user;

		if (!u) {
			return { 
                id: "", 
                name: "", 
                email: "", 
                avatar: "" 
            };
		}

        const id = u.id;
		const email = u.email ?? "";
		const meta = u.user_metadata as { full_name?: string; avatar_url?: string } | undefined;
		const name = meta?.full_name ?? (email ? email.split("@")[0] : "User");
		return {
            id,
			name,
			email,
			avatar: meta?.avatar_url ?? "",
		};
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
