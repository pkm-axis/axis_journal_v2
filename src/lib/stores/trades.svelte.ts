import { accountStore } from "$lib/stores/accounts.svelte";
import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

type TradeSide = "long" | "short";
type TradeStatus = "open" | "closed";

/** Fields required to create a trade (POST /api/trades/create). */
export type TradeCreatePayload = {
    account_id?: string | null;
    backtest_session_id?: string | null;
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
    commission?: number;
    highest_unrealized_profit?: number | null;
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
    /**
     * Copytrading: additional accounts to log this same decision against. Each
     * becomes its own trade row sharing a `trade_group_id` with the primary, so
     * cross-account aggregates can count the decision once. Only `quantity`,
     * `pnl`, `commission` and `highest_unrealized_profit` may differ per account;
     * omit a field to inherit the primary's value.
     */
    mirror_accounts?: TradeMirrorInput[];
};

export type TradeMirrorInput = {
    account_id: string;
    quantity?: number | null;
    pnl?: number | null;
    commission?: number | null;
    highest_unrealized_profit?: number | null;
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
    commission: string | number | null;
    highest_unrealized_profit: string | number | null;
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
    is_backtest: boolean;
    backtest_session_id: string | null;
    /** Shared by mirrored (copytraded) rows; null when the trade stands alone. */
    trade_group_id: string | null;
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
    commission?: number;
    highest_unrealized_profit?: number | null;
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

export interface TradeExecution {
    id: string;
    trade_id: string;
    user_id: string;
    kind: "entry" | "exit";
    quantity: string | number;
    price: string | number;
    fees: string | number;
    stop_loss: string | number | null;
    take_profit: string | number | null;
    executed_at: string;
    reason: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export type TradeExecutionInput = {
    kind: "entry" | "exit";
    quantity: number;
    price: number;
    fees?: number;
    stop_loss?: number | null;
    take_profit?: number | null;
    executed_at: string;
    reason?: string | null;
    notes?: string | null;
};

/** One closed round-trip trade, reduced to what the P&L Calendar needs. */
export type TradeCalendarRow = {
    closed_at: string | null;
    pnl: string | number | null;
    account_id: string | null;
};

export type TradeFilters = {
    page?: number;
    pageSize?: number;
    search?: string;
    side?: "long" | "short" | "all";
    status?: "open" | "closed" | "all";
    sessionId?: string | null;
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
        const params = new URLSearchParams();
        if (filters.sessionId) {
            params.set("sessionId", filters.sessionId);
        } else {
            const accountId = accountStore.activeAccountId;
            if (!accountId) {
                trades = [];
                total = 0;
                return;
            }
            params.set("accountId", accountId);
        }
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
        /**
         * Closed trades for the P&L Calendar. Omit `accountId` (the default) to
         * span every account the user owns; pass one to scope to that account.
         */
        getCalendarSummary: async (
            supabase: SupabaseClient,
            accountId?: string | null
        ): Promise<TradeCalendarRow[]> => {
            try {
                const token = await getAuthToken(supabase);
                const params = new URLSearchParams();
                if (accountId) params.set("accountId", accountId);
                const suffix = params.size > 0 ? `?${params.toString()}` : "";
                const response = await fetch(
                    `/api/trades/calendar-summary${suffix}`,
                    {
                        credentials: "include",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    }
                );
                const result = await response.json();
                if (!result.success) throw new Error(result.message ?? "Failed to load calendar summary");
                return (result.data ?? []) as TradeCalendarRow[];
            } catch (e) {
                console.error("Error loading calendar summary:", e);
                throw e;
            }
        },
        listExecutions: async (supabase: SupabaseClient, tradeId: string): Promise<TradeExecution[]> => {
            try {
                const token = await getAuthToken(supabase);
                const response = await fetch(`/api/trades/${encodeURIComponent(tradeId)}/executions`, {
                    credentials: "include",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                });
                const result = await response.json();
                if (!result.success) throw new Error(result.message ?? "Failed to load executions");
                return (result.data ?? []) as TradeExecution[];
            } catch (e) {
                console.error("Error loading executions:", e);
                throw e;
            }
        },
        replaceExecutions: async (
            supabase: SupabaseClient,
            tradeId: string,
            executions: TradeExecutionInput[]
        ): Promise<TradeExecution[]> => {
            try {
                const token = await getAuthToken(supabase);
                const response = await fetch(`/api/trades/${encodeURIComponent(tradeId)}/executions`, {
                    method: "PUT",
                    credentials: "include",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ executions }),
                });
                const result = await response.json();
                if (!result.success) throw new Error(result.message ?? "Failed to save executions");
                return (result.data ?? []) as TradeExecution[];
            } catch (e) {
                console.error("Error replacing executions:", e);
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