import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Instrument {
    id: string;
    symbol: string;
    exchange: string;
    market_type: string;
    base_currency: string;
    quote_currency: string;
    contract_size: number;
    tick_size: number;
    tick_value: number;
    expiry_date: string;
    max_leverage: number;
    is_active: boolean;
    created_at: string;
}

/** Account-currency value of a 1.0 price move for one contract. */
export function pointValue(instr: Instrument | undefined | null): number {
    if (!instr) return 1;
    return (instr.tick_value / instr.tick_size) * (instr.contract_size ?? 1);
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
                const response = await fetch(
                    `/api/instruments`, 
                    {
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        }
                    }
                );

                const result = await response.json();

                if (!result.success) {
                    throw new Error(result.message || "Failed to get instruments");
                }

                instruments = result.data as Instrument[];
            } catch(e) {
                console.error("Error getting instruments", e)
            } finally {
                loading = false;
            }
        }
    }
}

export const instrumentStore = createInstrumentStore();