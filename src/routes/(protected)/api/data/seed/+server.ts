import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const uid = user.id;

	try {
		// ── 0. Wipe existing data for this user ───────────────────────────────────
		await supabase.schema("trading").from("payouts").delete().eq("user_id", uid);
		await supabase.schema("trading").from("trades").delete().eq("user_id", uid);
		await supabase.schema("trading").from("accounts").delete().eq("user_id", uid);
		await supabase.schema("trading").from("strategies").delete().eq("user_id", uid);
		await supabase.schema("trading").from("mistakes").delete().eq("user_id", uid);
		await supabase.schema("trading").from("instruments").delete().eq("user_id", uid);

		// ── 1. Instruments (upsert so re-seeding is safe) ────────────────────────
		// contract_size = 1: tick_value already captures the per-contract dollar value per tick.
		// $/point is derived as tick_value / tick_size (NQ=$20, ES=$50, MNQ=$2).
		const { data: instruments, error: instrErr } = await supabase
			.schema("trading")
			.from("instruments")
			.insert([
				{
					user_id: uid, symbol: "NQ", exchange: "CME",
					market_type: "futures", base_currency: "USD", quote_currency: "USD",
					contract_size: 1, tick_size: 0.25, tick_value: 5, is_active: true,
				},
				{
					user_id: uid, symbol: "ES", exchange: "CME",
					market_type: "futures", base_currency: "USD", quote_currency: "USD",
					contract_size: 1, tick_size: 0.25, tick_value: 12.5, is_active: true,
				},
				{
					user_id: uid, symbol: "MNQ", exchange: "CME",
					market_type: "futures", base_currency: "USD", quote_currency: "USD",
					contract_size: 1, tick_size: 0.25, tick_value: 0.5, is_active: true,
				},
			])
			.select("id, symbol");

		if (instrErr) throw new Error("Instruments: " + instrErr.message);

		const instrMap: Record<string, string> = {};
		const pointValueMap: Record<string, number> = { NQ: 5 / 0.25, ES: 12.5 / 0.25, MNQ: 0.5 / 0.25 };
		for (const i of instruments ?? []) instrMap[i.symbol] = i.id;

		// ── 2. Strategies ─────────────────────────────────────────────────────────
		const { data: strategies, error: stratErr } = await supabase
			.schema("trading")
			.from("strategies")
			.insert([
				{ user_id: uid, name: "Trend Following", description: "Trading in the direction of the prevailing trend using moving averages and momentum." },
				{ user_id: uid, name: "Breakout", description: "Entering on a break of a key level with volume confirmation." },
				{ user_id: uid, name: "Mean Reversion", description: "Fading extended moves back to the VWAP or daily mean." },
				{ user_id: uid, name: "Opening Range Breakout", description: "Trading a breakout of the first 30-minute range after the open." },
			])
			.select("id, name");

		if (stratErr) throw new Error("Strategies: " + stratErr.message);
		const stratMap: Record<string, string> = {};
		for (const s of strategies ?? []) stratMap[s.name] = s.id;

		// ── 3. Mistakes ───────────────────────────────────────────────────────────
		const { data: mistakes, error: mistErr } = await supabase
			.schema("trading")
			.from("mistakes")
			.insert([
				{ user_id: uid, name: "Sized too large", description: "Took on more contracts than the plan allowed." },
				{ user_id: uid, name: "Moved stop early", description: "Tightened stop before the trade had room to breathe." },
				{ user_id: uid, name: "Revenge trade", description: "Entered immediately after a loss to try to recoup." },
				{ user_id: uid, name: "Ignored invalidation", description: "Held a trade past the level that would invalidate the thesis." },
			])
			.select("id, name");

		if (mistErr) throw new Error("Mistakes: " + mistErr.message);
		const mistMap: Record<string, string> = {};
		for (const m of mistakes ?? []) mistMap[m.name] = m.id;

		// ── 4. Accounts ───────────────────────────────────────────────────────────
		const { data: evalAccount, error: evalErr } = await supabase
			.schema("trading")
			.from("accounts")
			.insert({
				user_id: uid,
				name: "Apex 50K — Evaluation",
				account_type: "prop firm",
				starting_balance: 50000,
				prop_firm_name: "Apex",
				prop_firm_type: "evaluation",
				prop_firm_profit_target: 3000,
				prop_firm_max_drawdown: 2500,
				prop_firm_daily_loss_limit: 1000,
				prop_firm_consistency_rule: "30%",
				prop_firm_max_contracts: "4 minis / 40 micros",
				challenge_cost: 137,
			})
			.select("id")
			.single();

		if (evalErr) throw new Error("Eval account: " + evalErr.message);

		const { data: fundedAccount, error: fundedErr } = await supabase
			.schema("trading")
			.from("accounts")
			.insert({
				user_id: uid,
				name: "Apex 50K — Funded",
				account_type: "prop firm",
				starting_balance: 50000,
				prop_firm_name: "Apex",
				prop_firm_type: "funded",
				prop_firm_profit_target: 2000,
				prop_firm_max_drawdown: 2500,
				prop_firm_daily_loss_limit: 1000,
				prop_firm_consistency_rule: "30%",
				prop_firm_max_contracts: "4 minis / 40 micros",
				parent_account_id: evalAccount.id,
			})
			.select("id")
			.single();

		if (fundedErr) throw new Error("Funded account: " + fundedErr.message);

		// Also add profit_split to Apex funded
		await supabase.schema("trading").from("accounts").update({ profit_split: 0.8 }).eq("id", fundedAccount.id);

		// Second eval account (no profit split — that belongs on the funded phase)
		const { data: evalAccount2, error: eval2Err } = await supabase
			.schema("trading")
			.from("accounts")
			.insert({
				user_id: uid,
				name: "Topstep 150K — Evaluation",
				account_type: "prop firm",
				starting_balance: 150000,
				prop_firm_name: "Topstep",
				prop_firm_type: "evaluation",
				prop_firm_profit_target: 9000,
				prop_firm_max_drawdown: 4500,
				prop_firm_daily_loss_limit: 2000,
				prop_firm_consistency_rule: "30%",
				prop_firm_max_contracts: "10 minis",
				challenge_cost: 375,
			})
			.select("id")
			.single();

		if (eval2Err) throw new Error("Eval account 2: " + eval2Err.message);

		const accountId = fundedAccount.id;
		const evalId = evalAccount.id;
		const eval2Id = evalAccount2.id;
		const nqId = instrMap["NQ"];
		const esId = instrMap["ES"];
		const mnqId = instrMap["MNQ"];

		// ── 5. Trades ─────────────────────────────────────────────────────────────
		// Realistic NQ / ES / MNQ trades over the last ~90 days.
		// Format: [symbol, instrId, side, entry, exit, stop, target, qty, pnlOverride, daysAgo, notes?, strategyKey?, mistakeKey?]
		type TradeSeed = {
			symbol: string; instrId: string | undefined; side: "long" | "short";
			entry: number; exit: number | null; stop: number; target: number;
			qty: number; pnl: number | null;
			daysAgo: number; status: "open" | "closed";
			notes?: string; strategy?: string; mistake?: string;
		};

		const now = Date.now();
		const dAgo = (d: number, h = 9, m = 30) =>
			new Date(now - d * 86_400_000 + (h * 60 + m) * 60_000).toISOString();

		const seeds: TradeSeed[] = [
			// NQ longs – wins
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 19_820, exit: 19_980, stop: 19_750, target: 19_980, qty: 1, pnl:  3200, daysAgo: 88, status: "closed", strategy: "Trend Following" },
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 19_640, exit: 19_760, stop: 19_570, target: 19_760, qty: 1, pnl:  2400, daysAgo: 84, status: "closed", strategy: "Breakout" },
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 19_510, exit: 19_660, stop: 19_440, target: 19_660, qty: 2, pnl:  6000, daysAgo: 79, status: "closed", strategy: "Opening Range Breakout" },
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 20_050, exit: 20_200, stop: 19_970, target: 20_200, qty: 1, pnl:  3000, daysAgo: 73, status: "closed", strategy: "Trend Following" },
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 20_320, exit: 20_530, stop: 20_240, target: 20_530, qty: 1, pnl:  4200, daysAgo: 66, status: "closed", strategy: "Breakout" },
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 20_180, exit: 20_350, stop: 20_100, target: 20_350, qty: 2, pnl:  6800, daysAgo: 58, status: "closed", strategy: "Opening Range Breakout" },
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 21_100, exit: 21_320, stop: 21_020, target: 21_320, qty: 1, pnl:  4400, daysAgo: 42, status: "closed", strategy: "Trend Following" },
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 21_450, exit: 21_600, stop: 21_360, target: 21_600, qty: 1, pnl:  3000, daysAgo: 31, status: "closed", strategy: "Mean Reversion" },

			// NQ shorts – wins
			{ symbol: "NQ", instrId: nqId, side: "short", entry: 20_640, exit: 20_450, stop: 20_720, target: 20_450, qty: 1, pnl:  3800, daysAgo: 69, status: "closed", strategy: "Mean Reversion" },
			{ symbol: "NQ", instrId: nqId, side: "short", entry: 20_870, exit: 20_680, stop: 20_950, target: 20_680, qty: 1, pnl:  3800, daysAgo: 52, status: "closed", strategy: "Trend Following" },
			{ symbol: "NQ", instrId: nqId, side: "short", entry: 21_240, exit: 21_060, stop: 21_320, target: 21_060, qty: 2, pnl:  7200, daysAgo: 38, status: "closed", strategy: "Breakout" },

			// NQ losses
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 19_720, exit: 19_650, stop: 19_650, target: 19_880, qty: 1, pnl: -1400, daysAgo: 82, status: "closed", notes: "Failed breakout", mistake: "Sized too large" },
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 20_410, exit: 20_340, stop: 20_340, target: 20_580, qty: 2, pnl: -2800, daysAgo: 62, status: "closed", mistake: "Ignored invalidation" },
			{ symbol: "NQ", instrId: nqId, side: "short", entry: 20_200, exit: 20_270, stop: 20_270, target: 20_040, qty: 1, pnl: -1400, daysAgo: 55, status: "closed", mistake: "Moved stop early" },
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 21_380, exit: 21_310, stop: 21_310, target: 21_560, qty: 1, pnl: -1400, daysAgo: 27, status: "closed", mistake: "Revenge trade" },
			{ symbol: "NQ", instrId: nqId, side: "short", entry: 21_020, exit: 21_100, stop: 21_100, target: 20_840, qty: 1, pnl: -1600, daysAgo: 20, status: "closed" },

			// ES trades
			{ symbol: "ES", instrId: esId, side: "long",  entry: 5_280, exit: 5_310, stop: 5_258, target: 5_310, qty: 1, pnl:  1500, daysAgo: 76, status: "closed", strategy: "Trend Following" },
			{ symbol: "ES", instrId: esId, side: "long",  entry: 5_345, exit: 5_390, stop: 5_320, target: 5_390, qty: 1, pnl:  2250, daysAgo: 63, status: "closed", strategy: "Opening Range Breakout" },
			{ symbol: "ES", instrId: esId, side: "short", entry: 5_540, exit: 5_492, stop: 5_565, target: 5_492, qty: 1, pnl:  2400, daysAgo: 48, status: "closed", strategy: "Mean Reversion" },
			{ symbol: "ES", instrId: esId, side: "long",  entry: 5_460, exit: 5_432, stop: 5_432, target: 5_520, qty: 1, pnl: -1400, daysAgo: 44, status: "closed", mistake: "Moved stop early" },
			{ symbol: "ES", instrId: esId, side: "long",  entry: 5_610, exit: 5_660, stop: 5_582, target: 5_660, qty: 2, pnl:  5000, daysAgo: 18, status: "closed", strategy: "Breakout" },

			// MNQ trades
			{ symbol: "MNQ", instrId: mnqId, side: "long",  entry: 20_100, exit: 20_260, stop: 20_020, target: 20_260, qty: 5, pnl:  1600, daysAgo: 71, status: "closed", strategy: "Trend Following" },
			{ symbol: "MNQ", instrId: mnqId, side: "short", entry: 20_750, exit: 20_600, stop: 20_830, target: 20_600, qty: 5, pnl:  1500, daysAgo: 46, status: "closed", strategy: "Mean Reversion" },
			{ symbol: "MNQ", instrId: mnqId, side: "long",  entry: 21_200, exit: 21_360, stop: 21_120, target: 21_360, qty: 10, pnl:  3200, daysAgo: 12, status: "closed", strategy: "Opening Range Breakout" },

			// Open trades
			{ symbol: "NQ", instrId: nqId, side: "long",  entry: 21_680, exit: null, stop: 21_580, target: 21_880, qty: 1, pnl: null, daysAgo: 1, status: "open", strategy: "Trend Following" },
			{ symbol: "MNQ", instrId: mnqId, side: "long", entry: 21_720, exit: null, stop: 21_640, target: 21_920, qty: 5, pnl: null, daysAgo: 0, status: "open", strategy: "Breakout" },
		];

		const makeRows = (list: TradeSeed[], acctId: string) => list.map((s) => ({
			user_id: uid,
			account_id: acctId,
			instrument_id: s.instrId ?? null,
			symbol: s.symbol,
			side: s.side,
			status: s.status,
			entry_price: s.entry,
			exit_price: s.exit,
			stop_loss: s.stop,
			take_profit: s.target,
			quantity: s.qty,
			risk: Math.abs(s.entry - s.stop) * s.qty * (pointValueMap[s.symbol] ?? 1),
			pnl: s.pnl,
			opened_at: dAgo(s.daysAgo, 9, 30),
			closed_at: s.status === "closed" ? dAgo(s.daysAgo, 10, 45) : null,
			notes: s.notes ?? null,
		}));

		// Apex 50K Evaluation — trades that show it legitimately passed
		// Net ~$3,600 | best day $900 (25%) | max drawdown $350 | no daily loss > $400
		const evalSeeds: TradeSeed[] = [
			{ symbol: "NQ",  instrId: nqId,  side: "long",  entry: 19_480, exit: 19_560, stop: 19_410, target: 19_580, qty: 1, pnl:   800, daysAgo: 120, status: "closed", strategy: "Trend Following" },
			{ symbol: "NQ",  instrId: nqId,  side: "short", entry: 19_650, exit: 19_560, stop: 19_720, target: 19_560, qty: 1, pnl:   600, daysAgo: 118, status: "closed", strategy: "Mean Reversion" },
			{ symbol: "NQ",  instrId: nqId,  side: "long",  entry: 19_700, exit: 19_660, stop: 19_660, target: 19_840, qty: 1, pnl:  -400, daysAgo: 118, status: "closed", mistake: "Sized too large" },
			{ symbol: "ES",  instrId: esId,  side: "long",  entry:  5_220, exit:  5_238, stop:  5_202, target:  5_240, qty: 1, pnl:   900, daysAgo: 115, status: "closed", strategy: "Opening Range Breakout" },
			{ symbol: "NQ",  instrId: nqId,  side: "long",  entry: 19_820, exit: 19_785, stop: 19_785, target: 19_960, qty: 1, pnl:  -350, daysAgo: 112, status: "closed", mistake: "Moved stop early" },
			{ symbol: "NQ",  instrId: nqId,  side: "long",  entry: 19_740, exit: 19_840, stop: 19_660, target: 19_860, qty: 1, pnl:   800, daysAgo: 109, status: "closed", strategy: "Trend Following" },
			{ symbol: "MNQ", instrId: mnqId, side: "long",  entry: 19_800, exit: 19_990, stop: 19_720, target: 20_000, qty: 5, pnl:   400, daysAgo: 106, status: "closed", strategy: "Mean Reversion" },
			{ symbol: "MNQ", instrId: mnqId, side: "short", entry: 20_050, exit: 20_190, stop: 20_190, target: 19_880, qty: 5, pnl:  -280, daysAgo: 103, status: "closed", mistake: "Ignored invalidation" },
			{ symbol: "NQ",  instrId: nqId,  side: "long",  entry: 19_960, exit: 20_060, stop: 19_880, target: 20_080, qty: 1, pnl:   700, daysAgo: 100, status: "closed", strategy: "Opening Range Breakout" },
			{ symbol: "NQ",  instrId: nqId,  side: "short", entry: 20_150, exit: 20_060, stop: 20_230, target: 20_040, qty: 1, pnl:  -200, daysAgo: 100, status: "closed" },
			{ symbol: "ES",  instrId: esId,  side: "short", entry:  5_260, exit:  5_248, stop:  5_278, target:  5_238, qty: 1, pnl:   600, daysAgo:  97, status: "closed", strategy: "Breakout" },
		];

		// Topstep 150K Evaluation — just crossed $9,000, all rules clean, ready to graduate
		// Net ~$9,300 | best day $2,500 (26.9%) | max drawdown $900 | no daily loss > $900
		const eval2Seeds: TradeSeed[] = [
			{ symbol: "ES",  instrId: esId,  side: "long",  entry:  5_300, exit:  5_350, stop:  5_272, target:  5_355, qty: 2, pnl:  2_500, daysAgo: 25, status: "closed", strategy: "Trend Following" },
			{ symbol: "NQ",  instrId: nqId,  side: "long",  entry: 21_100, exit: 21_220, stop: 21_020, target: 21_240, qty: 1, pnl:  1_200, daysAgo: 23, status: "closed", strategy: "Breakout" },
			{ symbol: "NQ",  instrId: nqId,  side: "short", entry: 21_380, exit: 21_420, stop: 21_420, target: 21_200, qty: 1, pnl:   -800, daysAgo: 23, status: "closed", mistake: "Moved stop early" },
			{ symbol: "ES",  instrId: esId,  side: "short", entry:  5_420, exit:  5_380, stop:  5_448, target:  5_378, qty: 2, pnl:  2_000, daysAgo: 20, status: "closed", strategy: "Mean Reversion" },
			{ symbol: "NQ",  instrId: nqId,  side: "long",  entry: 21_240, exit: 21_195, stop: 21_195, target: 21_420, qty: 1, pnl:   -900, daysAgo: 18, status: "closed", mistake: "Ignored invalidation" },
			{ symbol: "NQ",  instrId: nqId,  side: "long",  entry: 21_180, exit: 21_400, stop: 21_090, target: 21_420, qty: 1, pnl:  2_200, daysAgo: 15, status: "closed", strategy: "Breakout" },
			{ symbol: "ES",  instrId: esId,  side: "long",  entry:  5_380, exit:  5_400, stop:  5_358, target:  5_406, qty: 2, pnl:  1_000, daysAgo: 12, status: "closed", strategy: "Opening Range Breakout" },
			{ symbol: "NQ",  instrId: nqId,  side: "short", entry: 21_500, exit: 21_560, stop: 21_560, target: 21_320, qty: 1, pnl:   -600, daysAgo: 12, status: "closed", mistake: "Sized too large" },
			{ symbol: "MNQ", instrId: mnqId, side: "long",  entry: 21_400, exit: 21_650, stop: 21_300, target: 21_680, qty: 20, pnl: 1_800, daysAgo:  9, status: "closed", strategy: "Trend Following" },
			{ symbol: "NQ",  instrId: nqId,  side: "long",  entry: 21_560, exit: 21_525, stop: 21_525, target: 21_740, qty: 1, pnl:   -700, daysAgo:  6, status: "closed", mistake: "Revenge trade" },
			{ symbol: "ES",  instrId: esId,  side: "long",  entry:  5_440, exit:  5_460, stop:  5_418, target:  5_464, qty: 2, pnl:  1_000, daysAgo:  3, status: "closed", strategy: "Opening Range Breakout" },
			{ symbol: "NQ",  instrId: nqId,  side: "short", entry: 21_620, exit: 21_560, stop: 21_680, target: 21_520, qty: 1, pnl:    600, daysAgo:  1, status: "closed", strategy: "Mean Reversion" },
		];

		const { data: insertedTrades, error: tradeErr } = await supabase
			.schema("trading")
			.from("trades")
			.insert([
				...makeRows(evalSeeds, evalId),
				...makeRows(seeds, accountId),
				...makeRows(eval2Seeds, eval2Id),
			])
			.select("id");

		if (tradeErr) throw new Error("Trades: " + tradeErr.message);

		// Link strategies and mistakes
		const strategyLinks: { trade_id: string; strategy_id: string }[] = [];
		const mistakeLinks: { trade_id: string; mistake_id: string }[] = [];

		const allSeeds = [...evalSeeds, ...seeds, ...eval2Seeds];
		allSeeds.forEach((s, i) => {
			const tradeId = insertedTrades?.[i]?.id;
			if (!tradeId) return;
			if (s.strategy && stratMap[s.strategy]) {
				strategyLinks.push({ trade_id: tradeId, strategy_id: stratMap[s.strategy] });
			}
			if (s.mistake && mistMap[s.mistake] && s.status === "closed") {
				mistakeLinks.push({ trade_id: tradeId, mistake_id: mistMap[s.mistake] });
			}
		});

		if (strategyLinks.length > 0) {
			const { error: slErr } = await supabase.schema("trading").from("trade_strategies").insert(strategyLinks);
			if (slErr) console.error("Strategy links:", slErr.message);
		}
		if (mistakeLinks.length > 0) {
			const { error: mlErr } = await supabase.schema("trading").from("trade_mistakes").insert(mistakeLinks);
			if (mlErr) console.error("Mistake links:", mlErr.message);
		}

		// Add a sample payout on the funded account
		await supabase.schema("trading").from("payouts").insert({
			user_id: uid,
			account_id: fundedAccount.id,
			amount: 1800,
			payout_date: dAgo(14),
			notes: "First payout — 80% split",
		});

		return json({
			success: true,
			message: `Seeded: 3 instruments, 4 strategies, 4 mistakes, 4 accounts, ${allSeeds.length} trades, 1 payout.`,
		});
	} catch (e) {
		console.error("Seed error:", e);
		return json({ success: false, message: e instanceof Error ? e.message : "Seed failed." }, { status: 500 });
	}
};
