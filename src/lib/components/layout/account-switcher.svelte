<script lang="ts">
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
    import * as Sheet from "$lib/components/ui/sheet/index.js";
    import * as Select from "$lib/components/ui/select/index.js";
    import { Button } from "$lib/components/ui/button";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Input from "../ui/input/input.svelte";
    import { supabase } from '$lib/supabase/client'
    import { accountStore, type Account } from "$lib/stores/accounts.svelte";
    import { Skeleton } from "$lib/components/ui/skeleton";

    const sidebar = useSidebar();

	let props = $props<{
        accounts: Account[];
    }>();

    let accountList = $derived(props.accounts ?? []);

    // Source of truth = the store. The switcher only displays it.
    const activeAccount = $derived<Account | null>(
        accountList.find((a: Account) => a.id === accountStore.activeAccountId) ?? null
    );

    // Default to the first account when none is set yet.
    $effect(() => {
        if (accountList.length === 0) {
            if (accountStore.activeAccountId !== null) accountStore.setActiveAccountId(null);
            return;
        }
        if (!accountStore.activeAccountId || !accountList.some((a: Account) => a.id === accountStore.activeAccountId)) {
            accountStore.setActiveAccountId(accountList[0].id);
        }
    });

    function selectAccount(a: Account) {
        accountStore.setActiveAccountId(a.id);
    }

    let accountName: string = $state('');
    let accountType: string = $state('prop firm');
    let accountPlatform: string = $state('');
    let accountCurrency: string = $state('');
    let propFirmType: string = $state('Evaluation');
    let accountStartingBalance: number | null = $state(null);
    let propFirmName: string = $state('');
    let profitTarget: number | null = $state(null);
    let maxDrawdown: number | null = $state(null);
    let dailyLossLimit: number | null = $state(null);
    let consistencyRule: string = $state('');
    let maxContracts: string = $state('');
    let drawdownType: string = $state('eod');
    let challengeCost: number | null = $state(null);
    let profitSplitPct: string = $state("");

    let newAccountOpen: boolean = $state(false);
    let creatingAccount: boolean = $state(false);
    let createError: string | null = $state(null)

    const hasTradingRules = $derived(accountType === 'prop firm' || accountType === 'paper trading');

    async function createAccount() {
        creatingAccount = true;
        createError = null;

        let payload = {
            name: accountName,
            account_type: accountType,
            platform: accountType === 'paper trading' ? null : accountPlatform,
            currency: accountCurrency,
            starting_balance: accountStartingBalance,

            prop_firm_name: accountType === 'prop firm' ? propFirmName : null,
            prop_firm_type: accountType === 'prop firm' ? propFirmType : null,
            prop_firm_profit_target: hasTradingRules ? profitTarget : null,
            prop_firm_max_drawdown: hasTradingRules ? maxDrawdown : null,
            prop_firm_daily_loss_limit: accountType === 'prop firm' ? dailyLossLimit : null,
            prop_firm_consistency_rule: accountType === 'prop firm' ? consistencyRule : null,
            prop_firm_max_contracts: accountType === 'prop firm' ? maxContracts : null,
            prop_firm_drawdown_type: accountType === 'prop firm' ? drawdownType : null,
            challenge_cost: accountType === 'prop firm' ? challengeCost : null,
            profit_split: accountType === 'prop firm' && profitSplitPct ? Number(profitSplitPct) / 100 : null,
        }
       await accountStore.createAccount(supabase, payload)

        creatingAccount = accountStore.loading;
        newAccountOpen = false;
    }
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						{...props}
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground flex justify-center items-center border-2 rounded-md"
					>
						{#if sidebar.state !== "collapsed"}
                            <div class="grid flex-1 text-start text-sm leading-tight cursor-pointer">
                                {#if activeAccount}
                                    <span class="truncate font-medium">
                                        {activeAccount.name}
                                    </span>
                                    <span class="truncate text-xs">
                                        {activeAccount.account_type}
                                    </span>
                                {:else}
                                    <span class="font-medium">No account</span>
                                    <span class="text-muted-foreground text-xs">Click to create one</span>
                                {/if}
                            </div>
                        {/if}
                        
                        <ChevronsUpDownIcon />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
				align="start"
				side={sidebar.isMobile ? "bottom" : "right"}
				sideOffset={4}
			>
				<DropdownMenu.Label class="text-muted-foreground text-xs">Accounts</DropdownMenu.Label>
				{#each accountList as account (account.id)}
					<DropdownMenu.Item onSelect={() => selectAccount(account)} class="gap-2 p-2 cursor-pointer">
						{account.name}
					</DropdownMenu.Item>
				{/each}
				<DropdownMenu.Separator />
				<DropdownMenu.Item 
                    class="gap-2 p-2 cursor-pointer" 
                    onclick={() => (newAccountOpen = true)}
                >
					<div
						class="flex size-6 items-center justify-center rounded-md border bg-transparent"
					>
						<PlusIcon class="size-4" />
					</div>
					<div class="text-muted-foreground font-medium">Add account</div>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>

<Sheet.Root bind:open={newAccountOpen}>
    <Sheet.Content side="right" class="w-[min(100vw,520px)] sm:max-w-[520px]">
        <Sheet.Header>
            <Sheet.Title>New account</Sheet.Title>
            <Sheet.Description>
                Create a new account
            </Sheet.Description>
        </Sheet.Header>

        <!-- {#if saveError}
            <div class="mx-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {saveError}
            </div>
        {/if} -->

        <div class="px-4 pb-2 space-y-4 flex-1 overflow-y-auto">
            <div class="space-y-1.5">
                <div class="text-xs font-medium">Name</div>
                <Input bind:value={accountName} placeholder="e.g. Apex Account" class="rounded-md" />
            </div>

            <div class="space-y-1.5">
                <div class="text-xs font-medium">Type</div>
                <Select.Root type="single" bind:value={accountType}>
                    <Select.Trigger class="w-full rounded-md cursor-pointer">
                        <span class="capitalize">{accountType}</span>
                    </Select.Trigger>
                    <Select.Content class="rounded-md">
                        <Select.Item value="prop firm" class="cursor-pointer">
                            Prop Firm
                        </Select.Item>
                        <Select.Item value="paper trading" class="cursor-pointer">
                            Paper Trading
                        </Select.Item>
                        <Select.Item value="live" class="cursor-pointer" disabled>
                            Live (coming soon)
                        </Select.Item>
                        <Select.Item value="crypto" class="cursor-pointer" disabled>
                            Crypto (coming soon)
                        </Select.Item>
                    </Select.Content>
                </Select.Root>
            </div>

            {#if accountType !== 'paper trading'}
                <div class="space-y-1.5">
                    <div class="text-xs font-medium">Platform</div>
                    <Input bind:value={accountPlatform} placeholder="e.g. OKX, Tradovate, etc." class="rounded-md" />
                </div>
            {/if}

            <div class="space-y-1.5">
                <div class="text-xs font-medium">Currency</div>
                <Input bind:value={accountCurrency} placeholder="USD" class="rounded-md" />
            </div>

            <div class="space-y-1.5">
                <div class="text-xs font-medium">Starting Balance</div>
                <Input bind:value={accountStartingBalance} type="number" placeholder="$50,000" class="rounded-md" />
            </div>

            {#if accountType === 'prop firm'}
                <div class="space-y-1.5">
                    <div class="text-xs font-medium">Prop Firm Name</div>
                    <Input bind:value={propFirmName} placeholder="Tradeify" class="rounded-md" />
                </div>

                <div class="space-y-1.5">
                    <div class="text-xs font-medium">Prop Firm Type</div>
                    <Select.Root type="single" bind:value={propFirmType}>
                        <Select.Trigger class="w-full rounded-md cursor-pointer">
                            <span class="capitalize">{propFirmType}</span>
                        </Select.Trigger>
                        <Select.Content class="rounded-md">
                            <Select.Item value="evaluation" class="cursor-pointer">
                                Evaluation
                            </Select.Item>
                            <Select.Item value="funded" class="cursor-pointer">
                                Funded
                            </Select.Item>
                            <Select.Item value="live" class="cursor-pointer">
                                Live
                            </Select.Item>
                        </Select.Content>
                    </Select.Root>
                </div>
            {/if}

            {#if hasTradingRules}
                <div class="space-y-1.5">
                    <div class="text-xs font-medium">{accountType === 'prop firm' && propFirmType === 'funded' ? 'Min. payout threshold ($)' : 'Profit Target'}</div>
                    <Input bind:value={profitTarget} type="number" placeholder={accountType === 'prop firm' && propFirmType === 'funded' ? 'e.g. 2000' : '$3,000'} class="rounded-md" />
                </div>

                <div class="space-y-1.5">
                    <div class="text-xs font-medium">Max Drawdown</div>
                    <Input bind:value={maxDrawdown} type="number" placeholder="$2,000" class="rounded-md" />
                </div>

                {#if accountType === 'prop firm'}
                    <div class="space-y-1.5">
                        <div class="text-xs font-medium">Daily Loss Limit</div>
                        <Input bind:value={dailyLossLimit} type="number" placeholder="$1,000 or None" class="rounded-md" />
                    </div>

                    <div class="space-y-1.5">
                        <div class="text-xs font-medium">Consistency Rule</div>
                        <Input bind:value={consistencyRule} placeholder="50%" class="rounded-md" />
                    </div>

                    <div class="space-y-1.5">
                        <div class="text-xs font-medium">Max Contracts</div>
                        <Input bind:value={maxContracts} placeholder="4 minis/40 micros" class="rounded-md" />
                    </div>

                    <div class="space-y-1.5">
                        <div class="text-xs font-medium">Drawdown Type</div>
                        <Select.Root type="single" bind:value={drawdownType}>
                            <Select.Trigger class="w-full rounded-md cursor-pointer">
                                <span>{drawdownType === 'intraday' ? 'Intraday (trailing)' : drawdownType === 'static' ? 'Static' : 'End of day (EOD)'}</span>
                            </Select.Trigger>
                            <Select.Content class="rounded-md">
                                <Select.Item value="eod" class="cursor-pointer">End of day (EOD)</Select.Item>
                                <Select.Item value="intraday" class="cursor-pointer">Intraday (trailing)</Select.Item>
                                <Select.Item value="static" class="cursor-pointer" disabled>Static (coming soon)</Select.Item>
                            </Select.Content>
                        </Select.Root>
                    </div>
                {/if}
            {/if}

            {#if accountType === 'prop firm'}
                {#if propFirmType !== 'funded'}
                    <div class="space-y-1.5">
                        <div class="text-xs font-medium">Challenge cost ($)</div>
                        <Input bind:value={challengeCost} type="number" inputmode="decimal" placeholder="e.g. 149" class="rounded-md" />
                        <p class="text-[11px] text-muted-foreground">What you paid for this evaluation. Used to calculate ROI and break-even.</p>
                    </div>
                {/if}
                {#if propFirmType === 'funded'}
                    <div class="space-y-1.5">
                        <div class="text-xs font-medium">Profit split (%)</div>
                        <Input bind:value={profitSplitPct} type="number" inputmode="decimal" placeholder="e.g. 80" class="rounded-md" />
                        <p class="text-[11px] text-muted-foreground">Your share of profits on payouts (e.g. 80 for 80/20).</p>
                    </div>
                {/if}
            {/if}
        </div>

        <Sheet.Footer class="border-t">
            <div class="flex justify-end gap-2">
                <Button
                    variant="outline"
                    class="rounded-md cursor-pointer"
                    onclick={() => {
                        newAccountOpen = false;
                        // saveError = null;
                        // resetNewTradeForm();
                    }}
                >
                    Cancel
                </Button>
                <Button
                    class="rounded-md bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground cursor-pointer"
                    disabled={creatingAccount}
                    onclick={() => { createAccount() }
                    }
                >
                    {creatingAccount ? "Creating..." : "Create account"}
                </Button>
            </div>
        </Sheet.Footer>
    </Sheet.Content>
</Sheet.Root>
