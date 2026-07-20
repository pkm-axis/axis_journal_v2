import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DailyJournalEntry {
    id: string;
    user_id: string;
    entry_date: string; // YYYY-MM-DD
    rating: number | null;
    what_went_well: string | null;
    what_went_wrong: string | null;
    lessons: string | null;
    created_at: string;
    updated_at: string;
}

export type DailyJournalPayload = {
    entry_date: string;
    rating: number | null;
    what_went_well: string | null;
    what_went_wrong: string | null;
    lessons: string | null;
};

function createJournalStore() {
    let loading = $state(false);
    let entries = $state<DailyJournalEntry[]>([]);

    async function authHeaders(supabase: SupabaseClient) {
        const token = await getAuthToken(supabase);
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        };
    }

    async function getEntries(supabase: SupabaseClient) {
        try {
            loading = true;
            const headers = await authHeaders(supabase);
            const response = await fetch(`/api/journal`, { credentials: "include", headers });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || "Failed to load journal entries");
            entries = result.data as DailyJournalEntry[];
        } catch (e) {
            console.error("Error loading journal entries", e);
        } finally {
            loading = false;
        }
    }

    return {
        get loading() { return loading; },
        get entries() { return entries; },
        clear: () => { entries = []; },
        getEntries,
        saveEntry: async (supabase: SupabaseClient, payload: DailyJournalPayload): Promise<DailyJournalEntry> => {
            try {
                const headers = await authHeaders(supabase);
                const response = await fetch(`/api/journal`, {
                    method: "PUT",
                    credentials: "include",
                    headers,
                    body: JSON.stringify(payload),
                });
                const result = await response.json();
                if (!result.success) throw new Error(result.message || "Failed to save journal entry");
                await getEntries(supabase);
                return result.data as DailyJournalEntry;
            } catch (e) {
                console.error("Error saving journal entry", e);
                throw e;
            }
        },
        deleteEntry: async (supabase: SupabaseClient, id: string): Promise<void> => {
            try {
                const headers = await authHeaders(supabase);
                const response = await fetch(`/api/journal/${encodeURIComponent(id)}`, {
                    method: "DELETE",
                    credentials: "include",
                    headers,
                });
                const result = await response.json();
                if (!result.success) throw new Error(result.message || "Failed to delete journal entry");
                await getEntries(supabase);
            } catch (e) {
                console.error("Error deleting journal entry", e);
                throw e;
            }
        },
    };
}

export const journalStore = createJournalStore();
