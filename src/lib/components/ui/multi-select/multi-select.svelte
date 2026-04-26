<script lang="ts">
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { CaretDownIcon } from "phosphor-svelte";
	import { cn } from "$lib/utils.js";

	interface Option {
		value: string;
		label: string;
	}

	let {
		options,
		selected = $bindable<string[]>([]),
		placeholder = "Select…",
		emptyText = "No options.",
		disabled = false,
		class: className
	}: {
		options: Option[];
		selected?: string[];
		placeholder?: string;
		emptyText?: string;
		disabled?: boolean;
		class?: string;
	} = $props();

	const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;

	function toggle(value: string, next: boolean) {
		const set = new Set(selected);
		if (next) set.add(value);
		else set.delete(value);
		selected = [...set];
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		{disabled}
		class={cn(
			"flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
			className
		)}
	>
		<div class="flex flex-wrap items-center gap-1 truncate text-left">
			{#if selected.length === 0}
				<span class="text-muted-foreground">{placeholder}</span>
			{:else}
				{#each selected as v (v)}
					<span class="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-xs">
						{labelFor(v)}
					</span>
				{/each}
			{/if}
		</div>
		<CaretDownIcon size={14} class="shrink-0 text-muted-foreground" />
	</DropdownMenu.Trigger>

	<DropdownMenu.Content class=" w-(--bits-dropdown-menu-anchor-width) p-0" align="start">
		{#if options.length === 0}
			<div class="px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
		{:else}
			<ScrollArea class="max-h-60">
				{#each options as opt (opt.value)}
					<DropdownMenu.CheckboxItem
						checked={selected.includes(opt.value)}
						onCheckedChange={(v) => toggle(opt.value, v)}
						closeOnSelect={false}
					>
						{opt.label}
					</DropdownMenu.CheckboxItem>
				{/each}
			</ScrollArea>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
