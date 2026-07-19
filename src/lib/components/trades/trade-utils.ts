import { num, normalizeSide, riskRewardRatio } from "$lib/utils/number";

/** A trade row as returned by the trades API / store, used across the trades UI. */
export interface TradeRow {
	id: string;
	user_id: string;
	account_id: string | null;
	instrument_id: string | null;
	symbol: string;
	market: string | null;
	side: string | null;
	status: "open" | "closed";
	entry_price: string | number;
	exit_price: string | number | null;
	quantity: string | number;
	stop_loss: string | number | null;
	take_profit: string | number | null;
	risk: string | number | null;
	pnl: string | number | null;
	highest_unrealized_profit?: string | number | null;
	r_multiple: string | number | null;
	opened_at: string;
	closed_at: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
	strategy_ids?: string[];
	mistake_ids?: string[];
	checklist_item_ids?: string[];
	emotional_states?: string[] | null;
	confidence?: number | null;
	mental_state?: string | null;
	followed_plan?: "yes" | "no" | "partial" | null;
	entry_reason?: string | null;
	exit_reason?: string | null;
	screenshot_url?: string | null;
	is_backtest?: boolean;
}

/** Risk:reward for a trade row from its entry, stop, take profit, and side. */
export function rowRiskReward(t: TradeRow): number | null {
	const e = num(t.entry_price);
	const sl = num(t.stop_loss);
	const tp = num(t.take_profit);
	const s = normalizeSide(t.side);
	if (e == null || sl == null || tp == null || (s !== "long" && s !== "short")) return null;
	return riskRewardRatio(e, sl, tp, s);
}
