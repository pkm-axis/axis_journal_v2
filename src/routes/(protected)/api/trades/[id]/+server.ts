import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const updatableKeys = [
	"instrument_id",
	"symbol",
	"side",
	"status",
	"entry_price",
	"exit_price",
	"quantity",
	"stop_loss",
	"take_profit",
	"risk",
	"pnl",
	"opened_at",
	"closed_at",
	"notes"
] as const;

type UpdatableKey = (typeof updatableKeys)[number];

export const PATCH: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();

	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const id = params.id?.trim();
	if (!id) {
		return json({ success: false, message: "Missing trade id" }, { status: 400 });
	}

	const body = (await request.json()) as Record<string, unknown>;
	const patch: Partial<Record<UpdatableKey, unknown>> = {};

	for (const key of updatableKeys) {
		if (key in body) {
			patch[key] = body[key];
		}
	}

	if (Object.keys(patch).length === 0) {
		return json({ success: false, message: "No fields to update" }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("trades")
		.update(patch)
		.eq("id", id)
		.eq("user_id", user.id)
		.select()
		.single();

	if (error) {
		console.log("Error:", error);
		return json({ success: false, message: error.message }, { status: 400 });
	}

	if (!data) {
		return json({ success: false, message: "Trade not found" }, { status: 404 });
	}

	return json({ success: true, data, message: "Trade updated successfully." });
};
