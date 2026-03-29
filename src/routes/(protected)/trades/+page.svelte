<script lang="ts">
	import HeaderNavbar from "$lib/components/layout/header-navbar.svelte";
    import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { CaretDownIcon, CaretUpIcon, ChartLineDownIcon, ChartLineUpIcon, FunnelIcon, MagnifyingGlassIcon, PlusIcon, PulseIcon } from "phosphor-svelte";
    import * as Select from "$lib/components/ui/select/index.js";
</script>

<HeaderNavbar links={true}>
    <Breadcrumb.Root>
        <Breadcrumb.List>
            <Breadcrumb.Page>Trades</Breadcrumb.Page>
        </Breadcrumb.List>
    </Breadcrumb.Root>
</HeaderNavbar>
<ScrollArea class="h-[calc(100vh-3.5rem)]">
    <div class="container mx-auto max-w-6xl space-y-4 p-4 md:p-6">
        <div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Trades</h1>
				<p class="text-sm text-muted-foreground">Create and manage your trades.</p>
			</div>
			<Button variant="outline" class="cursor-pointer rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground">
				<PlusIcon />
				New Trade
			</Button>
		</div>

        <div class="flex flex-wrap items-center gap-3">
            <div class="relative w-full max-w-sm">
                <Input
					type="text"
					placeholder="Search trades..."
					class="pl-9 rounded-md"
                    // TODO: Bind value to search query
				/>
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
					<MagnifyingGlassIcon size={16} class="text-muted-foreground" />
				</div>
            </div>
            <Select.Root 
                type="single" 
                // TODO: Bind value to direction filter
            >
				<Select.Trigger class="w-[160px] rounded-md cursor-pointer">
					<FunnelIcon size={16} class="text-muted-foreground" />
					<!-- <span class="capitalize">{/* TODO: Display direction filter */}</span>  -->
                     <span class="capitalize">All Directions</span>
				</Select.Trigger>
				<Select.Content class="rounded-md">
					<Select.Item value="all" class="cursor-pointer">All Directions</Select.Item>
					<Select.Item value="long" class="cursor-pointer">
						<ChartLineUpIcon class="mr-2 h-4 w-4" />
						Long
					</Select.Item>
					<Select.Item value="short" class="cursor-pointer">
						<ChartLineDownIcon class="mr-2 h-4 w-4" />
						Short
					</Select.Item>
				</Select.Content>
			</Select.Root>
			<Select.Root 
                type="single" 
                // TODO: Bind value to date filter
            >
				<Select.Trigger class="w-[160px] rounded-md cursor-pointer">
					<PulseIcon class="mr-2 h-4 w-4" />
					<span class="capitalize">
						All Statuses
					</span>
				</Select.Trigger>
				<Select.Content class="rounded-md">
					<Select.Item value="all" class="cursor-pointer">All Statuses</Select.Item>
					<Select.Item value="open" class="cursor-pointer">
                        <CaretUpIcon size={16} />
                        Open
                    </Select.Item>
					<Select.Item value="closed" class="cursor-pointer">
                        <CaretDownIcon size={16} />
                        Closed
                    </Select.Item>
				</Select.Content>
			</Select.Root>
        </div>
    </div>
</ScrollArea>