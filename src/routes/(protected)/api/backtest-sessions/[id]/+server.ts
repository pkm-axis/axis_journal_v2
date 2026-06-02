import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const updatable = [
    "name",
    "description",
    "instrument_id",
    "starting_balance",
    "max_loss_limit",
    "period_start",
    "period_end",
    "notes",
    "archived",
] as const;

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
    const { session, user } = await safeGetSession();
    if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

    const id = params.id?.trim();
    if (!id) return json({ success: false, message: "Missing session id" }, { status: 400 });

    const { data, error } = await supabase
        .schema("trading")
        .from("backtest_sessions")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

    if (error) return json({ success: false, message: error.message }, { status: 400 });
    if (!data) return json({ success: false, message: "Session not found" }, { status: 404 });
    return json({ success: true, data });
};

export const PATCH: RequestHandler = async ({ params, request, locals: { supabase, safeGetSession } }) => {
    const { session, user } = await safeGetSession();
    if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

    const id = params.id?.trim();
    if (!id) return json({ success: false, message: "Missing session id" }, { status: 400 });

    const body = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of updatable) {
        if (key in body) patch[key] = body[key];
    }

    if (Object.keys(patch).length === 1) {
        return json({ success: false, message: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
        .schema("trading")
        .from("backtest_sessions")
        .update(patch)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

    if (error) return json({ success: false, message: error.message }, { status: 400 });
    return json({ success: true, data });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
    const { session, user } = await safeGetSession();
    if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

    const id = params.id?.trim();
    if (!id) return json({ success: false, message: "Missing session id" }, { status: 400 });

    const { error } = await supabase
        .schema("trading")
        .from("backtest_sessions")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) return json({ success: false, message: error.message }, { status: 400 });
    return json({ success: true });
};
