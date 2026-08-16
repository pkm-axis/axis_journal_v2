import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Scope = "instruments" | "playbook" | "accounts" | "trades";
const VALID_SCOPES: Scope[] = ["instruments", "playbook", "accounts", "trades"];

const INSTRUMENT_SEEDS = [
	// Equity index — full
	{ symbol: "NQ", exchange: "CME", tick_size: 0.25, tick_value: 5, commission_per_side: 1.78 },
	{ symbol: "ES", exchange: "CME", tick_size: 0.25, tick_value: 12.5, commission_per_side: 1.78 },
	// Equity index — micro
	{ symbol: "MNQ", exchange: "CME", tick_size: 0.25, tick_value: 0.5, commission_per_side: 0.91 },
	{ symbol: "MES", exchange: "CME", tick_size: 0.25, tick_value: 1.25, commission_per_side: 0.91 },
	// Gold
	{ symbol: "GC", exchange: "CME", tick_size: 0.1, tick_value: 10, commission_per_side: 1.78 },
	{ symbol: "MGC", exchange: "CME", tick_size: 0.1, tick_value: 1, commission_per_side: 1.06 },
	// Crude oil
	{ symbol: "CL", exchange: "CME", tick_size: 0.01, tick_value: 10, commission_per_side: 1.78 },
	{ symbol: "MCL", exchange: "CME", tick_size: 0.01, tick_value: 1, commission_per_side: 1.2 },
	// Silver
	{ symbol: "SI", exchange: "CME", tick_size: 0.005, tick_value: 25, commission_per_side: 1.78 },
	{ symbol: "SIL", exchange: "CME", tick_size: 0.005, tick_value: 5, commission_per_side: 1.2 },
];

const STRATEGY_SEEDS = [
	{ name: "Trend Following", description: "Trading in the direction of the prevailing trend using moving averages and momentum." },
	{ name: "Breakout", description: "Entering on a break of a key level with volume confirmation." },
	{ name: "Mean Reversion", description: "Fading extended moves back to the VWAP or daily mean." },
	{ name: "Opening Range Breakout", description: "Trading a breakout of the first 30-minute range after the open." },
];

const MISTAKE_SEEDS = [
	{ name: "Sized too large", description: "Took on more contracts than the plan allowed." },
	{ name: "Moved stop early", description: "Tightened stop before the trade had room to breathe." },
	{ name: "Revenge trade", description: "Entered immediately after a loss to try to recoup." },
	{ name: "Ignored invalidation", description: "Held a trade past the level that would invalidate the thesis." },
];

type TradeSeed = {
	symbol: string;
	side: "long" | "short";
	entry: number;
	exit: number | null;
	stop: number;
	target: number;
	qty: number;
	pnl: number | null;
	daysAgo: number;
	status: "open" | "closed";
	account: "apex_funded" | "apex_eval" | "topstep_eval";
	notes?: string;
	strategy?: string;
	mistake?: string;
	emotional_states?: string[];
	confidence?: number;
	mental_state?: string;
	followed_plan?: "yes" | "no" | "partial";
};

