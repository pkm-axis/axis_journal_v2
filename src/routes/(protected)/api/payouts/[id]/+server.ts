import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const VALID_STATUSES = ["requested", "pending", "approved", "received"] as const;

export const PATCH: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const { status } = await request.json();
	if (!VALID_STATUSES.includes(status)) {
		return json({ success: false, message: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("payouts")
		.update({ status })
		.eq("id", id)
		.eq("user_id", user.id)
		.select()
		.single();

	if (error) return json({ success: false, message: error.message }, { status: 400 });
	if (!data) return json({ success: false, message: "Payout not found" }, { status: 404 });

	return json({ success: true, data });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const { error } = await supabase
		.schema("trading")
		.from("payouts")
		.delete()
		.eq("id", id)
		.eq("user_id", user.id);

	if (error) return json({ success: false, message: error.message }, { status: 400 });

	return json({ success: true });
};
