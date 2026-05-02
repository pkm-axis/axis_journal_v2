import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	// Verify the account belongs to this user
	const { data: account } = await supabase
		.schema("trading")
		.from("accounts")
		.select("id")
		.eq("id", id)
		.eq("user_id", user.id)
		.single();

	if (!account) return json({ success: false, message: "Account not found" }, { status: 404 });

	// Delete payouts for this account
	const { error: payoutsError } = await supabase
		.schema("trading")
		.from("payouts")
		.delete()
		.eq("account_id", id)
		.eq("user_id", user.id);

	if (payoutsError) return json({ success: false, message: payoutsError.message }, { status: 400 });

	// Delete trades for this account (cascade handles trade_strategies, trade_mistakes)
	const { error: tradesError } = await supabase
		.schema("trading")
		.from("trades")
		.delete()
		.eq("account_id", id)
		.eq("user_id", user.id);

	if (tradesError) return json({ success: false, message: tradesError.message }, { status: 400 });

	return json({ success: true });
};