function buildTradeSeeds(): TradeSeed[] {
	const apexFunded: TradeSeed[] = [
		// NQ longs — wins
		{ symbol: "NQ", side: "long",  entry: 19_820, exit: 19_980, stop: 19_750, target: 19_980, qty: 1, pnl:  3200, daysAgo: 88, status: "closed", account: "apex_funded", strategy: "Trend Following", emotional_states: ["calm", "confident"], confidence: 4, followed_plan: "yes", mental_state: "Well-rested, focused on the open." },
		{ symbol: "NQ", side: "long",  entry: 19_640, exit: 19_760, stop: 19_570, target: 19_760, qty: 1, pnl:  2400, daysAgo: 84, status: "closed", account: "apex_funded", strategy: "Breakout", emotional_states: ["disciplined"], confidence: 4, followed_plan: "yes" },
		{ symbol: "NQ", side: "long",  entry: 19_510, exit: 19_660, stop: 19_440, target: 19_660, qty: 2, pnl:  6000, daysAgo: 79, status: "closed", account: "apex_funded", strategy: "Opening Range Breakout" },
		{ symbol: "NQ", side: "long",  entry: 20_050, exit: 20_200, stop: 19_970, target: 20_200, qty: 1, pnl:  3000, daysAgo: 73, status: "closed", account: "apex_funded", strategy: "Trend Following" },
		{ symbol: "NQ", side: "long",  entry: 20_320, exit: 20_530, stop: 20_240, target: 20_530, qty: 1, pnl:  4200, daysAgo: 66, status: "closed", account: "apex_funded", strategy: "Breakout" },
		{ symbol: "NQ", side: "long",  entry: 20_180, exit: 20_350, stop: 20_100, target: 20_350, qty: 2, pnl:  6800, daysAgo: 58, status: "closed", account: "apex_funded", strategy: "Opening Range Breakout" },
		{ symbol: "NQ", side: "long",  entry: 21_100, exit: 21_320, stop: 21_020, target: 21_320, qty: 1, pnl:  4400, daysAgo: 42, status: "closed", account: "apex_funded", strategy: "Trend Following" },
		{ symbol: "NQ", side: "long",  entry: 21_450, exit: 21_600, stop: 21_360, target: 21_600, qty: 1, pnl:  3000, daysAgo: 31, status: "closed", account: "apex_funded", strategy: "Mean Reversion" },
		// NQ shorts — wins
		{ symbol: "NQ", side: "short", entry: 20_640, exit: 20_450, stop: 20_720, target: 20_450, qty: 1, pnl:  3800, daysAgo: 69, status: "closed", account: "apex_funded", strategy: "Mean Reversion" },
		{ symbol: "NQ", side: "short", entry: 20_870, exit: 20_680, stop: 20_950, target: 20_680, qty: 1, pnl:  3800, daysAgo: 52, status: "closed", account: "apex_funded", strategy: "Trend Following" },
		{ symbol: "NQ", side: "short", entry: 21_240, exit: 21_060, stop: 21_320, target: 21_060, qty: 2, pnl:  7200, daysAgo: 38, status: "closed", account: "apex_funded", strategy: "Breakout" },
		// NQ losses
		{ symbol: "NQ", side: "long",  entry: 19_720, exit: 19_650, stop: 19_650, target: 19_880, qty: 1, pnl: -1400, daysAgo: 82, status: "closed", account: "apex_funded", notes: "Failed breakout", mistake: "Sized too large", emotional_states: ["fomo", "greedy"], confidence: 2, followed_plan: "no", mental_state: "Chasing the move after missing the first leg." },
		{ symbol: "NQ", side: "long",  entry: 20_410, exit: 20_340, stop: 20_340, target: 20_580, qty: 2, pnl: -2800, daysAgo: 62, status: "closed", account: "apex_funded", mistake: "Ignored invalidation", emotional_states: ["anxious", "fearful"], confidence: 2, followed_plan: "no" },
		{ symbol: "NQ", side: "short", entry: 20_200, exit: 20_270, stop: 20_270, target: 20_040, qty: 1, pnl: -1400, daysAgo: 55, status: "closed", account: "apex_funded", mistake: "Moved stop early", emotional_states: ["impatient"], confidence: 3, followed_plan: "partial" },
		{ symbol: "NQ", side: "long",  entry: 21_380, exit: 21_310, stop: 21_310, target: 21_560, qty: 1, pnl: -1400, daysAgo: 27, status: "closed", account: "apex_funded", mistake: "Revenge trade", emotional_states: ["revenge", "anxious"], confidence: 1, followed_plan: "no", mental_state: "Tilted from prior loss." },
		{ symbol: "NQ", side: "short", entry: 21_020, exit: 21_100, stop: 21_100, target: 20_840, qty: 1, pnl: -1600, daysAgo: 20, status: "closed", account: "apex_funded" },
		// ES
		{ symbol: "ES", side: "long",  entry: 5_280, exit: 5_310, stop: 5_258, target: 5_310, qty: 1, pnl:  1500, daysAgo: 76, status: "closed", account: "apex_funded", strategy: "Trend Following" },
		{ symbol: "ES", side: "long",  entry: 5_345, exit: 5_390, stop: 5_320, target: 5_390, qty: 1, pnl:  2250, daysAgo: 63, status: "closed", account: "apex_funded", strategy: "Opening Range Breakout" },
		{ symbol: "ES", side: "short", entry: 5_540, exit: 5_492, stop: 5_565, target: 5_492, qty: 1, pnl:  2400, daysAgo: 48, status: "closed", account: "apex_funded", strategy: "Mean Reversion" },
		{ symbol: "ES", side: "long",  entry: 5_460, exit: 5_432, stop: 5_432, target: 5_520, qty: 1, pnl: -1400, daysAgo: 44, status: "closed", account: "apex_funded", mistake: "Moved stop early" },
		{ symbol: "ES", side: "long",  entry: 5_610, exit: 5_660, stop: 5_582, target: 5_660, qty: 2, pnl:  5000, daysAgo: 18, status: "closed", account: "apex_funded", strategy: "Breakout" },
		// MNQ
		{ symbol: "MNQ", side: "long",  entry: 20_100, exit: 20_260, stop: 20_020, target: 20_260, qty: 5, pnl:  1600, daysAgo: 71, status: "closed", account: "apex_funded", strategy: "Trend Following" },
		{ symbol: "MNQ", side: "short", entry: 20_750, exit: 20_600, stop: 20_830, target: 20_600, qty: 5, pnl:  1500, daysAgo: 46, status: "closed", account: "apex_funded", strategy: "Mean Reversion" },
		{ symbol: "MNQ", side: "long",  entry: 21_200, exit: 21_360, stop: 21_120, target: 21_360, qty: 10, pnl: 3200, daysAgo: 12, status: "closed", account: "apex_funded", strategy: "Opening Range Breakout" },
		// Open
		{ symbol: "NQ",  side: "long", entry: 21_680, exit: null, stop: 21_580, target: 21_880, qty: 1, pnl: null, daysAgo: 1, status: "open", account: "apex_funded", strategy: "Trend Following", emotional_states: ["calm", "disciplined"], confidence: 4, followed_plan: "yes" },
		{ symbol: "MNQ", side: "long", entry: 21_720, exit: null, stop: 21_640, target: 21_920, qty: 5, pnl: null, daysAgo: 0, status: "open", account: "apex_funded", strategy: "Breakout", emotional_states: ["confident"], confidence: 5, followed_plan: "yes" },
	];

	const apexEval: TradeSeed[] = [
		{ symbol: "NQ",  side: "long",  entry: 19_480, exit: 19_560, stop: 19_410, target: 19_580, qty: 1, pnl:  800, daysAgo: 120, status: "closed", account: "apex_eval", strategy: "Trend Following", emotional_states: ["calm", "disciplined"], confidence: 4, followed_plan: "yes" },
		{ symbol: "NQ",  side: "short", entry: 19_650, exit: 19_560, stop: 19_720, target: 19_560, qty: 1, pnl:  600, daysAgo: 118, status: "closed", account: "apex_eval", strategy: "Mean Reversion" },
		{ symbol: "NQ",  side: "long",  entry: 19_700, exit: 19_660, stop: 19_660, target: 19_840, qty: 1, pnl: -400, daysAgo: 118, status: "closed", account: "apex_eval", mistake: "Sized too large", emotional_states: ["fomo"], confidence: 2, followed_plan: "no" },
		{ symbol: "ES",  side: "long",  entry:  5_220, exit:  5_238, stop:  5_202, target:  5_240, qty: 1, pnl:  900, daysAgo: 115, status: "closed", account: "apex_eval", strategy: "Opening Range Breakout" },
		{ symbol: "NQ",  side: "long",  entry: 19_820, exit: 19_785, stop: 19_785, target: 19_960, qty: 1, pnl: -350, daysAgo: 112, status: "closed", account: "apex_eval", mistake: "Moved stop early" },
		{ symbol: "NQ",  side: "long",  entry: 19_740, exit: 19_840, stop: 19_660, target: 19_860, qty: 1, pnl:  800, daysAgo: 109, status: "closed", account: "apex_eval", strategy: "Trend Following" },
		{ symbol: "MNQ", side: "long",  entry: 19_800, exit: 19_990, stop: 19_720, target: 20_000, qty: 5, pnl:  400, daysAgo: 106, status: "closed", account: "apex_eval", strategy: "Mean Reversion" },
		{ symbol: "MNQ", side: "short", entry: 20_050, exit: 20_190, stop: 20_190, target: 19_880, qty: 5, pnl: -280, daysAgo: 103, status: "closed", account: "apex_eval", mistake: "Ignored invalidation" },
		{ symbol: "NQ",  side: "long",  entry: 19_960, exit: 20_060, stop: 19_880, target: 20_080, qty: 1, pnl:  700, daysAgo: 100, status: "closed", account: "apex_eval", strategy: "Opening Range Breakout" },
		{ symbol: "NQ",  side: "short", entry: 20_150, exit: 20_060, stop: 20_230, target: 20_040, qty: 1, pnl: -200, daysAgo: 100, status: "closed", account: "apex_eval" },
		{ symbol: "ES",  side: "short", entry:  5_260, exit:  5_248, stop:  5_278, target:  5_238, qty: 1, pnl:  600, daysAgo:  97, status: "closed", account: "apex_eval", strategy: "Breakout" },
	];

	const topstepEval: TradeSeed[] = [
		{ symbol: "ES",  side: "long",  entry:  5_300, exit:  5_350, stop:  5_272, target:  5_355, qty: 2, pnl:  2_500, daysAgo: 25, status: "closed", account: "topstep_eval", strategy: "Trend Following", emotional_states: ["confident", "disciplined"], confidence: 5, followed_plan: "yes", mental_state: "Best setup of the week, full conviction." },
		{ symbol: "NQ",  side: "long",  entry: 21_100, exit: 21_220, stop: 21_020, target: 21_240, qty: 1, pnl:  1_200, daysAgo: 23, status: "closed", account: "topstep_eval", strategy: "Breakout" },
		{ symbol: "NQ",  side: "short", entry: 21_380, exit: 21_420, stop: 21_420, target: 21_200, qty: 1, pnl:   -800, daysAgo: 23, status: "closed", account: "topstep_eval", mistake: "Moved stop early" },
		{ symbol: "ES",  side: "short", entry:  5_420, exit:  5_380, stop:  5_448, target:  5_378, qty: 2, pnl:  2_000, daysAgo: 20, status: "closed", account: "topstep_eval", strategy: "Mean Reversion" },
		{ symbol: "NQ",  side: "long",  entry: 21_240, exit: 21_195, stop: 21_195, target: 21_420, qty: 1, pnl:   -900, daysAgo: 18, status: "closed", account: "topstep_eval", mistake: "Ignored invalidation" },
		{ symbol: "NQ",  side: "long",  entry: 21_180, exit: 21_400, stop: 21_090, target: 21_420, qty: 1, pnl:  2_200, daysAgo: 15, status: "closed", account: "topstep_eval", strategy: "Breakout" },
		{ symbol: "ES",  side: "long",  entry:  5_380, exit:  5_400, stop:  5_358, target:  5_406, qty: 2, pnl:  1_000, daysAgo: 12, status: "closed", account: "topstep_eval", strategy: "Opening Range Breakout" },
		{ symbol: "NQ",  side: "short", entry: 21_500, exit: 21_560, stop: 21_560, target: 21_320, qty: 1, pnl:   -600, daysAgo: 12, status: "closed", account: "topstep_eval", mistake: "Sized too large" },
		{ symbol: "MNQ", side: "long",  entry: 21_400, exit: 21_650, stop: 21_300, target: 21_680, qty: 20, pnl: 1_800, daysAgo:  9, status: "closed", account: "topstep_eval", strategy: "Trend Following" },
		{ symbol: "NQ",  side: "long",  entry: 21_560, exit: 21_525, stop: 21_525, target: 21_740, qty: 1, pnl:   -700, daysAgo:  6, status: "closed", account: "topstep_eval", mistake: "Revenge trade", emotional_states: ["revenge", "anxious"], confidence: 1, followed_plan: "no", mental_state: "Forced an entry after a missed setup." },
		{ symbol: "ES",  side: "long",  entry:  5_440, exit:  5_460, stop:  5_418, target:  5_464, qty: 2, pnl:  1_000, daysAgo:  3, status: "closed", account: "topstep_eval", strategy: "Opening Range Breakout" },
		{ symbol: "NQ",  side: "short", entry: 21_620, exit: 21_560, stop: 21_680, target: 21_520, qty: 1, pnl:    600, daysAgo:  1, status: "closed", account: "topstep_eval", strategy: "Mean Reversion" },
	];

	return [...apexEval, ...apexFunded, ...topstepEval];
}

