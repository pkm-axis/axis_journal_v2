<script lang="ts">
	import { preferences } from "$lib/stores/preferences.svelte";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import { SunIcon, MoonIcon, MonitorIcon } from "phosphor-svelte";

	const sidebar = useSidebar();

	const THEMES = [
		{ id: "light" as const, label: "Light", Icon: SunIcon },
		{ id: "dark" as const, label: "Dark", Icon: MoonIcon },
		{ id: "system" as const, label: "System", Icon: MonitorIcon },
	];

	const SIDEBAR = [
		{ id: "expanded" as const, label: "Expanded", desc: "Show full nav with labels by default." },
		{ id: "collapsed" as const, label: "Collapsed", desc: "Show only icons by default; expands on click." },
	];
</script>

<div class="space-y-8">
	<section class="space-y-3">
		<div>
			<h2 class="text-lg font-semibold">Theme</h2>
			<p class="text-xs text-muted-foreground">Pick how Axis looks. System follows your OS setting.</p>
		</div>
		<div class="rounded-md border bg-background p-4">
			<div class="grid grid-cols-3 gap-3">
				{#each THEMES as t}
					{@const active = preferences.theme === t.id}
					<button
						type="button"
						onclick={() => preferences.setTheme(t.id)}
						class={[
							"flex flex-col items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors text-left",
							active ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30",
						]}
						aria-pressed={active}
					>
						<t.Icon size={18} />
						<span class="text-sm font-medium">{t.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</section>

	<section class="space-y-3">
		<div>
			<h2 class="text-lg font-semibold">Sidebar</h2>
			<p class="text-xs text-muted-foreground">Default state when the app loads.</p>
		</div>
		<div class="rounded-md border bg-background p-4">
			<div class="grid grid-cols-2 gap-3">
				{#each SIDEBAR as s}
					{@const active = preferences.sidebarDefault === s.id}
					<button
						type="button"
						onclick={() => {
							preferences.setSidebarDefault(s.id);
							sidebar.setOpen(s.id === "expanded");
						}}
						class={[
							"flex flex-col items-start gap-1 rounded-md border p-3 cursor-pointer transition-colors text-left",
							active ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30",
						]}
						aria-pressed={active}
					>
						<span class="text-sm font-medium">{s.label}</span>
						<span class="text-[11px] text-muted-foreground">{s.desc}</span>
					</button>
				{/each}
			</div>
		</div>
	</section>
</div>
