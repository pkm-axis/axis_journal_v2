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
	"notes",
	"screenshot_url"
] as const;

const psychKeys = ["emotional_states", "confidence", "mental_state", "followed_plan"] as const;

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

	const psychPatch: Record<string, unknown> = {};
	for (const k of psychKeys) {
		if (k in body) psychPatch[k] = body[k];
	}
	if (Object.keys(psychPatch).length > 0) {
		const { error: psychErr } = await supabase
			.schema("trading")
			.from("trade_psychology")
			.upsert({ trade_id: id, ...psychPatch, updated_at: new Date().toISOString() });
		if (psychErr) console.log("Psychology upsert error:", psychErr);
	}

	if (Array.isArray(body.strategy_ids)) {
		const desired = new Set(
			(body.strategy_ids as unknown[]).filter(
				(sid): sid is string => typeof sid === "string" && sid.length > 0
			)
		);

		const { data: existing } = await supabase
			.schema("trading")
			.from("trade_strategies")
			.select("strategy_id")
			.eq("trade_id", id);

		const current = new Set(
			(existing ?? []).map((r: { strategy_id: string }) => r.strategy_id)
		);
		const toAdd = [...desired].filter((s) => !current.has(s));
		const toRemove = [...current].filter((s): s is string => !desired.has(s as string));

		if (toRemove.length > 0) {
			await supabase
				.schema("trading")
				.from("trade_strategies")
				.delete()
				.eq("trade_id", id)
				.in("strategy_id", toRemove);
		}
		if (toAdd.length > 0) {
			await supabase
				.schema("trading")
				.from("trade_strategies")
				.insert(toAdd.map((strategy_id) => ({ trade_id: id, strategy_id })));
		}
	}

	if (Array.isArray(body.mistake_ids)) {
		const desired = new Set(
			(body.mistake_ids as unknown[]).filter(
				(mid): mid is string => typeof mid === "string" && mid.length > 0
			)
		);

		const { data: existing } = await supabase
			.schema("trading")
			.from("trade_mistakes")
			.select("mistake_id")
			.eq("trade_id", id);

		const current = new Set(
			(existing ?? []).map((r: { mistake_id: string }) => r.mistake_id)
		);
		const toAdd = [...desired].filter((m) => !current.has(m));
		const toRemove = [...current].filter((m): m is string => !desired.has(m as string));

		if (toRemove.length > 0) {
			await supabase
				.schema("trading")
				.from("trade_mistakes")
				.delete()
				.eq("trade_id", id)
				.in("mistake_id", toRemove);
		}
		if (toAdd.length > 0) {
			await supabase
				.schema("trading")
				.from("trade_mistakes")
				.insert(toAdd.map((mistake_id) => ({ trade_id: id, mistake_id })));
		}
	}

	return json({ success: true, data, message: "Trade updated successfully." });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();

	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const id = params.id?.trim();
	if (!id) {
		return json({ success: false, message: "Missing trade id" }, { status: 400 });
	}

	const { error } = await supabase
		.schema("trading")
		.from("trades")
		.delete()
		.eq("id", id)
		.eq("user_id", user.id);

	if (error) {
		console.log("Error:", error);
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, message: "Trade deleted successfully." });
};
