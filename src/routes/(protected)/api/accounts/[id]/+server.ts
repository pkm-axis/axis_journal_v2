import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	// Block edits to graduated evals (an account is "graduated" if another account points to it).
	const { count } = await supabase
		.schema("trading")
		.from("accounts")
		.select("id", { count: "exact", head: true })
		.eq("user_id", user.id)
		.eq("parent_account_id", id);
	if ((count ?? 0) > 0) {
		return json({ success: false, message: "This account has been graduated and is locked from editing." }, { status: 403 });
	}

	const body = (await request.json()) as Record<string, unknown>;
	const patch: Record<string, unknown> = {};
	const stringFields = [
		"name",
		"account_type",
		"prop_firm_name",
		"prop_firm_type",
		"prop_firm_consistency_rule",
		"prop_firm_max_contracts",
	];
	const numberFields = [
		"starting_balance",
		"prop_firm_profit_target",
		"prop_firm_max_drawdown",
		"prop_firm_daily_loss_limit",
		"challenge_cost",
		"profit_split",
	];
	for (const f of stringFields) {
		if (f in body) {
			const v = body[f];
			patch[f] = typeof v === "string" ? v.trim() || null : null;
		}
	}
	for (const f of numberFields) {
		if (f in body) {
			const v = body[f];
			patch[f] = v === null || v === "" || v === undefined ? null : Number(v);
		}
	}

	// Null fields that aren't permitted for the target account_type, to satisfy CHECK constraint.
	// Paper trading keeps profit target and max drawdown only.
	if (patch.account_type === "paper trading") {
		patch.prop_firm_name = null;
		patch.prop_firm_type = null;
		patch.prop_firm_daily_loss_limit = null;
		patch.prop_firm_consistency_rule = null;
		patch.prop_firm_max_contracts = null;
		patch.challenge_cost = null;
	} else if (patch.account_type && patch.account_type !== "prop firm") {
		patch.prop_firm_name = null;
		patch.prop_firm_type = null;
		patch.prop_firm_profit_target = null;
		patch.prop_firm_max_drawdown = null;
		patch.prop_firm_daily_loss_limit = null;
		patch.prop_firm_consistency_rule = null;
		patch.prop_firm_max_contracts = null;
		patch.challenge_cost = null;
	}

	if (Object.keys(patch).length === 0) {
		return json({ success: false, message: "No fields to update" }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("accounts")
		.update(patch)
		.eq("id", id)
		.eq("user_id", user.id)
		.select()
		.single();

	if (error) return json({ success: false, message: error.message }, { status: 400 });
	if (!data) return json({ success: false, message: "Account not found" }, { status: 404 });

	return json({ success: true, data, message: "Account updated successfully." });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const { count } = await supabase
		.schema("trading")
		.from("accounts")
		.select("id", { count: "exact", head: true })
		.eq("user_id", user.id)
		.eq("parent_account_id", id);
	if ((count ?? 0) > 0) {
		return json({ success: false, message: "This account has been graduated and is locked from deletion." }, { status: 403 });
	}

	const { error } = await supabase
		.schema("trading")
		.from("accounts")
		.delete()
		.eq("id", id)
		.eq("user_id", user.id);

	if (error) return json({ success: false, message: error.message }, { status: 400 });

	return json({ success: true, message: "Account deleted successfully." });
};
