import { json } from '@sveltejs/kit';

export async function POST({ request, locals: { supabase, safeGetSession } }) {
    const { session, user } = await safeGetSession();

    if (!session || !user) {
        return json({ success: false, message: 'Unauthorized'}, { status: 401 });
    }

    const body = await request.json();

    const {
        account_id,
        instrument_id,
        symbol,
        side,
        status,
        entry_price,
        exit_price,
        quantity,
        stop_loss,
        take_profit,
        risk,
        pnl,
        opened_at,
        closed_at,
        notes,
        strategy_ids,
        mistake_ids
    } = body;

    const { data, error } = await supabase
        .schema('trading')
        .from('trades')
        .insert([
            {
                user_id: user.id,
                account_id,
                instrument_id,
                symbol,
                side,
                status,
                entry_price,
                exit_price,
                quantity,
                stop_loss,
                take_profit,
                risk,
                pnl,
                opened_at,
                closed_at,
                notes
            }
        ])
        .select()
        .single();

    if (error) {
        console.log("Error:", error);
        return json({
            success: false,
            message: error.message
        }, { status: 400 })
    }

    if (Array.isArray(strategy_ids) && strategy_ids.length > 0) {
        const rows = strategy_ids
            .filter((sid: unknown): sid is string => typeof sid === "string" && sid.length > 0)
            .map((strategy_id: string) => ({ trade_id: data.id, strategy_id }));
        if (rows.length > 0) {
            const { error: linkErr } = await supabase
                .schema("trading")
                .from("trade_strategies")
                .insert(rows);
            if (linkErr) console.log("Strategy link error:", linkErr);
        }
    }

    if (status === "closed" && Array.isArray(mistake_ids) && mistake_ids.length > 0) {
        const rows = mistake_ids
            .filter((mid: unknown): mid is string => typeof mid === "string" && mid.length > 0)
            .map((mistake_id: string) => ({ trade_id: data.id, mistake_id }));
        if (rows.length > 0) {
            const { error: linkErr } = await supabase
                .schema("trading")
                .from("trade_mistakes")
                .insert(rows);
            if (linkErr) console.log("Mistake link error:", linkErr);
        }
    }

    return json({ success: true, data, message: "Trade created successfully." });
}