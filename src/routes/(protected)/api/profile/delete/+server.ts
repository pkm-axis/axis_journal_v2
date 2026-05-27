import { json } from "@sveltejs/kit";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { SUPABASE_SERVICE_ROLE_KEY } from "$env/static/private";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const admin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false },
	});

	const { error } = await admin.auth.admin.deleteUser(user.id);
	if (error) {
		return json({ success: false, message: error.message }, { status: 400 });
	}

	await supabase.auth.signOut();
	return json({ success: true, message: "Account deleted." });
};
