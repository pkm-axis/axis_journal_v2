import { json } from '@sveltejs/kit'

export async function GET({ url, locals: { supabase, safeGetSession } }) {
    const { session, user } = await safeGetSession();
    const accountId = url.searchParams.get("accountId");
    const sessionId = url.searchParams.get("sessionId");

    if (!session || !user) {
        return json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!accountId && !sessionId) {
        return json({ success: false, message: "accountId or sessionId required" }, { status: 400 });
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
        .select("*, trade_mistakes(mistake_id), trade_checklist_responses(item_id), trade_psychology(emotional_states, confidence, mental_state, followed_plan, entry_reason, exit_reason)", { count: "exact" })
        .eq("user_id", user.id)
        .order("opened_at", { ascending: false });

    if (sessionId) {
        query = query.eq("backtest_session_id", sessionId);
    } else {
        query = query.eq("account_id", accountId).is("backtest_session_id", null);
    }

    if (search)         query = query.ilike("symbol", `%${search}%`);
    if (side !== "all") query = query.eq("side", side);
    if (status !== "all") query = query.eq("status", status);

    const { data, count, error } = await query.range(from, to);

    if (error) {
        console.log("Error:", error)
        return json({ success: false, message: error.message }, { status: 400 })
    }

    const flattened = (data ?? []).map((t: Record<string, unknown>) => {
        // A trade carries exactly one strategy since 20260725000000_strategy_checklists
        // moved it onto trades.strategy_id and dropped trading.trade_strategies. The
        // client still speaks `strategy_ids`, so normalize to a 0-or-1 element array.
        const strategyId = (t.strategy_id as string | null) ?? null;
        const mLinks = (t.trade_mistakes  as { mistake_id:  string }[] | null) ?? [];
        const cLinks = (t.trade_checklist_responses as { item_id: string }[] | null) ?? [];
        const psych = (t.trade_psychology as {
            emotional_states: string[] | null;
            confidence: number | null;
            mental_state: string | null;
            followed_plan: "yes" | "no" | "partial" | null;
            entry_reason: string | null;
            exit_reason: string | null;
        } | null) ?? null;
        const { trade_mistakes, trade_checklist_responses, trade_psychology, ...rest } = t;
        return {
            ...rest,
            strategy_ids: strategyId ? [strategyId] : [],
            mistake_ids:  mLinks.map((l) => l.mistake_id),
            checklist_item_ids: cLinks.map((l) => l.item_id),
            emotional_states: psych?.emotional_states ?? [],
            confidence:       psych?.confidence       ?? null,
            mental_state:     psych?.mental_state     ?? null,
            followed_plan:    psych?.followed_plan    ?? null,
            entry_reason:     psych?.entry_reason     ?? null,
            exit_reason:      psych?.exit_reason      ?? null,
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
