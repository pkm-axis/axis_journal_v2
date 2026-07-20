import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const id = params.id?.trim();
	if (!id) return json({ success: false, message: "Missing id" }, { status: 400 });

	const { error } = await supabase
		.schema("trading")
		.from("daily_journal")
		.delete()
		.eq("id", id)
		.eq("user_id", user.id);

	if (error) return json({ success: false, message: error.message }, { status: 400 });

	return json({ success: true, message: "Journal entry deleted." });
};
