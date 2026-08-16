import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const backtest = url.searchParams.get("backtest") ?? "live";

	let query = supabase
		.schema("trading")
		.from("trades")
		.select("id, symbol, side, status, pnl, opened_at, account_id, is_backtest, strategy_id, trade_mistakes(mistake_id)")
		.eq("user_id", user.id)
		.order("opened_at", { ascending: false });

	if (backtest === "live")     query = query.eq("is_backtest", false);
	if (backtest === "backtest") query = query.eq("is_backtest", true);

	const { data, error } = await query;

	if (error) return json({ success: false, message: error.message }, { status: 400 });

	const flattened = (data ?? []).map((t: Record<string, unknown>) => {
		// One strategy per trade — see the note in /api/trades.
		const strategyId = (t.strategy_id as string | null) ?? null;
		const mLinks = (t.trade_mistakes as { mistake_id: string }[] | null) ?? [];
		const { trade_mistakes, ...rest } = t;
		return {
			...rest,
			strategy_ids: strategyId ? [strategyId] : [],
			mistake_ids: mLinks.map((l) => l.mistake_id),
		};
	});

	return json({ success: true, data: flattened });
};
