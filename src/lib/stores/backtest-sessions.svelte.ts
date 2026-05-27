import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface BacktestSession {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    instrument_id: string | null;
    starting_balance: number | null;
    period_start: string | null;
    period_end: string | null;
    notes: string | null;
    archived: boolean;
    created_at: string;
    updated_at: string;
    trade_count?: number;
    net_pnl?: number;
    win_rate?: number | null;
}

export type BacktestSessionPayload = {
    name: string;
    description?: string | null;
    instrument_id?: string | null;
    starting_balance?: number | null;
    period_start?: string | null;
    period_end?: string | null;
    notes?: string | null;
    archived?: boolean;
};

function createBacktestSessionStore() {
    let loading = $state(false);
    let sessions = $state<BacktestSession[]>([]);
    let current = $state<BacktestSession | null>(null);

    return {
        get loading() { return loading; },
        get sessions() { return sessions; },
        get current()  { return current;  },
        clear: () => { sessions = []; current = null; },
        getAll: async (supabase: SupabaseClient, opts: { includeArchived?: boolean } = {}) => {
            try {
                loading = true;
                const token = await getAuthToken(supabase);
                const params = new URLSearchParams();
                if (opts.includeArchived) params.set("includeArchived", "true");
                const qs = params.toString() ? `?${params.toString()}` : "";
                const res = await fetch(`/api/backtest-sessions${qs}`, {
                    credentials: "include",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                });
                const result = await res.json();
                if (!result.success) throw new Error(result.message ?? "Failed to load sessions");
                sessions = result.data as BacktestSession[];
            } catch (e) {
                console.error("Error loading backtest sessions:", e);
            } finally {
                loading = false;
            }
        },
        getById: async (supabase: SupabaseClient, id: string) => {
            try {
                const token = await getAuthToken(supabase);
                const res = await fetch(`/api/backtest-sessions/${encodeURIComponent(id)}`, {
                    credentials: "include",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                });
                const result = await res.json();
                if (!result.success) throw new Error(result.message ?? "Failed to load session");
                current = result.data as BacktestSession;
                return current;
            } catch (e) {
                console.error("Error loading backtest session:", e);
                throw e;
            }
        },
        create: async (supabase: SupabaseClient, payload: BacktestSessionPayload) => {
            const token = await getAuthToken(supabase);
            const res = await fetch(`/api/backtest-sessions`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.message ?? "Failed to create session");
            sessions = [result.data as BacktestSession, ...sessions];
            return result.data as BacktestSession;
        },
        update: async (supabase: SupabaseClient, id: string, payload: Partial<BacktestSessionPayload>) => {
            const token = await getAuthToken(supabase);
            const res = await fetch(`/api/backtest-sessions/${encodeURIComponent(id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.message ?? "Failed to update session");
            const updated = result.data as BacktestSession;
            sessions = sessions.map((s) => (s.id === id ? { ...s, ...updated } : s));
            if (current?.id === id) current = { ...current, ...updated };
            return updated;
        },
        remove: async (supabase: SupabaseClient, id: string) => {
            const token = await getAuthToken(supabase);
            const res = await fetch(`/api/backtest-sessions/${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.message ?? "Failed to delete session");
            sessions = sessions.filter((s) => s.id !== id);
            if (current?.id === id) current = null;
        },
    };
}

export const backtestSessionStore = createBacktestSessionStore();
