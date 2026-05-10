import { json } from '@sveltejs/kit'

export async function GET({ url, locals: { supabase, safeGetSession } }) {
    const { session, user } = await safeGetSession();
    const accountId = url.searchParams.get("accountId");

    if (!session || !user) {
        return json({ error: 'Unauthorized' }, { status: 401 })
    }

    const page     = Math.max(1, parseInt(url.searchParams.get("page")     ?? "1",  10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "10", 10)));
    const search   = url.searchParams.get("search")?.trim() ?? "";
    const side     = url.searchParams.get("side")   ?? "all";
    const status   = url.searchParams.get("status") ?? "all";

    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;

    let query = supabase
        .schema("trading")
        .from("trades")
        .select("*, trade_strategies(strategy_id), trade_mistakes(mistake_id)", { count: "exact" })
        .eq("user_id", user.id)
        .eq("account_id", accountId)
        .order("opened_at", { ascending: false });

    if (search)         query = query.ilike("symbol", `%${search}%`);
    if (side !== "all") query = query.eq("side", side);
    if (status !== "all") query = query.eq("status", status);

    const { data, count, error } = await query.range(from, to);

    if (error) {
        console.log("Error:", error)
        return json({ success: false, message: error.message }, { status: 400 })
    }

    const flattened = (data ?? []).map((t: Record<string, unknown>) => {
        const sLinks = (t.trade_strategies as { strategy_id: string }[] | null) ?? [];
        const mLinks = (t.trade_mistakes  as { mistake_id:  string }[] | null) ?? [];
        const { trade_strategies, trade_mistakes, ...rest } = t;
        return {
            ...rest,
            strategy_ids: sLinks.map((l) => l.strategy_id),
            mistake_ids:  mLinks.map((l) => l.mistake_id),
        };
    });

    return json({
        success: true,
        data: flattened,
        total: count ?? 0,
        page,
        pageSize,
    });
}
