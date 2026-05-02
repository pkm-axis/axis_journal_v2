import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const accountId = url.searchParams.get("accountId")?.trim();

	let query = supabase
		.schema("trading")
		.from("payouts")
		.select("*")
		.eq("user_id", user.id)
		.order("payout_date", { ascending: false });

	if (accountId) query = query.eq("account_id", accountId);

	const { data, error } = await query;

	if (error) return json({ success: false, message: error.message }, { status: 400 });

	return json({ success: true, data });
};
