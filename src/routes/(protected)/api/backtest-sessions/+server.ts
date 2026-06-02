import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
    const { session, user } = await safeGetSession();
    if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

    const includeArchived = url.searchParams.get("includeArchived") === "true";

    let query = supabase
        .schema("trading")
        .from("backtest_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (!includeArchived) query = query.eq("archived", false);

    const { data: sessions, error } = await query;
    if (error) return json({ success: false, message: error.message }, { status: 400 });

    const ids = (sessions ?? []).map((s: { id: string }) => s.id);
    let stats = new Map<string, { trade_count: number; net_pnl: number; wins: number; closed: number }>();
    if (ids.length > 0) {
        const { data: trades } = await supabase
            .schema("trading")
            .from("trades")
            .select("backtest_session_id, status, pnl")
            .in("backtest_session_id", ids);
        for (const t of trades ?? []) {
            const sid = (t as { backtest_session_id: string }).backtest_session_id;
            const row = stats.get(sid) ?? { trade_count: 0, net_pnl: 0, wins: 0, closed: 0 };
            row.trade_count += 1;
            const pnl = Number((t as { pnl: string | number | null }).pnl ?? 0);
            if ((t as { status: string }).status === "closed") {
                row.closed += 1;
                row.net_pnl += Number.isFinite(pnl) ? pnl : 0;
                if (pnl > 0) row.wins += 1;
            }
            stats.set(sid, row);
        }
    }

    const enriched = (sessions ?? []).map((s: { id: string } & Record<string, unknown>) => {
        const st = stats.get(s.id);
        return {
            ...s,
            trade_count: st?.trade_count ?? 0,
            net_pnl: st?.net_pnl ?? 0,
            win_rate: st && st.closed > 0 ? st.wins / st.closed : null,
        };
    });

    return json({ success: true, data: enriched });
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
    const { session, user } = await safeGetSession();
    if (!session || !user) return json({ success: false, message: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return json({ success: false, message: "Name is required" }, { status: 400 });

    const { data, error } = await supabase
        .schema("trading")
        .from("backtest_sessions")
        .insert({
            user_id: user.id,
            name,
            description: body.description ?? null,
            instrument_id: body.instrument_id ?? null,
            starting_balance: body.starting_balance ?? null,
            max_loss_limit: body.max_loss_limit ?? null,
            period_start: body.period_start ?? null,
            period_end: body.period_end ?? null,
            notes: body.notes ?? null,
        })
        .select()
        .single();

    if (error) return json({ success: false, message: error.message }, { status: 400 });
    return json({ success: true, data });
};
