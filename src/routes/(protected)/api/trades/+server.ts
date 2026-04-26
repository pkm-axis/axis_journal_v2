import { json } from '@sveltejs/kit'

export async function GET({ url, locals: { supabase, safeGetSession } }) {
    const { session, user } =await safeGetSession();
    const accountId = url.searchParams.get("accountId");

    if (!session || !user) {
        return json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
        .schema("trading")
        .from("trades")
        .select("*, trade_strategies(strategy_id), trade_mistakes(mistake_id)")
        .eq("user_id", user.id)
        .eq("account_id", accountId)
        .order("opened_at", { ascending: false });

    if (error) {
        console.log("Error:", error)
        return json({
            success: false,
            message: error.message
        }, { status: 400 })
    }

    const flattened = (data ?? []).map((t: Record<string, unknown>) => {
        const sLinks = (t.trade_strategies as { strategy_id: string }[] | null) ?? [];
        const mLinks = (t.trade_mistakes as { mistake_id: string }[] | null) ?? [];
        const { trade_strategies, trade_mistakes, ...rest } = t;
        return {
            ...rest,
            strategy_ids: sLinks.map((l) => l.strategy_id),
            mistake_ids: mLinks.map((l) => l.mistake_id)
        };
    });

    return json({
        success: true,
        data: flattened,
        message: "Accounts fetch successfully."
    });
}