import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * Deletes all of the user's trades. Strategies, mistakes, accounts, and
 * instruments are kept — they are catalog/configuration, not journal entries.
 */
export const DELETE: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const { error } = await supabase
		.schema("trading")
		.from("trades")
		.delete()
		.eq("user_id", user.id);

	if (error) return json({ success: false, message: error.message }, { status: 400 });
	return json({ success: true, message: "All trades deleted." });
};
