import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Instrument {
    id: string;
    symbol: string;
    exchange: string;
    market_type: string;
    base_currency: string;
    quote_currency: string;
    tick_size: number;
    tick_value: number;
    /** Effective for the current user: their override if set, else 0. */
    commission_per_side: number;
    /** Effective for the current user. */
    is_active: boolean;
    /** True when this user has set a custom override row. */
    has_override: boolean;
    expiry_date: string | null;
    created_at: string;
}

/** Account-currency value of a 1.0 price move for one contract.
 *  tick_value already represents the per-contract dollar value per tick,
 *  so point value = tick_value / tick_size. */
export function pointValue(instr: Instrument | undefined | null): number {
    if (!instr) return 1;
    return instr.tick_value / instr.tick_size;
}

/** P&L in account currency for a price move on a given instrument. */
export function instrumentPnl(
    instr: Instrument | undefined | null,
    side: "long" | "short",
    from: number,
    to: number,
    quantity: number
): number {
    const move = side === "long" ? to - from : from - to;
    return move * pointValue(instr) * quantity;
}

function createInstrumentStore() {
    let loading = $state(false);
    let instruments = $state<Instrument[]>([]);

    return {
        get loading() {
            return loading;
        },
        get instruments() {
            return instruments;
        },
        getInstruments: async (supabase: SupabaseClient) => {
            try {
                loading = true;
                const token = await getAuthToken(supabase);
                const response = await fetch(`/api/instruments`, {
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                });

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.message || "Failed to get instruments");
                }

                instruments = result.data as Instrument[];
            } catch (e) {
                console.error("Error getting instruments", e);
            } finally {
                loading = false;
            }
        },
        /** Upsert the current user's override (commission, is_active) for a catalog instrument. */
        updateInstrument: async (
            supabase: SupabaseClient,
            id: string,
            payload: { commission_per_side?: number; is_active?: boolean }
        ) => {
            const token = await getAuthToken(supabase);
            const response = await fetch(`/api/instruments/${encodeURIComponent(id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message ?? "Failed to update instrument");
            await instrumentStore.getInstruments(supabase);
        },
    };
}

export const instrumentStore = createInstrumentStore();
