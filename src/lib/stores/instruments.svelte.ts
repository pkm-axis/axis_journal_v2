import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

interface Instrument {
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