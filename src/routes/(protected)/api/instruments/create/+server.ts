import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as Record<string, unknown>;

	const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
	const exchange = typeof body.exchange === "string" ? body.exchange.trim() : "";
	const market_type = typeof body.market_type === "string" ? body.market_type.trim() : "futures";
	const base_currency = typeof body.base_currency === "string" ? body.base_currency.trim() : "USD";
	const quote_currency = typeof body.quote_currency === "string" ? body.quote_currency.trim() : "USD";

	const contract_size = Number(body.contract_size);
	const tick_size = Number(body.tick_size);
	const tick_value = Number(body.tick_value);

	if (!symbol) return json({ success: false, message: "Symbol is required" }, { status: 400 });
	if (!Number.isFinite(contract_size) || contract_size <= 0)
		return json({ success: false, message: "Contract size must be > 0" }, { status: 400 });
	if (!Number.isFinite(tick_size) || tick_size <= 0)
		return json({ success: false, message: "Tick size must be > 0" }, { status: 400 });
	if (!Number.isFinite(tick_value) || tick_value <= 0)
		return json({ success: false, message: "Tick value must be > 0" }, { status: 400 });

	const insert = {
		user_id: user.id,
		symbol,
		exchange,
		market_type,
		base_currency,
		quote_currency,
		contract_size,
		tick_size,
		tick_value,
		is_active: true,
	};

	const { data, error } = await supabase
		.schema("trading")
		.from("instruments")
		.insert(insert)
		.select()
		.single();

	if (error) return json({ success: false, message: error.message }, { status: 400 });
	return json({ success: true, data, message: "Instrument created successfully." });
};
