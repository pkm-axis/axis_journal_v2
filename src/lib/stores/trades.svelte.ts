import { accountStore } from "$lib/stores/accounts.svelte";
import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

type TradeSide = "long" | "short";
type TradeStatus = "open" | "closed";

/** Fields required to create a trade (POST /api/trades/create). */
export type TradeCreatePayload = {
    account_id: string;
    instrument_id: string | null;
    symbol: string;
    side: TradeSide;
    status: TradeStatus;
    entry_price: number;
    exit_price?: number | null;
    quantity: number;
    stop_loss: number;
    take_profit: number;
    risk: number;
    pnl: number;
    opened_at: string;
    closed_at?: string | null;
    notes?: string;
    emotional_states?: string[];
    confidence?: number | null;
    mental_state?: string | null;
    followed_plan?: "yes" | "no" | "partial" | null;
    entry_reason?: string | null;
    exit_reason?: string | null;
    strategy_ids?: string[];
    mistake_ids?: string[];
    checklist_item_ids?: string[];
};

export interface Trade {
    id: string;
    user_id: string;
    account_id: string | null;
    instrument_id: string | null;
    symbol: string;
    market: string | null;
    side: TradeSide | null;
    status: TradeStatus;
    entry_price: string | number;
    exit_price: string | number | null;
    quantity: string | number;
    stop_loss: string | number | null;
    take_profit: string | number | null;
    risk: string | number | null;
    pnl: string | number | null;
    r_multiple: string | number | null;
    opened_at: string;
    closed_at: string | null;
    notes: string | null;
    screenshot_url: string | null;
    emotional_states: string[] | null;
    confidence: number | null;
    mental_state: string | null;
    followed_plan: "yes" | "no" | "partial" | null;
    entry_reason: string | null;
    exit_reason: string | null;
    created_at: string;
    updated_at: string;
    strategy_ids?: string[];
    mistake_ids?: string[];
    checklist_item_ids?: string[];
}

/** Fields sent to PATCH /api/trades/[id] (no user_id / account_id). */
export type TradeUpdatePayload = {
    instrument_id?: string | null;
    symbol: string;
    side: TradeSide;
    status: string;
    entry_price: number;
    exit_price?: number | null;
    quantity: number;
    stop_loss: number;
    take_profit: number;
    risk: number;
    pnl: number;
    opened_at: string;
    closed_at?: string | null;
    notes?: string | null;
    screenshot_url?: string | null;
    emotional_states?: string[];
    confidence?: number | null;
    mental_state?: string | null;
    followed_plan?: "yes" | "no" | "partial" | null;
    entry_reason?: string | null;
    exit_reason?: string | null;
    strategy_ids?: string[];
    mistake_ids?: string[];
    checklist_item_ids?: string[];
};

export type TradeFilters = {
    page?: number;
    pageSize?: number;
    search?: string;
    side?: "long" | "short" | "all";
    status?: "open" | "closed" | "all";
};

function createTradeStore() {
    let loading = $state(false);
    let trades = $state<Trade[]>([]);
    let total = $state(0);
    let page = $state(1);
    let pageSize = $state(10);
    let lastFilters = $state<TradeFilters>({});

    async function getTradesByAccount(supabase: SupabaseClient, filters: TradeFilters = lastFilters) {
        lastFilters = filters;
        const accountId = accountStore.activeAccountId;
        if (!accountId) {
            trades = [];
            total = 0;
            return;
        }

        const params = new URLSearchParams({ accountId });
        params.set("page",     String(filters.page     ?? 1));
        params.set("pageSize", String(filters.pageSize ?? 10));
        if (filters.search)                params.set("search", filters.search);
        if (filters.side   && filters.side   !== "all") params.set("side",   filters.side);
        if (filters.status && filters.status !== "all") params.set("status", filters.status);

        try {
            loading = true;
            const token = await getAuthToken(supabase);
            const response = await fetch(`/api/trades?${params.toString()}`, {
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || "Failed to get trades for this account");
            }

            trades    = result.data as Trade[];
            total     = result.total ?? 0;
            page      = result.page  ?? 1;
            pageSize  = result.pageSize ?? 25;
        } catch (e) {
            console.error("Error getting trades for this account", e);
        } finally {
            loading = false;
        }
    }

    return {
        get loading()  { return loading;  },
        get trades()   { return trades;   },
        get total()    { return total;    },
        get page()     { return page;     },
        get pageSize() { return pageSize; },
        clear: () => {
            trades = [];
            total  = 0;
            page   = 1;
        },
        getTradesByAccount,
        createTrade: async (supabase: SupabaseClient, payload: TradeCreatePayload) => {
            try {
                const token = await getAuthToken(supabase);
                const response = await fetch(`/api/trades/create`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(payload),
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.message || "Failed to create trade");
                }

                await getTradesByAccount(supabase);
                return result.data as Trade;
            } catch (e) {
                console.error("Error creating trade:", e);
                throw e;
            }
        },
        deleteTrade: async (supabase: SupabaseClient, tradeId: string) => {
            try {
                const token = await getAuthToken(supabase);
                const response = await fetch(`/api/trades/${encodeURIComponent(tradeId)}`, {
                    method: "DELETE",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.message || "Failed to delete trade");
                }

                await getTradesByAccount(supabase);
            } catch (e) {
                console.error("Error deleting trade:", e);
                throw e;
            }
        },
        updateTrade: async (supabase: SupabaseClient, tradeId: string, payload: TradeUpdatePayload) => {
            try {
                const token = await getAuthToken(supabase);
                const response = await fetch(`/api/trades/${encodeURIComponent(tradeId)}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(payload),
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.message || "Failed to update trade");
                }

                await getTradesByAccount(supabase);
            } catch (e) {
                console.error("Error updating trade:", e);
                throw e;
            }
        },
    };
}

export const tradeStore = createTradeStore();