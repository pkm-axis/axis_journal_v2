import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const { account_id, gross_amount, payout_date, notes } = await request.json();

	if (!account_id || gross_amount == null) {
		return json({ success: false, message: "account_id and gross_amount are required" }, { status: 400 });
	}

	const { data: account } = await supabase
		.schema("trading")
		.from("accounts")
		.select("id, parent_account_id, account_type, profit_split")
		.eq("id", account_id)
		.eq("user_id", user.id)
		.single();

	if (!account) return json({ success: false, message: "Account not found" }, { status: 404 });
	if (!account.parent_account_id) {
		return json({ success: false, message: "Payouts can only be recorded on funded accounts that graduated from an evaluation." }, { status: 403 });
	}

	const split: number = account.profit_split ?? 0.8;
	const amount = Number(gross_amount) * split;

	const { data, error } = await supabase
		.schema("trading")
		.from("payouts")
		.insert({
			user_id: user.id,
			account_id,
			gross_amount: Number(gross_amount),
			amount,
			profit_split: split,
			status: "requested",
			payout_date: payout_date ?? new Date().toISOString(),
			notes: notes ?? null,
		})
		.select()
		.single();

	if (error) return json({ success: false, message: error.message }, { status: 400 });

	return json({ success: true, data });
};
