<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { supabase } from "$lib/supabase/client";

	onMount(async () => {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (session) {
			await goto(resolve("/dashboard"), { replaceState: true });
		} else {
			await goto(resolve("/login"), { replaceState: true });
		}
	});
</script>

<div class="bg-background flex min-h-svh items-center justify-center p-6">
	<p class="text-muted-foreground text-sm">Redirecting…</p>
</div>
