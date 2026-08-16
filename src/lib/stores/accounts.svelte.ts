import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

const ACTIVE_ACCOUNT_KEY = "axis:active-account-id";

function readActiveAccountId(): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

export interface Account {
    id: string;
    name: string;
    account_type: string;
    logo?: unknown;
    starting_balance?: number | null;
    prop_firm_name?: string | null;
    prop_firm_type?: string | null;
    prop_firm_profit_target?: number | null;
    prop_firm_max_drawdown?: number | null;
    prop_firm_daily_loss_limit?: number | null;
    prop_firm_consistency_rule?: string | null;
    prop_firm_max_contracts?: string | null;
    prop_firm_drawdown_type?: "eod" | "intraday" | "static" | null;
    challenge_cost?: number | null;
    profit_split?: number | null;
    parent_account_id?: string | null;
}

function createAccountStore() {
    let loading = $state(false);
    let accounts = $state<Account[]>([]);
    let activeAccountId = $state<string | null>(readActiveAccountId());

    return {
        get loading() {
            return loading;
        },
        get accounts() {
            return accounts;
        },
        get activeAccountId() {
            return activeAccountId;
        },
        setActiveAccountId: (id: string | null) => {
            activeAccountId = id;
            if (id) localStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
            else localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
        },
        clear: () => {
            accounts = [];
            activeAccountId = null;
            localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
        },
        getAllAccounts: async(supabase: SupabaseClient) => {
            try {
                loading = true;
                const token = await getAuthToken(supabase);
                const response = await fetch(`/api/accounts`, {
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                });

                const result = await response.json();

                if(!result.success) {
                    // TODO: Toast
                    // `error` is a bare string on 401 and absent on 400 (which
                    // uses `message`), so reaching for `error.message` threw a
                    // TypeError and buried the real reason the list came back empty.
                    const reason =
                        typeof result.error === "string" ? result.error : result.error?.message;
                    throw new Error(reason || result.message || "Failed to get accounts");
                }

                accounts = result.data;
            } catch (e) {
                console.error("Error getting accounts:", e);
            } finally {
                loading = false;
            }
        },
        createAccount: async(supabase: SupabaseClient, payload: any) => {
            try {
                loading = true;
                const token = await getAuthToken(supabase);
                const response = await fetch(`/api/accounts/create`, {
                    method: "POST",
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if(!result.success) {
                    // TODO: Toast
                    throw new Error(result.message || "Failed to create account");
                }

                // update local state
                accounts = [...accounts, result.data];
            } catch(e) {
                console.error("Error getting accounts:", e)
            } finally {
                loading = false;
            }
        },
        updateAccount: async (supabase: SupabaseClient, id: string, payload: Partial<Account>) => {
            const token = await getAuthToken(supabase);
            const response = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message ?? "Failed to update account");
            await accountStore.getAllAccounts(supabase);
        },
        deleteAccount: async (supabase: SupabaseClient, id: string) => {
            const token = await getAuthToken(supabase);
            const response = await fetch(`/api/accounts/${encodeURIComponent(id)}`, {
                method: "DELETE",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message ?? "Failed to delete account");
            if (activeAccountId === id) accountStore.setActiveAccountId(null);
            await accountStore.getAllAccounts(supabase);
        },
    };
}

export const accountStore = createAccountStore();