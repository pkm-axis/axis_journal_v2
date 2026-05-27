import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Catalog rows themselves are global and managed via migrations. Users only
 * patch their own `user_instruments` override row (commission, is_active).
 */
export const PATCH: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const body = (await request.json()) as Record<string, unknown>;

	const patch: { commission_per_side?: number; is_active?: boolean } = {};
	if ("commission_per_side" in body) {
		const raw = body.commission_per_side;
		const n = raw == null || raw === "" ? 0 : Number(raw);
		if (!Number.isFinite(n) || n < 0)
			return json({ success: false, message: "Commission must be >= 0" }, { status: 400 });
		patch.commission_per_side = n;
	}
	if (typeof body.is_active === "boolean") {
		patch.is_active = body.is_active;
	}
	if (Object.keys(patch).length === 0) {
		return json({ success: false, message: "No fields to update" }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("user_instruments")
		.upsert(
			{ user_id: user.id, instrument_id: id, updated_at: new Date().toISOString(), ...patch },
			{ onConflict: "user_id,instrument_id" }
		)
		.select()
		.single();

	if (error) return json({ success: false, message: error.message }, { status: 400 });
	return json({ success: true, data, message: "Instrument preference updated." });
};
