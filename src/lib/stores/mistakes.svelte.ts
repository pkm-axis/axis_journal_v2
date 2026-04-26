import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Mistake {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    created_at: string;
}

function createMistakeStore() {
    let loading = $state(false);
    let mistakes = $state<Mistake[]>([]);

    async function authHeaders(supabase: SupabaseClient) {
        const token = await getAuthToken(supabase);
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        };
    }

    async function getMistakes(supabase: SupabaseClient) {
        try {
            loading = true;
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/mistakes`, { credentials: "include", headers });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to load mistakes");
            mistakes = result.data as Mistake[];
        } catch (e) {
            console.error("Error loading mistakes", e);
        } finally {
            loading = false;
        }
    }

    return {
        get loading() {
            return loading;
        },
        get mistakes() {
            return mistakes;
        },
        getMistakes,
        createMistake: async (
            supabase: SupabaseClient,
            payload: { name: string; description?: string | null }
        ) => {
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/mistakes`, {
                method: "POST",
                credentials: "include",
                headers,
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to create mistake");
            await getMistakes(supabase);
        },
        updateMistake: async (
            supabase: SupabaseClient,
            id: string,
            payload: { name?: string; description?: string | null }
        ) => {
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/mistakes/${encodeURIComponent(id)}`, {
                method: "PATCH",
                credentials: "include",
                headers,
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to update mistake");
            await getMistakes(supabase);
        },
        deleteMistake: async (supabase: SupabaseClient, id: string) => {
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/mistakes/${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "include",
                headers
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to delete mistake");
            await getMistakes(supabase);
        }
    };
}

export const mistakeStore = createMistakeStore();
