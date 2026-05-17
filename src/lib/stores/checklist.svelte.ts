import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChecklistItem {
    id: string;
    user_id: string;
    label: string;
    sort_order: number;
    created_at: string;
}

function createChecklistStore() {
    let loading = $state(false);
    let items = $state<ChecklistItem[]>([]);

    async function authHeaders(supabase: SupabaseClient) {
        const token = await getAuthToken(supabase);
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        };
    }

    async function getItems(supabase: SupabaseClient) {
        try {
            loading = true;
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/checklist`, { credentials: "include", headers });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to load checklist");
            items = result.data as ChecklistItem[];
        } catch (e) {
            console.error("Error loading checklist", e);
        } finally {
            loading = false;
        }
    }

    return {
        get loading() { return loading; },
        get items() { return items; },
        getItems,
        createItem: async (
            supabase: SupabaseClient,
            payload: { label: string; sort_order?: number }
        ) => {
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/checklist`, {
                method: "POST",
                credentials: "include",
                headers,
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to create checklist item");
            await getItems(supabase);
        },
        updateItem: async (
            supabase: SupabaseClient,
            id: string,
            payload: { label?: string; sort_order?: number }
        ) => {
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/checklist/${encodeURIComponent(id)}`, {
                method: "PATCH",
                credentials: "include",
                headers,
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to update checklist item");
            await getItems(supabase);
        },
        deleteItem: async (supabase: SupabaseClient, id: string) => {
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/checklist/${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "include",
                headers
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to delete checklist item");
            await getItems(supabase);
        }
    };
}

export const checklistStore = createChecklistStore();
