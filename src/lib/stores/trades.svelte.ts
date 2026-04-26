import { accountStore } from "$lib/stores/accounts.svelte";
import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

type TradeSide = "long" | "short";

interface Trade {
    account_id: string;
    instrument_id: string | null;
    symbol: string;
    side: TradeSide;
    status: string;
    entry_price: number;
    exit_price?: number | null;
    quantity: number; // mini/micro
    stop_loss: number;
    take_profit: number;
    /** Max loss in account currency if the stop is hit. */
    risk: number;
    pnl: number;
    opened_at: string;
    closed_at?: string | null;
    notes?: string;
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
};

function createTradeStore() {
    let loading = $state(false);
    let trades = $state<Trade[]>([]);

    async function getTradesByAccount(supabase: SupabaseClient) {
        const accountId = accountStore.activeAccountId;
        if (!accountId) {
            trades = [];
            return;
        }

        try {
            loading = true;
            const token = await getAuthToken(supabase);
            const response = await fetch(
                `/api/trades?accountId=${encodeURIComponent(accountId)}`,
                {
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                },
            );

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || "Failed to get trades for this account");
            }

            trades = result.data as Trade[];
        } catch (e) {
            console.error("Error getting trades for this account", e);
        } finally {
            loading = false;
        }
    }

    return {
        get loading() {
            return loading;
        },
        get trades() {
            return trades;
        },
        clear: () => {
            trades = [];
        },
        getTradesByAccount,
        createTrade: async (supabase: SupabaseClient, payload: Trade) => {
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
            } catch (e) {
                console.error("Error creating trade:", e);
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