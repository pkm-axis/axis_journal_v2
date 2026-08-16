import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Lean, un-paginated feed for the P&L Calendar.
 *
 * Returns every *closed* trade with just the fields the calendar needs: the
 * close timestamp, realized P&L, and owning account. Each row is one complete
 * round-trip position (flat → open → flat), so the calendar counts rows to
 * report trades-per-day. Unlike GET /api/trades this is not paginated.
 *
 * By default this spans *every* account the user owns — the calendar is a
 * whole-book view, not a per-account one. Pass `accountId` to scope it to a
 * single account.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const accountId = url.searchParams.get("accountId");

	let query = supabase
		.schema("trading")
		.from("trades")
		.select("closed_at, pnl, account_id")
		.eq("user_id", user.id)
		.is("backtest_session_id", null)
		.eq("status", "closed")
		.not("closed_at", "is", null);

	if (accountId) {
		query = query.eq("account_id", accountId);
	}

	const { data, error } = await query;

	if (error) {
		console.log("Error:", error);
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data: data ?? [] });
};
