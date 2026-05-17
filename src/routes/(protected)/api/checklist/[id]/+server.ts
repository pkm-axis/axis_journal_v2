import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const body = (await request.json()) as { label?: string; sort_order?: number };
	const patch: Record<string, unknown> = {};
	if (typeof body.label === "string") patch.label = body.label.trim();
	if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;

	if (Object.keys(patch).length === 0) {
		return json({ success: false, message: "No fields to update" }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("checklist_items")
		.update(patch)
		.eq("id", id)
		.eq("user_id", user.id)
		.select()
		.single();

	if (error) return json({ success: false, message: error.message }, { status: 400 });
	if (!data) return json({ success: false, message: "Checklist item not found" }, { status: 404 });

	return json({ success: true, data, message: "Checklist item updated." });
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
		.from("checklist_items")
		.delete()
		.eq("id", id)
		.eq("user_id", user.id);

	if (error) return json({ success: false, message: error.message }, { status: 400 });

	return json({ success: true, message: "Checklist item deleted." });
};