const dAgo = (d: number, h = 9, m = 30) =>
	new Date(Date.now() - d * 86_400_000 + (h * 60 + m) * 60_000).toISOString();

async function seedInstruments(supabase: SupabaseClient, uid: string) {
	// The catalog is global and managed via migrations. Here we only reset the
	// user's commission overrides to our suggested defaults.
	const { data: catalog, error: catErr } = await supabase
		.schema("trading")
		.from("instruments")
		.select("id, symbol");
	if (catErr) throw new Error("Instruments catalog: " + catErr.message);

	const bySymbol = new Map((catalog ?? []).map((r) => [r.symbol as string, r.id as string]));

	await supabase.schema("trading").from("user_instruments").delete().eq("user_id", uid);

	const rows = INSTRUMENT_SEEDS
		.map((s) => {
			const id = bySymbol.get(s.symbol);
			if (!id) return null;
			return {
				user_id: uid,
				instrument_id: id,
				commission_per_side: s.commission_per_side,
				is_active: true,
			};
		})
		.filter((r): r is NonNullable<typeof r> => r !== null);

	if (rows.length > 0) {
		const { error } = await supabase.schema("trading").from("user_instruments").insert(rows);
		if (error) throw new Error("Instrument overrides: " + error.message);
	}
	return rows.length;
}

