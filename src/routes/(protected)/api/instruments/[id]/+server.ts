import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const body = (await request.json()) as Record<string, unknown>;
	const patch: Record<string, unknown> = {};

	if (typeof body.symbol === "string") patch.symbol = body.symbol.trim().toUpperCase();
	if (typeof body.exchange === "string") patch.exchange = body.exchange.trim();
	if (typeof body.market_type === "string") patch.market_type = body.market_type.trim();
	if (typeof body.base_currency === "string") patch.base_currency = body.base_currency.trim();
	if (typeof body.quote_currency === "string") patch.quote_currency = body.quote_currency.trim();
	if ("contract_size" in body) {
		const n = Number(body.contract_size);
		if (!Number.isFinite(n) || n <= 0) return json({ success: false, message: "Contract size must be > 0" }, { status: 400 });
		patch.contract_size = n;
	}
	if ("tick_size" in body) {
		const n = Number(body.tick_size);
		if (!Number.isFinite(n) || n <= 0) return json({ success: false, message: "Tick size must be > 0" }, { status: 400 });
		patch.tick_size = n;
	}
	if ("tick_value" in body) {
		const n = Number(body.tick_value);
		if (!Number.isFinite(n) || n <= 0) return json({ success: false, message: "Tick value must be > 0" }, { status: 400 });
		patch.tick_value = n;
	}
	if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

	if (Object.keys(patch).length === 0) {
		return json({ success: false, message: "No fields to update" }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("instruments")
		.update(patch)
		.eq("id", id)
		.eq("user_id", user.id)
		.select()
		.single();

	if (error) return json({ success: false, message: error.message }, { status: 400 });
	if (!data) return json({ success: false, message: "Instrument not found" }, { status: 404 });

	return json({ success: true, data, message: "Instrument updated successfully." });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const { error } = await supabase
		.schema("trading")
		.from("instruments")
		.delete()
		.eq("id", id)
		.eq("user_id", user.id);

	if (error) return json({ success: false, message: error.message }, { status: 400 });
	return json({ success: true, message: "Instrument deleted successfully." });
};
