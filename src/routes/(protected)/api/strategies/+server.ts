import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("strategies")
		.select("*")
		.eq("user_id", user.id)
		.order("name", { ascending: true });

	if (error) {
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data, message: "Strategies fetched successfully." });
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as { name?: string; description?: string | null };
	const name = body.name?.trim();
	if (!name) {
		return json({ success: false, message: "Name is required." }, { status: 400 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("strategies")
		.insert({ user_id: user.id, name, description: body.description ?? null })
		.select()
		.single();

	if (error) {
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data, message: "Strategy created successfully." });
};
