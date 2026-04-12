import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAuthToken(supabase: SupabaseClient) {
	const { data } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	if (!token) {
		throw new Error("No authentication token found");
	}
	return token;
}