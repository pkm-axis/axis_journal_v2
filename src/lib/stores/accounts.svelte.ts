import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

const ACTIVE_ACCOUNT_KEY = "axis:active-account-id";

function readActiveAccountId(): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

/**
 * Account lifecycle. Anything other than "active" is archived: hidden from the
 * switcher and pickers, but still counted in cost totals and still available in
 * history. See 20260816000100_account_status.sql.
 */
export type AccountStatus = "active" | "breached" | "passed" | "closed";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
    active: "Active",
    breached: "Breached",
    passed: "Passed",
    closed: "Closed"
};

export interface Account {
    id: string;
    name: string;
    account_type: string;
    /** Absent on rows written before the status migration; treat as "active". */
    status?: AccountStatus;
    status_changed_at?: string | null;
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
        /**
         * Accounts still being traded. The switcher and every account picker use
         * this; settings and any cost or history view use `accounts` so archived
         * accounts keep contributing their spend.
         */
        get activeAccounts() {
            return accounts.filter((a) => (a.status ?? "active") === "active");
        },
        get archivedAccounts() {
            return accounts.filter((a) => (a.status ?? "active") !== "active");
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
        /**
         * Archive or restore. Sent on its own so the API's graduated-account lock
         * lets it through — retiring an account is a lifecycle change, not an edit.
         */
        setStatus: async (supabase: SupabaseClient, id: string, status: AccountStatus) => {
            await accountStore.updateAccount(supabase, id, { status });
            // Don't leave the sidebar pointed at an account that just left the list.
            if (status !== "active" && activeAccountId === id) {
                const next = accounts.find(
                    (a) => a.id !== id && (a.status ?? "active") === "active"
                );
                accountStore.setActiveAccountId(next?.id ?? null);
            }
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