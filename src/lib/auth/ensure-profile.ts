import { supabase } from "$lib/supabase/client";

/** Ensures a row exists in `app.profiles` for RLS/FK (trades reference profiles). */
export async function ensureProfile(userId: string): Promise<void> {
	const { data } = await supabase
		.schema("app")
		.from("profiles")
		.select("id")
		.eq("id", userId)
		.maybeSingle();

	if (data) return;

	await supabase.schema("app").from("profiles").insert({ id: userId });
}
