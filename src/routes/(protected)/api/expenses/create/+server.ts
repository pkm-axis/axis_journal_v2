import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { EXPENSE_KINDS, isExpenseKind } from "$lib/utils/expense-kinds";

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const { account_id, kind, amount, currency, incurred_on, notes } = await request.json();

	if (typeof account_id !== "string" || !account_id) {
		return json({ success: false, message: "An account is required." }, { status: 400 });
	}
	if (!isExpenseKind(kind)) {
		return json({ success: false, message: `kind must be one of: ${EXPENSE_KINDS.join(", ")}` }, { status: 400 });
	}

	const value = Number(amount);
	if (!Number.isFinite(value) || value < 0) {
		return json({ success: false, message: "Amount must be a positive number." }, { status: 400 });
	}

	// An expense row carries the caller's user_id, so RLS alone wouldn't stop it
	// naming someone else's account. Check ownership explicitly.
	const { count, error: ownErr } = await supabase
		.schema("trading")
		.from("accounts")
		.select("id", { count: "exact", head: true })
		.eq("user_id", user.id)
		.eq("id", account_id);
	if (ownErr) return json({ success: false, message: ownErr.message }, { status: 400 });
	if ((count ?? 0) === 0) {
		return json({ success: false, message: "Account not found." }, { status: 404 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("account_expenses")
		.insert({
			user_id: user.id,
			account_id,
			kind,
			amount: value,
			currency: typeof currency === "string" && currency.trim() ? currency.trim() : "USD",
			incurred_on: typeof incurred_on === "string" && incurred_on.trim() ? incurred_on.trim() : undefined,
			notes: typeof notes === "string" && notes.trim() ? notes.trim() : null
		})
		.select()
		.single();

	if (error) return json({ success: false, message: error.message }, { status: 400 });

	return json({ success: true, data, message: "Expense recorded." });
};
