import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { EXPENSE_KINDS, isExpenseKind } from "$lib/utils/expense-kinds";

export const PATCH: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const body = (await request.json()) as Record<string, unknown>;
	const patch: Record<string, unknown> = {};

	if ("kind" in body) {
		if (!isExpenseKind(body.kind)) {
			return json({ success: false, message: `kind must be one of: ${EXPENSE_KINDS.join(", ")}` }, { status: 400 });
		}
		patch.kind = body.kind;
	}

	if ("amount" in body) {
		const value = Number(body.amount);
		if (!Number.isFinite(value) || value < 0) {
			return json({ success: false, message: "Amount must be a positive number." }, { status: 400 });
		}
		patch.amount = value;
	}

	if ("incurred_on" in body) {
		const v = body.incurred_on;
		if (typeof v !== "string" || !v.trim()) {
			return json({ success: false, message: "A date is required." }, { status: 400 });
		}
		patch.incurred_on = v.trim();
	}

	if ("notes" in body) {
		const v = body.notes;
		patch.notes = typeof v === "string" && v.trim() ? v.trim() : null;
	}

	if (Object.keys(patch).length === 0) {
		return json({ success: false, message: "No fields to update" }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("account_expenses")
		.update(patch)
		.eq("id", id)
		.eq("user_id", user.id)
		.select()
		.single();

	if (error) return json({ success: false, message: error.message }, { status: 400 });
	if (!data) return json({ success: false, message: "Expense not found" }, { status: 404 });

	return json({ success: true, data });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const { error } = await supabase
		.schema("trading")
		.from("account_expenses")
		.delete()
		.eq("id", id)
		.eq("user_id", user.id);

	if (error) return json({ success: false, message: error.message }, { status: 400 });

	return json({ success: true });
};
