import { getAuthToken } from "$lib/utils/auth-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PayoutStatus = "requested" | "pending" | "approved" | "received";

export interface Payout {
	id: string;
	account_id: string;
	user_id: string;
	gross_amount: number | null;
	amount: number;
	profit_split: number | null;
	status: PayoutStatus;
	payout_date: string;
	notes: string | null;
	created_at: string;
}

export interface PayoutCreatePayload {
	account_id: string;
	gross_amount: number;
	payout_date: string;
	notes?: string | null;
}

function createPayoutStore() {
	let loading = $state(false);
	let payouts = $state<Payout[]>([]);
	let allPayouts = $state<Payout[]>([]);

	async function getPayoutsByAccount(supabase: SupabaseClient, accountId: string) {
		try {
			loading = true;
			const token = await getAuthToken(supabase);
			const res = await fetch(`/api/payouts?accountId=${encodeURIComponent(accountId)}`, {
				credentials: "include",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to fetch payouts");
			payouts = result.data as Payout[];
		} catch (e) {
			console.error("Error fetching payouts:", e);
		} finally {
			loading = false;
		}
	}

	async function getAllPayouts(supabase: SupabaseClient) {
		try {
			const token = await getAuthToken(supabase);
			const res = await fetch("/api/payouts", {
				credentials: "include",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to fetch payouts");
			allPayouts = result.data as Payout[];
		} catch (e) {
			console.error("Error fetching all payouts:", e);
		}
	}

	return {
		get loading() { return loading; },
		get payouts() { return payouts; },
		get allPayouts() { return allPayouts; },
		clear: () => { payouts = []; allPayouts = []; },
		getPayoutsByAccount,
		getAllPayouts,
		createPayout: async (supabase: SupabaseClient, payload: PayoutCreatePayload) => {
			const token = await getAuthToken(supabase);
			const res = await fetch("/api/payouts/create", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify(payload),
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to create payout");
			await getPayoutsByAccount(supabase, payload.account_id);
		},
		updateStatus: async (supabase: SupabaseClient, payoutId: string, status: PayoutStatus, accountId: string) => {
			const token = await getAuthToken(supabase);
			const res = await fetch(`/api/payouts/${encodeURIComponent(payoutId)}`, {
				method: "PATCH",
				credentials: "include",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({ status }),
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to update payout");
			await getPayoutsByAccount(supabase, accountId);
		},
		deletePayout: async (supabase: SupabaseClient, payoutId: string, accountId: string) => {
			const token = await getAuthToken(supabase);
			const res = await fetch(`/api/payouts/${encodeURIComponent(payoutId)}`, {
				method: "DELETE",
				credentials: "include",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			});
			const result = await res.json();
			if (!result.success) throw new Error(result.message ?? "Failed to delete payout");
			await getPayoutsByAccount(supabase, accountId);
		},
	};
}

export const payoutStore = createPayoutStore();
