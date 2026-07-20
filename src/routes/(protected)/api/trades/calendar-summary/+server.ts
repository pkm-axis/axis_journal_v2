import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Lean, un-paginated feed for the P&L Calendar.
 *
 * Returns every *closed* trade for the account with just the fields the
 * calendar needs: the close timestamp and realized P&L. Each row is one
 * complete round-trip position (flat → open → flat), so the calendar counts
 * rows to report trades-per-day. Unlike GET /api/trades this is not paginated,
 * so the calendar reflects the whole account rather than the most recent page.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const accountId = url.searchParams.get("accountId");
	if (!accountId) {
		return json({ success: false, message: "accountId required" }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("trades")
		.select("closed_at, pnl")
		.eq("user_id", user.id)
		.eq("account_id", accountId)
		.is("backtest_session_id", null)
		.eq("status", "closed")
		.not("closed_at", "is", null);

	if (error) {
		console.log("Error:", error);
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data: data ?? [] });
};