async function seedPlaybook(supabase: SupabaseClient, uid: string) {
	await supabase.schema("trading").from("strategies").delete().eq("user_id", uid);
	await supabase.schema("trading").from("mistakes").delete().eq("user_id", uid);
	const { error: sErr } = await supabase
		.schema("trading")
		.from("strategies")
		.insert(STRATEGY_SEEDS.map((s) => ({ user_id: uid, ...s })));
	if (sErr) throw new Error("Strategies: " + sErr.message);
	const { error: mErr } = await supabase
		.schema("trading")
		.from("mistakes")
		.insert(MISTAKE_SEEDS.map((m) => ({ user_id: uid, ...m })));
	if (mErr) throw new Error("Mistakes: " + mErr.message);
	return { strategies: STRATEGY_SEEDS.length, mistakes: MISTAKE_SEEDS.length };
}

async function seedAccounts(supabase: SupabaseClient, uid: string) {
	// Wiping accounts cascades trades + payouts.
	await supabase.schema("trading").from("accounts").delete().eq("user_id", uid);

	const { data: evalAccount, error: e1 } = await supabase
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
		})
		.select("id")
		.single();
	if (e1) throw new Error("Apex eval: " + e1.message);

	const { data: fundedAccount, error: e2 } = await supabase
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
			profit_split: 0.8,
		})
		.select("id")
		.single();
	if (e2) throw new Error("Apex funded: " + e2.message);

	const { data: topstepAccount, error: e3 } = await supabase
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
		})
		.select("id")
		.single();
	if (e3) throw new Error("Topstep eval: " + e3.message);

	/**
	 * Account costs live in the expense ledger, not accounts.challenge_cost — see
	 * 20260816000200_account_expenses.sql. Seeding the column instead would leave
	 * the Expenses page reading $0 against accounts that visibly cost money.
	 */
	// incurred_on is a date, not a timestamp — trim dAgo's ISO output to YYYY-MM-DD.
	const dayAgo = (d: number) => dAgo(d).slice(0, 10);
	const { error: eExp } = await supabase.schema("trading").from("account_expenses").insert([
		{ user_id: uid, account_id: evalAccount.id, kind: "challenge", amount: 137, incurred_on: dayAgo(90) },
		{ user_id: uid, account_id: topstepAccount.id, kind: "challenge", amount: 375, incurred_on: dayAgo(60) },
		{ user_id: uid, account_id: evalAccount.id, kind: "reset", amount: 80, incurred_on: dayAgo(75) },
		{ user_id: uid, account_id: fundedAccount.id, kind: "platform", amount: 85, incurred_on: dayAgo(30) },
	]);
	if (eExp) throw new Error("Account expenses: " + eExp.message);

	// Sample payout on the funded account.
	await supabase.schema("trading").from("payouts").insert({
		user_id: uid,
		account_id: fundedAccount.id,
		amount: 1800,
		payout_date: dAgo(14),
		notes: "First payout — 80% split",
	});

	return 3;
}

