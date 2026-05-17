import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("checklist_items")
		.select("*")
		.eq("user_id", user.id)
		.order("sort_order", { ascending: true })
		.order("created_at", { ascending: true });

	if (error) {
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data, message: "Checklist items fetched." });
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as { label?: string; sort_order?: number };
	const label = body.label?.trim();
	if (!label) {
		return json({ success: false, message: "Label is required." }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("checklist_items")
		.insert({ user_id: user.id, label, sort_order: body.sort_order ?? 0 })
		.select()
		.single();

	if (error) {
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data, message: "Checklist item created." });
};
