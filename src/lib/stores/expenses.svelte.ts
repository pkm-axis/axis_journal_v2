import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseKind } from "$lib/utils/expense-kinds";

/**
 * Outflows against a trading account: challenge fees, resets, activation and
 * recurring platform or data-feed charges. Archived accounts keep their entries
 * — the point of the ledger is that a breached account's spend still counts.
 */
export interface Expense {
	id: string;
	user_id: string;
	account_id: string;
	kind: ExpenseKind;
	amount: number;
	currency: string;
	incurred_on: string;
	notes: string | null;
	created_at: string;
}

export interface ExpenseCreatePayload {
	account_id: string;
	kind: ExpenseKind;
	amount: number;
	currency?: string;
	incurred_on?: string;
	notes?: string | null;
}

export type ExpenseUpdatePayload = Partial<
	Pick<Expense, "kind" | "amount" | "incurred_on" | "notes">
>;

function createExpenseStore() {
	let loading = $state(false);
	let expenses = $state<Expense[]>([]);

	async function authHeaders(supabase: SupabaseClient) {
		const token = await getAuthToken(supabase);
		return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
	}

	async function getAll(supabase: SupabaseClient, accountId?: string) {
		try {
			loading = true;
			const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
			const res = await fetch(`/api/expenses${qs}`, {
				credentials: "include",
				headers: await authHeaders(supabase)
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to fetch expenses");
			expenses = (result.data ?? []).map((e: Expense) => ({ ...e, amount: Number(e.amount) }));
		} catch (e) {
			console.error("Error fetching expenses:", e);
		} finally {
			loading = false;
		}
	}

	return {
		get loading() {
			return loading;
		},
		get expenses() {
			return expenses;
		},
		/** Total spend across every account, archived included. */
		get total() {
			return expenses.reduce((sum, e) => sum + e.amount, 0);
		},
		totalForAccount(accountId: string) {
			return expenses
				.filter((e) => e.account_id === accountId)
				.reduce((sum, e) => sum + e.amount, 0);
		},
		clear: () => {
			expenses = [];
		},
		getAll,
		create: async (supabase: SupabaseClient, payload: ExpenseCreatePayload) => {
			const res = await fetch("/api/expenses/create", {
				method: "POST",
				credentials: "include",
				headers: await authHeaders(supabase),
				body: JSON.stringify(payload)
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to record expense");
			await getAll(supabase);
			return result.data as Expense;
		},
		update: async (supabase: SupabaseClient, id: string, payload: ExpenseUpdatePayload) => {
			const res = await fetch(`/api/expenses/${encodeURIComponent(id)}`, {
				method: "PATCH",
				credentials: "include",
				headers: await authHeaders(supabase),
				body: JSON.stringify(payload)
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to update expense");
			await getAll(supabase);
		},
		remove: async (supabase: SupabaseClient, id: string) => {
			const res = await fetch(`/api/expenses/${encodeURIComponent(id)}`, {
				method: "DELETE",
				credentials: "include",
				headers: await authHeaders(supabase)
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to delete expense");
			await getAll(supabase);
		}
	};
}

export const expenseStore = createExpenseStore();
