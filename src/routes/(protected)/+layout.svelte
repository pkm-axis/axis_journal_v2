<script lang="ts">
	import AppSidebar from "$lib/components/layout/app-sidebar.svelte";
	import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Separator } from "$lib/components/ui/separator/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";

	let { children } = $props();
</script>

<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset class="overflow-hidden">
        {@render children()}
	</Sidebar.Inset>
</Sidebar.Provider>
