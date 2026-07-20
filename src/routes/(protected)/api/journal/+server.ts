import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

type IncomingEntry = {
	entry_date?: string;
	rating?: number | null;
	what_went_well?: string | null;
	what_went_wrong?: string | null;
	lessons?: string | null;
};

/** "YYYY-MM-DD" (date-only). */
function isValidDate(v: unknown): v is string {
	return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function clampRating(v: unknown): number | null {
	const n = typeof v === "number" ? v : Number(v);
	if (!Number.isFinite(n)) return null;
	const r = Math.round(n);
	return r >= 1 && r <= 5 ? r : null;
}

function trimOrNull(v: unknown): string | null {
	if (typeof v !== "string") return null;
	const t = v.trim();
	return t.length > 0 ? t : null;
}

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const { data, error } = await supabase
		.schema("trading")
		.from("daily_journal")
		.select("*")
		.eq("user_id", user.id)
		.order("entry_date", { ascending: false });

	if (error) {
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data, message: "Journal entries fetched successfully." });
};

export const PUT: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		return json({ success: false, message: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as IncomingEntry;
	if (!isValidDate(body.entry_date)) {
		return json({ success: false, message: "A valid entry_date (YYYY-MM-DD) is required." }, { status: 400 });
	}

	const row = {
		user_id: user.id,
		entry_date: body.entry_date,
		rating: clampRating(body.rating),
		what_went_well: trimOrNull(body.what_went_well),
		what_went_wrong: trimOrNull(body.what_went_wrong),
		lessons: trimOrNull(body.lessons),
		updated_at: new Date().toISOString(),
	};

	const { data, error } = await supabase
		.schema("trading")
		.from("daily_journal")
		.upsert(row, { onConflict: "user_id,entry_date" })
		.select()
		.single();

	if (error) {
		return json({ success: false, message: error.message }, { status: 400 });
	}

	return json({ success: true, data, message: "Journal entry saved." });
};
