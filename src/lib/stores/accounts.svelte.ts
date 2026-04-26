import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Account {
    id: string;
    name: string;
    account_type: string;
    logo?: unknown;
}

function createAccountStore() {
    let loading = $state(false);
    let accounts = $state<Account[]>([]);
    let activeAccountId = $state<string | null>(null);

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
        },
        clear: () => {
            accounts = [];
            activeAccountId = null;
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
                    throw new Error(result.error.message || "Failed to get accounts");
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
        }
    }
}

export const accountStore = createAccountStore();