async function seedTrades(supabase: SupabaseClient, uid: string) {
	// Lookup prerequisites by name.
	const { data: accounts } = await supabase
		.schema("trading")
		.from("accounts")
		.select("id, name")
		.eq("user_id", uid);
	const { data: instruments } = await supabase
		.schema("trading")
		.from("instruments")
		.select("id, symbol");

	const accountIds: Record<TradeSeed["account"], string | undefined> = {
		apex_eval: accounts?.find((a) => a.name === "Apex 50K — Evaluation")?.id,
		apex_funded: accounts?.find((a) => a.name === "Apex 50K — Funded")?.id,
		topstep_eval: accounts?.find((a) => a.name === "Topstep 150K — Evaluation")?.id,
	};
	const missingAccounts = (Object.entries(accountIds) as [TradeSeed["account"], string | undefined][])
		.filter(([, id]) => !id)
		.map(([k]) => k);
	if (missingAccounts.length > 0) {
		throw new Error(
			`Trades need the seeded accounts. Missing: ${missingAccounts.join(", ")}. Check "Accounts" too.`
		);
	}

	const instrIds: Record<string, string | undefined> = {};
	for (const i of instruments ?? []) instrIds[i.symbol] = i.id;
	const requiredSymbols = ["NQ", "ES", "MNQ"];
	const missingInstr = requiredSymbols.filter((s) => !instrIds[s]);
	if (missingInstr.length > 0) {
		throw new Error(
			`Trades need instruments: ${missingInstr.join(", ")}. Check "Instruments" too.`
		);
	}

	const { data: strategies } = await supabase
		.schema("trading")
		.from("strategies")
		.select("id, name")
		.eq("user_id", uid);
	const { data: mistakes } = await supabase
		.schema("trading")
		.from("mistakes")
		.select("id, name")
		.eq("user_id", uid);
	const strategyMap: Record<string, string> = {};
	for (const s of strategies ?? []) strategyMap[s.name] = s.id;
	const mistakeMap: Record<string, string> = {};
	for (const m of mistakes ?? []) mistakeMap[m.name] = m.id;

	const pointValueMap: Record<string, number> = {};
	for (const s of INSTRUMENT_SEEDS) pointValueMap[s.symbol] = s.tick_value / s.tick_size;

	// Wipe trades (psychology / link rows cascade with them).
	await supabase.schema("trading").from("trades").delete().eq("user_id", uid);

	const seeds = buildTradeSeeds();
	const tradeRows = seeds.map((s) => {
		const risk = Math.abs(s.entry - s.stop) * s.qty * (pointValueMap[s.symbol] ?? 1);
		const rMultiple =
			s.status === "closed" && s.pnl != null && risk > 0 ? Number((s.pnl / risk).toFixed(2)) : null;
		return {
			user_id: uid,
			account_id: accountIds[s.account]!,
			instrument_id: instrIds[s.symbol] ?? null,
			symbol: s.symbol,
			market: "futures",
			side: s.side,
			status: s.status,
			entry_price: s.entry,
			exit_price: s.exit,
			stop_loss: s.stop,
			take_profit: s.target,
			quantity: s.qty,
			risk,
			r_multiple: rMultiple,
			pnl: s.pnl,
			opened_at: dAgo(s.daysAgo, 9, 30),
			closed_at: s.status === "closed" ? dAgo(s.daysAgo, 10, 45) : null,
			notes: s.notes ?? null,
			// One strategy per trade, on the row itself — trade_strategies was
			// dropped by 20260725000000_strategy_checklists.
			strategy_id: (s.strategy && strategyMap[s.strategy]) || null,
		};
	});

	const { data: insertedTrades, error: tErr } = await supabase
		.schema("trading")
		.from("trades")
		.insert(tradeRows)
		.select("id");
	if (tErr) throw new Error("Trades: " + tErr.message);

	const mistakeLinks: { trade_id: string; mistake_id: string }[] = [];
	const psychRows: {
		trade_id: string;
		emotional_states: string[];
		confidence: number | null;
		mental_state: string | null;
		followed_plan: "yes" | "no" | "partial" | null;
	}[] = [];

	seeds.forEach((s, i) => {
		const tradeId = insertedTrades?.[i]?.id;
		if (!tradeId) return;
		if (s.mistake && mistakeMap[s.mistake] && s.status === "closed") {
			mistakeLinks.push({ trade_id: tradeId, mistake_id: mistakeMap[s.mistake] });
		}

		const explicitStates = s.emotional_states && s.emotional_states.length > 0;
		let defaultStates: string[] = ["calm"];
		let defaultConfidence = 3;
		let defaultPlan: "yes" | "no" | "partial" = "yes";
		if (s.status === "open") {
			defaultStates = ["calm", "disciplined"];
			defaultConfidence = 4;
		} else if (s.mistake) {
			const m = s.mistake;
			if (m === "Revenge trade") defaultStates = ["revenge", "anxious"];
			else if (m === "Sized too large") defaultStates = ["fomo", "greedy"];
			else if (m === "Moved stop early") defaultStates = ["impatient", "anxious"];
			else if (m === "Ignored invalidation") defaultStates = ["fearful", "anxious"];
			else defaultStates = ["anxious"];
			defaultConfidence = 2;
			defaultPlan = "no";
		} else if ((s.pnl ?? 0) > 0) {
			defaultStates = ["confident", "disciplined"];
			defaultConfidence = 4;
		} else {
			defaultPlan = "partial";
		}

		psychRows.push({
			trade_id: tradeId,
			emotional_states: explicitStates ? s.emotional_states! : defaultStates,
			confidence: s.confidence ?? defaultConfidence,
			mental_state: s.mental_state ?? null,
			followed_plan: s.followed_plan ?? defaultPlan,
		});
	});

	if (mistakeLinks.length > 0) {
		const { error } = await supabase.schema("trading").from("trade_mistakes").insert(mistakeLinks);
		if (error) console.error("Mistake links:", error.message);
	}
	if (psychRows.length > 0) {
		const { error } = await supabase.schema("trading").from("trade_psychology").insert(psychRows);
		if (error) console.error("Psychology rows:", error.message);
	}

	return seeds.length;
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	let body: { scopes?: unknown } = {};
	try {
		body = await request.json();
	} catch {
		// Fallthrough; empty body means seed everything (legacy behavior).
	}

	const rawScopes = Array.isArray(body.scopes) ? body.scopes : VALID_SCOPES;
	const scopes = rawScopes.filter((s): s is Scope => VALID_SCOPES.includes(s as Scope));
	if (scopes.length === 0) {
		return json({ success: false, message: "Pick at least one category to seed." }, { status: 400 });
	}

	const uid = user.id;
	const summary: string[] = [];

	try {
		// Run in dependency order regardless of user input order.
		if (scopes.includes("instruments")) {
			const n = await seedInstruments(supabase, uid);
			summary.push(`${n} instruments`);
		}
		if (scopes.includes("playbook")) {
			const { strategies, mistakes } = await seedPlaybook(supabase, uid);
			summary.push(`${strategies} strategies`, `${mistakes} mistakes`);
		}
		if (scopes.includes("accounts")) {
			const n = await seedAccounts(supabase, uid);
			summary.push(`${n} accounts + payout`);
		}
		if (scopes.includes("trades")) {
			const n = await seedTrades(supabase, uid);
			summary.push(`${n} trades`);
		}

		return json({ success: true, message: `Seeded: ${summary.join(", ")}.` });
	} catch (e) {
		console.error("Seed error:", e);
		return json(
			{ success: false, message: e instanceof Error ? e.message : "Seed failed." },
			{ status: 500 }
		);
	}
};
