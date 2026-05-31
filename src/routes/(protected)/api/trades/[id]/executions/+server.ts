import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type IncomingExecution = {
	kind: "entry" | "exit";
	quantity: number;
	price: number;
	fees?: number;
	stop_loss?: number | null;
	take_profit?: number | null;
	executed_at: string;
	reason?: string | null;
	notes?: string | null;
};

async function ensureTradeOwned(
	supabase: App.Locals["supabase"],
	tradeId: string,
	userId: string
): Promise<boolean> {
	const { data } = await supabase
		.schema("trading")
		.from("trades")
		.select("id")
		.eq("id", tradeId)
		.eq("user_id", userId)
		.maybeSingle();
	return !!data;
}

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const tradeId = params.id?.trim();
	if (!tradeId) {
		return json({ success: false, message: "Missing trade id" }, { status: 400 });
	}

	if (!(await ensureTradeOwned(supabase, tradeId, user.id))) {
		return json({ success: false, message: "Trade not found" }, { status: 404 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("trade_executions")
		.select("*")
		.eq("trade_id", tradeId)
		.order("executed_at", { ascending: true });

	if (error) {
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data });
};

export const PUT: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const tradeId = params.id?.trim();
	if (!tradeId) {
		return json({ success: false, message: "Missing trade id" }, { status: 400 });
	}

	if (!(await ensureTradeOwned(supabase, tradeId, user.id))) {
		return json({ success: false, message: "Trade not found" }, { status: 404 });
	}

	const body = (await request.json()) as { executions?: IncomingExecution[] };
	const incoming = Array.isArray(body.executions) ? body.executions : [];

	const rows = incoming
		.filter(
			(e) =>
				(e.kind === "entry" || e.kind === "exit") &&
				Number.isFinite(e.quantity) && e.quantity > 0 &&
				Number.isFinite(e.price) &&
				typeof e.executed_at === "string" && e.executed_at.length > 0
		)
		.map((e) => ({
			trade_id: tradeId,
			user_id: user.id,
			kind: e.kind,
			quantity: e.quantity,
			price: e.price,
			fees: e.fees ?? 0,
			stop_loss: e.stop_loss ?? null,
			take_profit: e.take_profit ?? null,
			executed_at: e.executed_at,
			reason: e.reason ?? null,
			notes: e.notes ?? null,
		}));

	const { error: delErr } = await supabase
		.schema("trading")
		.from("trade_executions")
		.delete()
		.eq("trade_id", tradeId);

	if (delErr) {
		return json({ success: false, message: delErr.message }, { status: 400 });
	}

	if (rows.length === 0) {
		return json({ success: true, data: [], message: "Executions cleared." });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("trade_executions")
		.insert(rows)
		.select();

	if (error) {
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data, message: "Executions replaced." });
};
