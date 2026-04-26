import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Strategy {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    created_at: string;
}

function createStrategyStore() {
    let loading = $state(false);
    let strategies = $state<Strategy[]>([]);

    async function authHeaders(supabase: SupabaseClient) {
        const token = await getAuthToken(supabase);
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        };
    }

    async function getStrategies(supabase: SupabaseClient) {
        try {
            loading = true;
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/strategies`, { credentials: "include", headers });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to load strategies");
            strategies = result.data as Strategy[];
        } catch (e) {
            console.error("Error loading strategies", e);
        } finally {
            loading = false;
        }
    }

    return {
        get loading() {
            return loading;
        },
        get strategies() {
            return strategies;
        },
        getStrategies,
        createStrategy: async (
            supabase: SupabaseClient,
            payload: { name: string; description?: string | null }
        ) => {
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/strategies`, {
                method: "POST",
                credentials: "include",
                headers,
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to create strategy");
            await getStrategies(supabase);
        },
        updateStrategy: async (
            supabase: SupabaseClient,
            id: string,
            payload: { name?: string; description?: string | null }
        ) => {
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/strategies/${encodeURIComponent(id)}`, {
                method: "PATCH",
                credentials: "include",
                headers,
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to update strategy");
            await getStrategies(supabase);
        },
        deleteStrategy: async (supabase: SupabaseClient, id: string) => {
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/strategies/${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "include",
                headers
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to delete strategy");
            await getStrategies(supabase);
        }
    };
}

export const strategyStore = createStrategyStore();
